import { test } from "uvu";
import * as assert from "uvu/assert";

import { ES5 } from "../src/es5.js";
import * as switchInterp from "../src/switch-interp.js";

//const es5 = ES5(switchInterp);

const g = ((ns) => {
  return new ns.Matcher({
    start: new ns.Range("\u0000", "\uFFFF"),
  });
})(switchInterp);

test("basics", () => {
  assert.ok(g.match("a"));
});

test.run();
