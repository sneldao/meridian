"use client";

import { BottomNav } from "@/components/BottomNav";
import { PageHeader } from "@/components/PageHeader";
import { PlanReview } from "@/components/PlanReview";

// The plan artifact lives on Home now — the Now/The plan switch renders the
// same component this page does. /review stays as the deep-linkable full
// page (shared URLs, the arrival surface's "See the plan") but the tab bar
// and the menu no longer list it: one artifact, one primary home for it.
export default function ReviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader title="Your plan" />
      <PlanReview />
      <BottomNav />
    </main>
  );
}
