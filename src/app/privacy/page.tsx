import { BottomNav } from "@/components/BottomNav";
import { PageHeader } from "@/components/PageHeader";
import { SessionReference } from "@/components/SessionReference";
import { SUPPORT_MAILTO } from "@/lib/support";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <BottomNav />
      <PageHeader title="Privacy & support" />

      <section className="space-y-4 text-sm text-clay">
        <p>
          Meridian is a timing-guidance beta, not a medical device. Body-clock
          estimates are modeled, not measurements or guarantees.
        </p>
        <p>
          <b>No account.</b> This browser holds an anonymous session cookie and
          saves your trips, plans, preferences and action history locally. The
          cookie lasts up to 30 days. There is no cross-device access or
          account recovery; clearing cookies can disconnect you from server
          records.
        </p>
        <p>
          <b>Server processing.</b> Making a live plan sends trip details, your
          sleep baseline, check-ins and available schedule information to the
          server. Sleep CSV uploads are parsed on the server. The derived
          baseline, including per-night values, is stored there; the upload
          handler does not store the original CSV. Check-ins, crew-run events,
          plan artifacts and learned preferences can also be stored on the
          server. Configured Supabase and FalkorDB backends hold some records.
          File-backed records may disappear on redeploy; keep your own copy of
          important plans.
        </p>
        <p>
          <b>Providers.</b> Replay uses a disclosed sample baseline and
          simulated crew. Live runs may send relevant trip, schedule, check-in
          and sleep information to configured AI providers such as Anthropic,
          Featherless or Nebius. Optional research, place and voice services
          receive inputs needed for their feature and may apply their own
          retention rules. Live Google Calendar access and payments are
          disabled in this beta.
        </p>
        <p>
          <b>Sharing and reminders.</b> Anyone holding a shared-card link can
          view its contents. Calendar, assistant and widget links carry access
          tokens: treat them as secrets; rotate a token to revoke that
          surface&rsquo;s access. Push reminders store a browser subscription
          linked to a feed.
        </p>
        <p>
          <b>Usage and error logs.</b> Feature-stage events can include the
          trip route and date when cloud analytics is configured. Operational
          and platform logs and third-party service logs may also exist. Our
          structured error reports exclude cookies, access tokens, query
          strings, trip details and sleep data.
        </p>
        <p>
          <b>Retention and deletion.</b> There is no automatic server-wide
          deletion schedule in this beta. Expiring a cookie or clearing this
          browser does not delete server records, shared cards, feeds or push
          subscriptions. Server records remain until manually removed or the
          underlying storage is reset; recovery after a reset is not
          guaranteed. Trips &rarr; Clear this browser&rsquo;s data clears local
          Meridian records only. Contact support for server-data deletion,
          including your support reference and relevant share-card or feed
          identifiers without access tokens. We may need to verify the request
          before removing server records. Never send your session cookie or a
          full wearable export.
        </p>
        <SessionReference />
        <p>
          <a className="text-clay underline" href={SUPPORT_MAILTO}>
            Contact support
          </a>
        </p>
      </section>
    </main>
  );
}
