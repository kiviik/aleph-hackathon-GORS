// A DOM and a real React mount, for tests that need to know the app boots.
//
// `renderToString` would have been cheaper, but it stops at the render pass.
// Half of what breaks a screen — effects, subscriptions, a context read that
// only happens after the first commit — happens after that. So this commits
// into a jsdom document through react-dom/client, the same path the browser
// takes.
import { JSDOM } from "jsdom";

// jsdom puts these on `window`; browser code reads them off the global. Copy
// them once, rather than making every test remember which of the two it needs.
const GLOBALS = [
  "Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
  "HTMLTextAreaElement", "Node", "NodeList", "Event", "CustomEvent",
  "MouseEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle",
  "requestAnimationFrame", "cancelAnimationFrame", "localStorage",
  "sessionStorage", "DOMParser", "Image", "FileReader", "Blob", "File",
  "URL", "matchMedia", "location", "history", "self",
];

let dom = null;

// Reset between mounts so one test's localStorage writes cannot decide the
// next test's outcome — brand-scoped state lives there (lib/brandStore.js).
export function installDom({ url = "http://localhost:3000/" } = {}) {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url, pretendToBeVisual: true,
  });

  const define = (name, value) =>
    Object.defineProperty(globalThis, name, {
      value, writable: true, configurable: true,
    });

  define("window", dom.window);
  define("document", dom.window.document);
  // Node 21+ ships a read-only global `navigator`, so a plain assignment throws.
  define("navigator", dom.window.navigator);
  for (const name of GLOBALS) {
    if (name in dom.window) define(name, dom.window[name]);
  }

  // React 18 refuses to warn-free-render outside an act environment.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return dom.window;
}

// Every call in these tests must be answered explicitly. An unstubbed request
// would otherwise reach a real localhost:8000, and the test would pass or fail
// depending on whether the engine happened to be running.
export function stubFetch(handler) {
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), "http://127.0.0.1:8000").pathname;
    const body = await handler(path, init);
    if (body === undefined) {
      return { ok: false, status: 404, json: async () => null };
    }
    return { ok: true, status: 200, json: async () => body };
  };
}

// Mounts `element` and returns the container plus an unmount. Any error thrown
// during render or in an effect propagates out of here — which is the whole
// point: that is how a temporal-dead-zone crash becomes a failing test.
export async function mount(element) {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);

  // No error boundary on purpose: React re-throws an uncaught render error out
  // of `act`, which is exactly the signal a mount test exists to produce.
  const root = createRoot(container);
  await act(async () => { root.render(element); });

  return {
    container,
    text: () => container.textContent,
    unmount: async () => { await act(async () => { root.unmount(); }); },
  };
}
