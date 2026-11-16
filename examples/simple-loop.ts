import "dotenv/config"
import { initAgentModule, resolveAgentModule } from "../src"
import { MODEL } from "./run-loop"

// The smallest Loop: one inference, paused at a breakpoint before it runs.
// Needs ANTHROPIC_API_KEY (or set MODEL to a model of another provider and its key).

async function main() {
	initAgentModule()
	const { createAgent, createLoop, setBreakpoint, advanceLoop, getLoop, endLoop } = resolveAgentModule()

	const agent = await createAgent({ name: "assistant", instruction: "You are a helpful assistant.", tools: [] })
	const loop = await createLoop({ agentId: agent.id, goal: "Explain breakpoints in one sentence." })

	await setBreakpoint({
		loopId: loop.id,
		instruction: {
			type: "inference",
			parameters: {
				model: MODEL,
				context: { items: [{ type: "user_message", text: loop.goal }] },
			},
		},
	})

	// The inference is pending here: inspect it, change it, or don't run it at all.
	console.log("Pending:", (await getLoop(loop.id)).pendingInstruction?.type)

	await advanceLoop({ loopId: loop.id })

	const { completedInstructions } = await getLoop(loop.id)
	console.log(completedInstructions[0]?.result)

	await endLoop({ loopId: loop.id, message: "Explained." })
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
