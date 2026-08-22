"use client";
// An <img> for bytes behind the tenancy gate.
//
// ⚠ A RAW `<img src>` CANNOT AUTHENTICATE. `/brands/{id}/assets/{id}/content`
// is a TENANT_PATH route: the engine checks a bearer token that `engineFetch`
// reads from localStorage, and the browser's image loader sends no such
// header. So every asset image in this app renders today only because pilot
// mode lets unauthenticated requests through — and every one of them would
// become a broken image the day auth is enforced.
//
// That is the shape of failure this codebase has already paid for once: the
// `/brands` 403 that made the whole app fall back to demo data, invisible
// locally because "the failure only exists in the environment nobody develops
// in". So the fix is a component, not a note.
//
// Fetch through `engineFetch`, hand the blob to an object URL, revoke it on
// unmount. A failure renders a LABELLED ABSENCE — never a broken-image glyph,
// which says nothing about whose fault it was.
import { useEffect, useState } from "react";

import { engineFetch } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

export default function AssetImage({ href, alt = "", className, style,
                                     absentText = "Sin imagen" }) {
  const [state, setState] = useState({ url: null, failed: false });

  useEffect(() => {
    if (!href) { setState({ url: null, failed: false }); return undefined; }
    let revoked = false;
    let objectUrl = null;
    const absolute = /^https?:|^blob:|^data:/i.test(href)
      ? href : `${API_BASE}${href}`;

    // An already-usable URL (blob:, data:, or another host) needs no fetch.
    if (/^blob:|^data:/i.test(href)) {
      setState({ url: href, failed: false });
      return undefined;
    }

    (async () => {
      try {
        const res = await engineFetch(absolute, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        objectUrl = URL.createObjectURL(await res.blob());
        if (!revoked) setState({ url: objectUrl, failed: false });
      } catch {
        if (!revoked) setState({ url: null, failed: true });
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [href]);

  if (state.url) {
    return <img className={className} style={style} src={state.url} alt={alt} />;
  }
  return (
    <span className={className}
      style={{ display: "grid", placeItems: "center", textAlign: "center",
        color: "var(--ink-3)", fontSize: "var(--fs-caption)",
        background: "var(--paper-2)", padding: 8, ...style }}>
      {/* "Could not read" and "there is none" are different answers, and a
          broken-image glyph gives neither. */}
      {state.failed ? "No pudimos leer esta imagen" : absentText}
    </span>
  );
}
