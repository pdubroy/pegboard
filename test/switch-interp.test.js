import { test } from "uvu";
import * as assert from "uvu/assert";

import { ES5 } from "../src/es5.js";
import * as switchInterp from "../src/switch-interp.js";

const es5 = ES5(switchInterp);

test.skip("basics", () => {
  assert.ok(es5.match("function foo() {}; var x = 3; foo(x);"));
});

test.run();
