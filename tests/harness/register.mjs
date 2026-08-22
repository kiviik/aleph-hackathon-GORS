// Entry point for `node --import`. The hooks have to be installed before the
// first component import, which is why this is its own file rather than a line
// at the top of a test.
//
// `registerHooks` (synchronous, same thread) rather than the older
// `register()`: Node 26 deprecates the latter, and the hooks here need no
// async work.
// Importing this file a second time is a no-op. `npm test` installs the hooks
// via `--import`, and a test file may ALSO import it so that
// `node --test tests/thatFile.mjs` works on its own — debugging one test
// directly is the first thing anyone does when it fails, and without this that
// invocation dies on a bare ERR_MODULE_NOT_FOUND for `@/components/...`, which
// looks like a broken import rather than a missing loader.
import { registerHooks } from "node:module";

import { load, resolve } from "./jsxLoader.mjs";

if (!globalThis.__atelierJsxHooks) {
  globalThis.__atelierJsxHooks = registerHooks({ load, resolve }) || true;
}
