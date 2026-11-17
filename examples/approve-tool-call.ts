import "dotenv/config"
import { createInterface } from "node:readline/promises"
import { initAgentModule, resolveAgentModule } from "../src"
import type { ToolDefinition } from "../src"
import { runLoop } from "./run-loop"

// Human in the loop: a person approves every tool call before it runs.
// Needs ANTHROPIC_API_KEY (or set MODEL to a model of another provider and its key).

const shell: ToolDefinition = {
	name: "shell",
	description: "Run a shell command and return its output.",
	parameters: {
		type: "object",
		properties: { command: { type: "string", description: "The command to run" } },
		required: ["command"],
		additionalProperties: false,
	},
	strict: true,
}

async function main() {
	initAgentModule()
	const { createAgent, createLoop, registerTool } = resolveAgentModule()

	// Stand-in for a real shell: this example never runs what the model asks for.
	registerTool("shell", {
		invoke: ({ command }) => `(pretend output of: ${command})`,
	})

	const agent = await createAgent({ name: "assistant", instruction: "You are a coding assistant.", tools: [shell] })
	const goal = "Update the project dependencies"
	const loop = await createLoop({ agentId: agent.id, goal })

	const terminal = createInterface({ input: process.stdin, output: process.stdout })

	const answer = await runLoop({
		loopId: loop.id,
		goal,
		tools: [shell],
		// The Loop is paused at the tool call breakpoint until this returns.
		approve: async (call) => {
			console.log(`\nBreakpoint: tool call\nTool: ${call.toolName}\nArguments: ${call.toolArguments}`)
			const reply = await terminal.question("Run it? (y/N) ")
			return reply.trim().toLowerCase() === "y"
		},
	})

	terminal.close()
	console.log(`\n${answer}`)
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
