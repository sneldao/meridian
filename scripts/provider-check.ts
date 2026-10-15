// Provider smoke check: exercises a real tool call through resolveModel for a
// given AGENT_PROVIDER — verifies the OpenAI-compatible wiring end to end,
// including JSON-schema tool-call fidelity (the Nemotron risk point).
// Usage: AGENT_PROVIDER=nebius bun scripts/provider-check.ts

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { resolveModel, providerKind } from "../src/agents/providers";

const kind = providerKind();
if (kind === "replay") {
  console.error("AGENT_PROVIDER= replay — nothing to check");
  process.exit(1);
}

const model = resolveModel("specialist", kind);
console.log(`provider=${kind} — forcing one tool call...`);

const result = await generateText({
  model,
  prompt: "Check the weather in Tokyo by calling getWeather. Do not answer directly.",
  tools: {
    getWeather: tool({
      description: "Get weather for a city",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, tempC: 22 }),
    }),
  },
  stopWhen: stepCountIs(3),
  temperature: 0.2,
});

const calls = result.steps.flatMap((s) => s.toolCalls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`));
const outputs = result.steps.flatMap((s) => s.toolResults.map((r) => JSON.stringify(r.output)));
console.log("toolCalls:", calls.length ? calls.join(", ") : "NONE — model did not call the tool");
console.log("toolResults:", outputs.join(", "));
console.log("finalText:", result.text.slice(0, 200));
process.exit(calls.length ? 0 : 1);
