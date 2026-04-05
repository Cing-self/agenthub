import test from "node:test";
import assert from "node:assert/strict";

import { filterMeaningfulFileRefs } from "./file-refs.js";

test("filterMeaningfulFileRefs drops slash terms that are not real workspace paths", () => {
  assert.deepEqual(
    filterMeaningfulFileRefs([
      "/STUN/TURN",
      "/Users/demo/agenthub/src/pages/work/ChatPage.tsx",
      "src/lib/runtime/index.ts",
    ]),
    [
      "/Users/demo/agenthub/src/pages/work/ChatPage.tsx",
      "src/lib/runtime/index.ts",
    ],
  );
});

test("filterMeaningfulFileRefs keeps deep absolute paths without file extensions", () => {
  assert.deepEqual(
    filterMeaningfulFileRefs([
      "/Users/demo/agenthub/doc/modules",
      "/VPN/LAN",
    ]),
    ["/Users/demo/agenthub/doc/modules"],
  );
});
