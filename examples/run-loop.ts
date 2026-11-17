import { resolveAgentModule } from "../src"
import type { ContextItem, ToolCallItem, ToolDefinition } from "../src"

export const MODEL = process.env.MODEL ?? "claude-sonnet-5-5"
// Anthropic requires an output limit on every request, so the examples set one.
export const MAX_OUTPUT_TOKENS = 1024

/**
 * Decides whether a requested tool call may run. Return false to decline it.
 */
export type Approve = (call: ToolCallItem) => Promise<boolean> | boolean

/**
 * Drives a Loop until the model answers with text.
 *
 * Mozaik does not set breakpoints for you: after every response, the application decides what
 * comes next. This helper is the smallest version of that decision:
 *
 *   inference -> the model asked for tools? -> tool call breakpoint(s) -> inference -> ...
 *
 * Replace it with your own logic to change how the Loop is driven.
 */
export async function runLoop(params: {
	loopId: string
	goal: string
	tools?: ToolDefinition[]
	approve?: Approve
}): Promise<string> {
	const { setBreakpoint, advanceLoop, getLoop, endLoop } = resolveAgentModule()
	const context: ContextItem[] = [{ type: "user_message", text: params.goal }]

	while (true) {
		// 1. Inference breakpoint. The request is pending here, so it can be inspected or changed.
		await setBreakpoint({
			loopId: params.loopId,
			instruction: {
				type: "inference",
				parameters: {
					model: MODEL,
					maxOutputTokens: MAX_OUTPUT_TOKENS,
					tools: params.tools,
					context: { items: [...context] },
				},
			},
		})
		await advanceLoop({ loopId: params.loopId })

		const { completedInstructions } = await getLoop(params.loopId)
		const last = completedInstructions[completedInstructions.length - 1]
		if (last?.type !== "inference" || !last.result) {
			throw new Error("Expected a completed inference")
		}

		const items = last.result.items
		context.push(...items)

		const calls = items.filter((item): item is ToolCallItem => item.type === "tool_call")
		if (calls.length === 0) {
			const answer = items.flatMap((item) => (item.type === "model_message" ? [item.text] : [])).join("\n")
			await endLoop({ loopId: params.loopId, message: answer })
			return answer
		}

		// 2. Tool call breakpoints. A Loop holds one pending instruction, so calls run one at a time.
		// Every call needs a result, or the provider rejects the next request.
		for (const call of calls) {
			const allowed = (await params.approve?.(call)) ?? true

			if (!allowed) {
				context.push({
					type: "tool_call_result",
					requestId: call.requestId,
					result: { type: "input_text", text: "The user declined this tool call." },
				})
				continue
			}

			await setBreakpoint({
				loopId: params.loopId,
				instruction: {
					type: "tool_call",
					parameters: { toolName: call.toolName, toolArguments: call.toolArguments },
				},
			})
			await advanceLoop({ loopId: params.loopId })

			const { completedInstructions: done } = await getLoop(params.loopId)
			const finished = done[done.length - 1]
			if (finished?.type !== "tool_call" || !finished.result) {
				throw new Error("Expected a completed tool call")
			}

			context.push({
				type: "tool_call_result",
				requestId: call.requestId,
				result: { type: "input_text", text: finished.result.result },
			})
		}
	}
}
