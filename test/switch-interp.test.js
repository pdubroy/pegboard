import { test } from "uvu";
import * as assert from "uvu/assert";

import { ES5 } from "../src/es5.js";
import * as switchInterp from "../src/switch-interp.js";

//const es5 = ES5(switchInterp);

const { Matcher, Range, RuleApplication, Terminal } = switchInterp;

const _ = (value) => new Terminal(value);
const app = (ruleName) => new RuleApplication(ruleName);
const range = (start, end) => new Range(start, end);

test("range", () => {
  const g = new Matcher({
    start: range("\u0000", "\uFFFF"),
  });
  assert.ok(g.match("a"));
});

test("rule application", () => {
  const g = new Matcher({
    start: app("any"),
    any: range("\u0000", "a"),
  });
  assert.ok(g.match("a"));
  assert.not.ok(g.match("b"));

  const g2 = new Matcher({
    start: app("next"),
    next: app("any"),
    any: range("\u0000", "a"),
  });
  assert.ok(g2.match("a"));
  assert.not.ok(g2.match("b"));
});

test("terminal", () => {
  const g = new Matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.not.ok(g.match("fob"));
});

test.run();
