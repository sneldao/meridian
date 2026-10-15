import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Provider resolution. Claude is the demo path; Featherless (any open model
// behind an OpenAI-compatible endpoint) is for cheap dev iteration; replay
// burns zero tokens and is stage insurance.

export type ProviderKind = "anthropic" | "featherless" | "replay";

export function providerKind(): ProviderKind {
  const p = process.env.AGENT_PROVIDER;
  if (p === "anthropic" || p === "featherless") return p;
  return "replay";
}

export function resolveModel(role: "orchestrator" | "specialist"): LanguageModel {
  const kind = providerKind();

  if (kind === "featherless") {
    const featherless = createOpenAICompatible({
      name: "featherless",
      baseURL: process.env.FEATHERLESS_BASE_URL ?? "https://api.featherless.ai/v1",
      apiKey: process.env.FEATHERLESS_API_KEY,
    });
    return featherless(
      role === "orchestrator"
        ? (process.env.FEATHERLESS_ORCHESTRATOR_MODEL ?? "Qwen/Qwen3-32B")
        : (process.env.FEATHERLESS_SPECIALIST_MODEL ?? "Qwen/Qwen3-32B"),
    ) as unknown as LanguageModel;
  }

  return anthropic(
    role === "orchestrator"
      ? (process.env.MERIDIAN_ORCHESTRATOR_MODEL ?? "claude-sonnet-4-5")
      : (process.env.MERIDIAN_SPECIALIST_MODEL ?? "claude-haiku-4-5"),
  ) as unknown as LanguageModel;
}
