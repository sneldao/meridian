// Self-hosted MCP server for the Amazon Developer Hackathon (Alexa+ track).
// Streamable HTTP transport, protocol 2025-11-25: a single stateless POST
// endpoint answering JSON-RPC 2.0 — no session state, responses are plain
// application/json rather than SSE since the server never pushes.

import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildTrip, isKnownCity, ADHERENCE_PROFILE, GARMIN_BASELINE, CITY_TABLE } from "@/domain/fixtures";
import { evaluatePlan } from "@/domain/circadian";
import { foldCheckIns, parseCheckInText } from "@/domain/adherence";
import { loadMemory, recordCheckIn } from "@/domain/memory";
import { fetchCalendar } from "@/tools/calendar";
import { searchScience } from "@/tools/science";
import { searchTavily, tavilyEnabled } from "@/tools/tavily";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";
import { runCrew } from "@/agents/runtime";
import { providerKind } from "@/agents/providers";
import type { CheckInRequest, DayPlan, Trip } from "@/domain/types";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
const SERVER_INFO = { name: "meridian", version: "0.1.0" };

// --- tool catalogue ---------------------------------------------------------

const cityCode = z
  .string()
  .describe("IATA airport code, e.g. LHR or HND")
  .refine((v) => isKnownCity(v.toUpperCase()), { message: "unknown airport code" })
  .transform((v) => v.toUpperCase());

const isoDate = z
  .string()
  .describe("departure date, YYYY-MM-DD")
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), {
    message: "must be YYYY-MM-DD",
  });

const tripArgs = z.object({
  origin: cityCode.describe("departure city"),
  dest: cityCode.describe("arrival city"),
  date: isoDate,
});

const interventionKind = z.enum([
  "light_exposure",
  "avoid_light",
  "sleep_window",
  "caffeine_cutoff",
  "melatonin",
  "exercise",
  "meal_timing",
  "nap",
]);

const dayPlan = z.object({
  dayIndex: z.number().int().min(0),
  label: z.string(),
  shiftMin: z.number().describe("signed minutes of phase shift; negative = advance (eastward)"),
  targetBedtimeMin: z.number().describe("minutes since local midnight"),
  targetWakeMin: z.number().describe("minutes since local midnight"),
  interventions: z.array(
    z.object({
      kind: interventionKind,
      startMin: z.number().describe("minutes since local midnight"),
      endMin: z.number().optional(),
      note: z.string(),
      citationId: z.string().optional(),
    }),
  ),
});

const checkInInput = z.object({
  text: z.string().optional().describe('free text, e.g. "skipped the 5am light"'),
  dayIndex: z.number().int().min(0).optional(),
  kind: interventionKind.optional(),
  status: z.enum(["done", "partial", "skipped", "harder", "easier"]).optional(),
});

interface McpTool {
  description: string;
  schema: z.ZodType;
  run: (input: unknown) => Promise<unknown>;
}

async function tripFor(args: z.infer<typeof tripArgs>): Promise<{ trip: Trip; calendar: Awaited<ReturnType<typeof fetchCalendar>> }> {
  const trip = buildTrip(args.origin, args.dest, args.date);
  const calendar = await fetchCalendar(trip);
  return { trip, calendar };
}

const TOOLS: Record<string, McpTool> = {
  preview_trip: {
    description:
      "Build a trip between two cities: required circadian shift, direction, plan days, calendar conflicts, wearable baseline and adherence profile. No crew run — instant.",
    schema: tripArgs,
    run: async (raw) => {
      const args = tripArgs.parse(raw);
      if (args.origin === args.dest) throw new Error("origin and destination are the same");
      const { trip, calendar } = await tripFor(args);
      return {
        trip,
        calendar: calendar.events,
        calendarSource: calendar.source,
        baseline: GARMIN_BASELINE,
        adherence: ADHERENCE_PROFILE,
        provider: providerKind(),
      };
    },
  },

  plan_shift: {
    description:
      "Run the full Meridian crew for a trip — analyst, researcher, planner, evaluator, negotiator — and return the scored shift plan: per-day interventions, citations, rescheduled calendar and the .ics file. Long-running.",
    schema: tripArgs.extend({
      startDayIndex: z.number().int().min(0).max(4).optional(),
      checkIns: z.array(checkInInput).optional(),
    }),
    run: async (raw) => {
      const args = tripArgs
        .extend({
          startDayIndex: z.number().int().min(0).max(4).optional(),
          checkIns: z.array(checkInInput).optional(),
        })
        .parse(raw);
      if (args.origin === args.dest) throw new Error("origin and destination are the same");
      const { trip, calendar } = await tripFor(args);
      const checkIns = (args.checkIns ?? []).map((c) => parseCheckInText(c as CheckInRequest));

      let briefing: Record<string, unknown> | null = null;
      const warnings: string[] = [];
      for await (const e of runCrew({
        trip,
        calendar: calendar.events,
        calendarSource: calendar.source,
        checkIns,
        startDayIndex: args.startDayIndex ?? 0,
        interactive: false,
      })) {
        if (e.type === "briefing") {
          briefing = {
            summary: e.summary,
            ics: e.ics,
            score: e.score,
            citations: e.citations,
            days: e.days,
            coverage: e.coverage,
          };
        }
        if (e.type === "error") warnings.push(e.message);
      }
      if (!briefing) throw new Error(`crew produced no briefing — ${warnings.join("; ") || "no events"}`);
      return { ...briefing, provider: providerKind(), warnings };
    },
  },

  evaluate_plan: {
    description:
      "Score a proposed shift plan against the deterministic phase-response gate — the 'code disposes' half of Meridian. Returns feasibility, adherence-weighted score, violations and shift coverage. No LLM involved.",
    schema: tripArgs.extend({ days: z.array(dayPlan).min(1) }),
    run: async (raw) => {
      const args = tripArgs.extend({ days: z.array(dayPlan).min(1) }).parse(raw);
      if (args.origin === args.dest) throw new Error("origin and destination are the same");
      const { trip, calendar } = await tripFor(args);
      return evaluatePlan({
        trip,
        days: args.days as DayPlan[],
        calendar: calendar.events,
        adherence: ADHERENCE_PROFILE,
        citations: [],
        baseline: GARMIN_BASELINE,
      });
    },
  },

  record_check_in: {
    description:
      "Record what the traveller actually did — free text ('skipped the 5am light') or a structured status — and return the updated adherence profile the next plan will respect.",
    schema: checkInInput.refine((c) => c.text || c.status, {
      message: "provide text or status",
    }),
    run: async (raw) => {
      const args = checkInInput.parse(raw);
      const checkIn = parseCheckInText(args as CheckInRequest);
      const memory = await recordCheckIn(checkIn);
      return {
        checkIn,
        adherence: foldCheckIns(ADHERENCE_PROFILE, memory.checkIns),
        learned: memory.learned,
      };
    },
  },

  search_literature: {
    description:
      "Search the scientific literature by meaning — the same tool Jun (research) uses. Returns papers with DOIs for timed light, melatonin, caffeine and phase-shift topics.",
    schema: z.object({
      query: z.string().describe("search query, e.g. 'timed light exposure phase advance'"),
      k: z.number().int().min(1).max(15).default(6),
    }),
    run: async (raw) => {
      const args = z.object({ query: z.string(), k: z.number().int().min(1).max(15).default(6) }).parse(raw);
      return searchScience(args.query, args.k);
    },
  },

  search_web: {
    description:
      "Live web search via Tavily — the same tool Jun uses for current guidance and destination practicalities. Returns title/url/snippet hits.",
    schema: z.object({
      query: z.string(),
      k: z.number().int().min(1).max(10).default(5),
    }),
    run: async (raw) => {
      const args = z.object({ query: z.string(), k: z.number().int().min(1).max(10).default(5) }).parse(raw);
      if (!tavilyEnabled()) return { note: "web search offline — TAVILY_API_KEY not set" };
      return searchTavily(args.query, args.k);
    },
  },

  destination_taste: {
    description:
      "Qloo taste graph for a destination city — the venues and categories the place is known for, used by the planner to ground notes. Requires QLOO_API_KEY.",
    schema: z.object({ dest: cityCode.describe("destination city") }),
    run: async (raw) => {
      const args = z.object({ dest: cityCode }).parse(raw);
      if (!qlooEnabled()) return { note: "destination taste offline — QLOO_API_KEY not set" };
      const city = CITY_TABLE[args.dest];
      return destinationTaste(city.name, city.lon, city.lat);
    },
  },

  crew_memory: {
    description:
      "Cross-run memory: past runs, all check-ins, and the adherence hints the crew has learned from them.",
    schema: z.object({}),
    run: async () => loadMemory(),
  },

  recall_findings: {
    description:
      "Query the traveller's FalkorDB memory graph for findings about a named intervention, day or trip. Every answer carries its hop path; 'not in graph' is an honest answer, not a gap.",
    schema: z.object({
      target: z.string().describe("name of the intervention, day or trip to recall"),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    run: async (raw) => {
      const args = z
        .object({ target: z.string(), limit: z.number().int().min(1).max(10).default(5) })
        .parse(raw);
      const gm = await import("@/domain/graph-memory");
      if (!gm.graphEnabled()) return { note: "graph memory offline — FALKORDB_URL not set" };
      return gm.recallFindings(args.target, args.limit);
    },
  },

  latest_plan: {
    description: "The most recent committed shift plan artifact (days + trip + provider), if a crew run has completed on this server.",
    schema: z.object({}),
    run: async () => {
      try {
        const raw = await readFile(path.join(process.cwd(), "artifacts", "shift-plan.json"), "utf8");
        return JSON.parse(raw);
      } catch {
        return { note: "no plan committed yet — call plan_shift first" };
      }
    },
  },
};

// --- JSON-RPC dispatch -------------------------------------------------------

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg: JsonRpcRequest): Promise<object | "notification"> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id ?? null, INVALID_REQUEST, "invalid JSON-RPC request");
  }

  // Notifications carry no id and expect no response.
  const isNotification = msg.id === undefined;
  if (msg.method.startsWith("notifications/")) return "notification";
  if (isNotification) return "notification";

  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id!, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Meridian — a crew of agents that plans circadian shifts across time zones. plan_shift runs the full crew (slow); preview_trip and evaluate_plan are instant; record_check_in feeds the adherence loop.",
      });

    case "ping":
      return rpcResult(msg.id!, {});

    case "tools/list":
      return rpcResult(msg.id!, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.schema, { io: "input" }),
        })),
      });

    case "resources/list":
      return rpcResult(msg.id!, { resources: [] });

    case "prompts/list":
      return rpcResult(msg.id!, { prompts: [] });

    case "tools/call": {
      const params = msg.params as { name?: string; arguments?: unknown } | undefined;
      const name = params?.name;
      if (!name || !(name in TOOLS)) {
        return rpcError(msg.id!, INVALID_PARAMS, `unknown tool: ${name ?? "(none)"}`);
      }
      const tool = TOOLS[name];
      try {
        const parsed = tool.schema.safeParse(params?.arguments ?? {});
        if (!parsed.success) {
          return rpcResult(msg.id!, {
            content: [{ type: "text", text: `invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }],
            isError: true,
          });
        }
        const output = await tool.run(parsed.data);
        return rpcResult(msg.id!, {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output as Record<string, unknown>,
        });
      } catch (err) {
        return rpcResult(msg.id!, {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return "notification";
      return rpcError(msg.id!, METHOD_NOT_FOUND, `method not found: ${msg.method}`);
  }
}

/** Entry point for the route handler: one POST body → one response body (or
 *  null when every message was a notification → HTTP 202). */
export async function dispatch(body: unknown): Promise<object | object[] | null> {
  if (Array.isArray(body)) {
    const out = (
      await Promise.all(body.map((m) => handleMessage(m as JsonRpcRequest)))
    ).filter((r): r is object => r !== "notification");
    return out.length ? out : null;
  }
  const r = await handleMessage(body as JsonRpcRequest);
  return r === "notification" ? null : r;
}
