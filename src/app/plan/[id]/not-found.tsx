import Link from "next/link";
import { SUPPORT_MAILTO } from "@/lib/support";

/* A dead share link is the likeliest 404 a stranger meets — the card they
   were sent has expired, rotated or was never real. Say that, then offer
   the same door the share page itself offers. */
export default function SharedPlanNotFound() {
  return (
    <div className="errpage">
      <div className="beam" aria-hidden="true" />
      <div className="in">
        <div className="errcard">
          <span className="route">Shared plan not found</span>
          <h1>This card has expired.</h1>
          <p className="s">
            Shared plans rotate with their access tokens, so an old link can
            quietly stop working. Ask the sender for a fresh card — or start
            your own plan and the crew flies ahead of you instead.
          </p>
          <div className="errbtns">
            <Link className="p1" href="/">
              Make your own plan
            </Link>
            <Link className="p2" href="/privacy">
              Privacy &amp; support
            </Link>
          </div>
          <p className="s">
            <a href={SUPPORT_MAILTO}>Contact support</a>
          </p>
        </div>
      </div>
    </div>
  );
}
