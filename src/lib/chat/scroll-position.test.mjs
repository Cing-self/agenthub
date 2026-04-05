import test from "node:test";
import assert from "node:assert/strict";

import { isNearBottom } from "./scroll-position.js";

test("isNearBottom returns true when viewport is already close to the latest message", () => {
  assert.equal(
    isNearBottom({
      scrollTop: 1320,
      clientHeight: 640,
      scrollHeight: 2000,
    }),
    true,
  );
});

test("isNearBottom returns false when user has scrolled far away from the bottom", () => {
  assert.equal(
    isNearBottom({
      scrollTop: 840,
      clientHeight: 640,
      scrollHeight: 2000,
    }),
    false,
  );
});
