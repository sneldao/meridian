import Link from "next/link";
import { SUPPORT_MAILTO } from "@/lib/support";

/* The route-level 404 in the app's own voice — without it every dead link
   lands on Next's stock black page, which shares nothing with the system. */
export default function NotFound() {
  return (
    <div className="errpage">
      <div className="beam" aria-hidden="true" />
      <div className="in">
        <div className="errcard">
          <span className="route">Nothing lives at this address</span>
          <h1>This route went missing.</h1>
          <p className="s">
            The page may have moved, or the link was mistyped. Today keeps
            everything this browser has saved.
          </p>
          <div className="errbtns">
            <Link className="p1" href="/">
              Back to Today
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
