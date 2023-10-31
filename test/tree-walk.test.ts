import fs from "node:fs";
import { test } from "uvu";
import * as assert from "uvu/assert";

import { ES5 } from "../src/es5.ts";
import treeWalk from "../src/tree-walk.ts";

const jqueryUrl = new URL("data/jquery-3.2.1.js", import.meta.url);

const es5 = ES5(treeWalk);

test("basics", () => {
  assert.ok(es5.match("var x = 3"));
  assert.not.ok(es5.match("var = 3"));
});

test("parsing jquery", () => {
  assert.ok(es5.match(fs.readFileSync(jqueryUrl, "utf-8")));
});

test.run();
