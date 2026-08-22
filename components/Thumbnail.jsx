"use client";
import { useState } from "react";
import { shade, texClass } from "@/lib/format";

// Real React port of the prototype `mtile()` material-study tile.
// Renders a photo when `img` is given (with graceful fallback to the
// colour+texture study), otherwise the gradient study itself.
export default function Thumbnail({ color, fabric, img, style }) {
  const [imgFailed, setImgFailed] = useState(false);
  // Defaults are applied HERE, not in the signature: a JS parameter default
  // only fires on `undefined`, and these props routinely arrive as `null` from
  // the server (a slot with no colourway yet). `shade(null)` threw inside
  // render and took the whole Range screen down with it.
  const base = color || "#4A4944";
  const lite = shade(base, 44);
  const showImg = img && !imgFailed;

  if (showImg) {
    return (
      <div className="mtile" style={{ background: lite, ...style }}>
        <img
          src={img}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
        <div className="mt-fallback" />
      </div>
    );
  }

  return (
    <div
      className="mtile"
      style={{ background: `linear-gradient(160deg, ${lite}, ${base} 55%)`, ...style }}
    >
      <span className={`tex ${texClass(fabric || "Organic cotton")}`} />
    </div>
  );
}
