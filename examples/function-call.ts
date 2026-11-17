import "dotenv/config"
import { initAgentModule, resolveAgentModule } from "../src"
import type { ToolDefinition } from "../src"
import { runLoop } from "./run-loop"

// A tool the model can call. The tool call runs at its own breakpoint, between two inferences.
// Needs ANTHROPIC_API_KEY (or set MODEL to a model of another provider and its key).

const getWeather: ToolDefinition = {
	name: "get_weather",
	description: "Get the current weather of a city.",
	parameters: {
		type: "object",
		properties: { city: { type: "string", description: "Name of the city" } },
		required: ["city"],
		additionalProperties: false,
	},
	strict: true,
}

async function main() {
	initAgentModule()
	const { createAgent, createLoop, registerTool } = resolveAgentModule()

	registerTool("get_weather", {
		invoke: ({ city }) => ({ city, forecast: "sunny", temperatureC: 21 }),
	})

	const agent = await createAgent({
		name: "assistant",
		instruction: "You are a helpful assistant.",
		tools: [getWeather],
	})
	const goal = "What is the weather in Novi Sad?"
	const loop = await createLoop({ agentId: agent.id, goal })

	const answer = await runLoop({ loopId: loop.id, goal, tools: [getWeather] })
	console.log(answer)
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
