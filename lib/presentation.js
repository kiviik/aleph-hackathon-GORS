// Presentation mode — for showing the product to someone who is not on the team.
//
// WHAT IT HIDES: the brand switcher and anything that only makes sense to
// whoever built this. A live demo where the presenter can accidentally switch
// tenants mid-sentence is a demo that eventually does.
//
// WHAT IT DOES NOT HIDE, deliberately: the pilot-environment chip, the
// "muestra" labels, and every `sin datos` card. Those are not blemishes to
// clean up before guests arrive — they are the product's argument. A demo that
// concealed them would be selling something Atelier is not, and the first
// question after the meeting would be one this product answers well.
//
// The URL wins over the stored flag, so `?present=1` works on a machine that
// has never been in presentation mode, and `?present=0` gets a presenter out
// of it without opening devtools.
const KEY = "atelier-presentation-mode";

export function isPresenting() {
  if (typeof window === "undefined") return false;
  const param = new URLSearchParams(window.location.search).get("present");
  if (param === "1") return true;
  if (param === "0") return false;
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setPresenting(on) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode — the URL param still works */ }
}
