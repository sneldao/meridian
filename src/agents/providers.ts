import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Provider resolution. Featherless (any open model behind an OpenAI-compatible
// endpoint) is the cheap default; Nebius Token Factory (NVIDIA Nemotron open
// models) is the configured fallback via AGENT_PROVIDER_FALLBACK; Claude is
// the highest-quality crew; replay burns zero tokens and is stage insurance —
// it stays the terminal fallback no matter what the live chain is.

export type ProviderKind = "anthropic" | "featherless" | "nebius" | "replay";

export function providerKind(): ProviderKind {
  const p = process.env.AGENT_PROVIDER;
  if (p === "anthropic" || p === "featherless" || p === "nebius") return p;
  return "replay";
}

// Secondary live provider. If the primary crew run throws, runCrew retries the
// whole run once on this provider before draining the replay transcript. Ignored
// when unset, invalid, or identical to the primary — replay is always the end
// of the chain.
export function providerFallback(): ProviderKind | null {
  const p = process.env.AGENT_PROVIDER_FALLBACK;
  if (p !== "anthropic" && p !== "featherless" && p !== "nebius") return null;
  return p === providerKind() ? null : p;
}

export function resolveModel(
  role: "orchestrator" | "specialist",
  kind: ProviderKind = providerKind(),
): LanguageModel {
  if (kind === "nebius") {
    const nebius = createOpenAICompatible({
      name: "nebius",
      baseURL: process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1",
      apiKey: process.env.NEBIUS_API_KEY,
    });
    return nebius(
      role === "orchestrator"
        ? (process.env.NEBIUS_ORCHESTRATOR_MODEL ?? "nvidia/Nemotron-3-Ultra-550b-a55b")
        : (process.env.NEBIUS_SPECIALIST_MODEL ?? "nvidia/nemotron-3-super-120b-a12b"),
    ) as unknown as LanguageModel;
  }

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
