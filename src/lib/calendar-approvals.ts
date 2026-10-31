import { createPlanEvents, patchGoogleEvent } from "@/tools/calendar-google";
import type { CalendarEvent, CalendarMove, DayPlan, Trip } from "@/domain/types";

export interface CalendarApprovalPayload {
  trip: Trip;
  calendar: CalendarEvent[];
  lockedDays: DayPlan[];
  moves: CalendarMove[];
  runId?: string;
}

interface PendingCalendarApproval {
  id: string;
  createdAt: number;
  expiresAt: string;
  payload: CalendarApprovalPayload;
  resolve: (result: CalendarApprovalResult) => void;
}

export interface CalendarApprovalResult {
  approvalId: string;
  status: "applied" | "rejected" | "failed";
  message: string;
}

type Store = Map<string, PendingCalendarApproval>;

const store = (): Store => {
  const g = globalThis as typeof globalThis & { __meridianCalendarApprovals?: Store };
  g.__meridianCalendarApprovals ??= new Map();
  return g.__meridianCalendarApprovals;
};

const TTL_MS = 30 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, approval] of store()) {
    if (now - approval.createdAt > TTL_MS) {
      approval.resolve({
        approvalId: id,
        status: "failed",
        message: "Calendar approval expired — no calendar changes were made.",
      });
      store().delete(id);
    }
  }
}

export function requestCalendarApproval(
  payload: CalendarApprovalPayload,
): { approvalId: string; expiresAt: string; result: Promise<CalendarApprovalResult> } {
  sweep();
  const approvalId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  let resolve!: (result: CalendarApprovalResult) => void;
  const result = new Promise<CalendarApprovalResult>((r) => {
    resolve = r;
  });
  store().set(approvalId, {
    id: approvalId,
    createdAt: Date.now(),
    expiresAt,
    payload,
    resolve,
  });
  return { approvalId, expiresAt, result };
}

export function pendingCalendarApproval(id: string): CalendarApprovalPayload | null {
  sweep();
  return store().get(id)?.payload ?? null;
}

export function cancelCalendarApprovalsForRun(runId: string): number {
  sweep();
  let cancelled = 0;
  for (const [id, approval] of store()) {
    if (approval.payload.runId !== runId) continue;
    approval.resolve({
      approvalId: id,
      status: "failed",
      message: "Run cancelled — no calendar changes were made.",
    });
    store().delete(id);
    cancelled += 1;
  }
  return cancelled;
}

export async function resolveCalendarApproval(
  id: string,
  approve: boolean,
): Promise<CalendarApprovalResult> {
  sweep();
  const approval = store().get(id);
  if (!approval) {
    return {
      approvalId: id,
      status: "failed",
      message: "This calendar approval is no longer available.",
    };
  }
  store().delete(id);

  if (!approve) {
    const result = {
      approvalId: id,
      status: "rejected" as const,
      message: "Calendar changes rejected — your Google Calendar was not changed.",
    };
    approval.resolve(result);
    return result;
  }

  const { trip, calendar, lockedDays, moves } = approval.payload;
  const appliedMoves: CalendarMove[] = [];
  try {
    for (const move of moves) {
      const event = calendar.find((e) => e.id === move.eventId);
      if (!event) throw new Error(`event ${move.eventId} is no longer available`);
      await patchGoogleEvent(event, move, trip);
      appliedMoves.push(move);
    }
    const blocksWritten = await createPlanEvents(lockedDays, trip);
    const result = {
      approvalId: id,
      status: "applied" as const,
      message: `Applied ${moves.length} calendar move${moves.length === 1 ? "" : "s"} and wrote ${blocksWritten} plan blocks.`,
    };
    approval.resolve(result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "calendar write failed";
    let rollbackError: string | null = null;
    for (const applied of appliedMoves) {
      const event = calendar.find((e) => e.id === applied.eventId);
      if (!event) continue;
      try {
        await patchGoogleEvent(event, {
          ...applied,
          from: applied.to,
          to: applied.from,
        }, trip);
      } catch (rollbackErr) {
        rollbackError = rollbackErr instanceof Error ? rollbackErr.message : "rollback failed";
      }
    }
    const result = {
      approvalId: id,
      status: "failed" as const,
      message: rollbackError
        ? `Calendar update failed after ${appliedMoves.length} of ${moves.length} moves: ${message}. Rollback also failed — review Google Calendar before retrying.`
        : `Calendar update failed after ${appliedMoves.length} of ${moves.length} moves: ${message}. Applied moves were restored.`,
    };
    approval.resolve(result);
    return result;
  }
}
