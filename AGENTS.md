<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Base44 Development Environment Notes

- **Compose Stack (`docker-compose.base44.yml`)**:
  - `falkordb`: Local FalkorDB (`falkordb/falkordb:latest`) on port `6379` backing cross-run graph memory (`FALKORDB_URL=falkor://falkordb:6379`).
  - `seed-graph`: One-shot job that installs dependencies with `bun install --frozen-lockfile` and seeds both `meridian:demo` and `meridian:other` graphs before `web` starts.
  - `web`: Runs on `node:22` with `bun@1.2.17` copied in. Important: `next dev` (Next 16.4.1 / Turbopack) must run under real Node.js (`./node_modules/.bin/next dev`) rather than Bun's node fallback shim so `serverExternalPackages: ["falkordb"]` resolves external module chunks properly.
- **Sandbox Flag (`BASE44_PREVIEW_MODE`)**:
  - In `next.config.ts`, `allowedDevOrigins` is set to `[\`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}\`]` only when `process.env.BASE44_PREVIEW_MODE === "1"` and `BASE44_PUBLIC_HOST_SUFFIX` is present. When `BASE44_PREVIEW_MODE` is unset or any other value, `next.config.ts` preserves its original configuration.
- **Secrets & Defaults (`.env.base44-defaults`)**:
  - `.env.base44-defaults` sets `AGENT_PROVIDER=replay` and `NEXT_PUBLIC_AGENT_PROVIDER=replay` so the app runs out-of-the-box with zero external API keys, while `/run/base44/app.env` is loaded last so any user-supplied provider or API keys (`ANTHROPIC_API_KEY`, `FEATHERLESS_API_KEY`, `NEBIUS_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COMPOSIO_API_KEY`, `TAVILY_API_KEY`, `QLOO_API_KEY`, `FIRECRAWL_API_KEY`) override the defaults.
- **Verification**:
  - Check `curl -fsS http://localhost:3000/` and `curl -fsS http://localhost:3000/api/graph/health`.
  - On a host `next dev` (outside the container), trust the port the server prints: `:3000` can be squatted by an unrelated service on a shared machine and Meridian then takes the next free one. Confirm the body is Meridian before believing a check.
  - CI (`.github/workflows/ci.yml`) runs `bun run typecheck` + `bun test` with no services and no API keys, so a failure there is a real regression rather than a missing local FalkorDB or provider key.
  - Run tests and checks inside the container with `docker compose -f docker-compose.base44.yml exec -T web bun test` and `docker compose -f docker-compose.base44.yml exec -T web bun run typecheck`.
