import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RightNowCard } from "@/components/RightNowCard";
import type { TravelerNudge } from "@/domain/nudges";

const mockStep: TravelerNudge = {
  id: "test-step-1",
  dayIndex: 1,
  dayLabel: "D-1",
  category: "sunlight",
  title: "Morning light exposure",
  timeWindow: "07:30–09:30",
  startMin: 450,
  endMin: 570,
  actionSummary: "Seek 30–60 min of natural daylight outdoor light.",
  whyItHelps: "Advances phase.",
};

describe("RightNowCard", () => {
  test("renders active right now state when countdown is now", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={mockStep}
        nowMin={480}
        isToday={true}
        selectedDayLabel="D-1"
        countdown="now"
        isDone={false}
        isSkip={false}
      />
    );
    expect(html).toContain("ACTIVE RIGHT NOW");
    expect(html).toContain("Morning light exposure");
    expect(html).toContain("07:30–09:30");
  });

  test("renders next up state when countdown is in the future", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={mockStep}
        nowMin={400}
        isToday={true}
        selectedDayLabel="D-1"
        countdown="in 50m"
        isDone={false}
        isSkip={false}
      />
    );
    expect(html).toContain("NEXT UP · IN 50M");
    expect(html).toContain("Morning light exposure");
  });

  test("renders all complete state when all steps are done", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={null}
        nowMin={600}
        isToday={true}
        selectedDayLabel="D-1"
        countdown={null}
        totalSteps={3}
        completedCount={3}
      />
    );
    expect(html).toContain("All steps complete for today");
  });

  test("a day with nothing scheduled does not claim completion", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={null}
        nowMin={600}
        isToday={true}
        selectedDayLabel="D-1"
        countdown={null}
        totalSteps={0}
        completedCount={0}
      />
    );
    // `0 of 0 done` used to report an unplanned day as a finished one.
    expect(html).toContain("No steps for this day");
    expect(html).toContain("rest day, not a missed one");
    expect(html).not.toContain("All steps complete");
    expect(html).not.toContain("0 of 0");
  });

  test("an evening with unmarked steps does not claim completion", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={null}
        nowMin={1380}
        isToday={true}
        selectedDayLabel="D-1"
        countdown={null}
        totalSteps={4}
        completedCount={0}
        missedCount={4}
      />
    );
    // This is the ordinary after-dinner state: every window closed, nobody
    // marked anything. It used to read "0 of 4 done · All steps complete".
    expect(html).toContain("Every window has closed");
    expect(html).toContain("4 missed of 4");
    expect(html).toContain("4 steps went by unmarked");
    expect(html).not.toContain("All steps complete");
    expect(html).not.toContain("all scheduled interventions");
  });

  test("a day of passes on is logged as passes, not as completion", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={null}
        nowMin={1380}
        isToday={true}
        selectedDayLabel="D-1"
        countdown={null}
        totalSteps={3}
        completedCount={0}
        missedCount={0}
      />
    );
    expect(html).toContain("Nothing left for today");
    expect(html).toContain("You passed on all 3 windows today");
    expect(html).not.toContain("All steps complete");
  });

  test("renders planning ahead state when viewing non-today day", () => {
    const html = renderToStaticMarkup(
      <RightNowCard
        step={mockStep}
        nowMin={480}
        isToday={false}
        selectedDayLabel="D+1"
        countdown="now"
        totalSteps={4}
      />
    );
    expect(html).toContain("PLANNING AHEAD");
    expect(html).toContain("Viewing D+1");
  });
});
