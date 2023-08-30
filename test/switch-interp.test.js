import { test } from "uvu";
import * as assert from "uvu/assert";

import { ES5 } from "../src/es5.js";
import * as switchInterp from "../src/switch-interp.js";

//const es5 = ES5(switchInterp);

const { Matcher, Range, RuleApplication, Sequence, Terminal } = switchInterp;

const _ = (value) => new Terminal(value);
const app = (ruleName) => new RuleApplication(ruleName);
const range = (start, end) => new Range(start, end);
const seq = (...exps) => new Sequence(exps);

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
  assert.is(g.match("b"), undefined);

  const g2 = new Matcher({
    start: app("next"),
    next: app("any"),
    any: range("\u0000", "a"),
  });
  assert.ok(g2.match("a"));
  assert.is(g2.match("b"), undefined);
});

test("terminal", () => {
  const g = new Matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.is(g.match("fob"), undefined);

  const g2 = new Matcher({
    start: _(""),
  });
  assert.equal(g2.match(""), "");
  assert.is(g2.match("xyz"), undefined);
});

test("terminal", () => {
  const g = new Matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.not.ok(g.match("fob"));
});

test("seq", () => {
  const g = new Matcher({
    start: seq(_("a"), _("b"), _("c")),
  });
  assert.ok(g.match("abc"));
  assert.not.ok(g.match("xyz"));

  const g2 = new Matcher({
    start: seq(_("a"), app("any"), _("c")),
    any: range("\u0000", "\uFFFF"),
  });
  assert.ok(g2.match("abc"));
  assert.not.ok(g2.match("abz"));
});

test.run();
