import { test } from "uvu";
import * as assert from "uvu/assert";

//import { ES5 } from "../src/es5.js";
import * as i from "../src/switch-interp.js";

//const es5 = ES5(switchInterp);

// test.skip("ES5 basics", () => {
//   assert.ok(es5.match("var x = 3"));
//   assert.not.ok(es5.match("var = 3"));
// });

const _ = (value: string) => new i.Terminal(value);
const app = (ruleName: string) => new i.RuleApplication(ruleName);
const choice = (...exps: i.PExpr[]) => new i.Choice(exps);
const range = (start: string, end: string) => new i.Range(start, end);
const seq = (...exps: i.PExpr[]) => new i.Sequence(exps);
const rep = (exp: i.PExpr) => new i.Repetition(exp);

test("range", () => {
  const g = new i.Matcher({
    start: range("\u0000", "\uFFFF"),
  });
  assert.ok(g.match("a"));
});

test("rule application", () => {
  const g = new i.Matcher({
    start: app("any"),
    any: range("\u0000", "a"),
  });
  //  assert.ok(g.match("a"));
  assert.is(g.match("b"), undefined);

  const g2 = new i.Matcher({
    start: app("next"),
    next: app("any"),
    any: range("\u0000", "a"),
  });
  assert.ok(g2.match("a"));
  assert.is(g2.match("b"), undefined);
});

test("terminal", () => {
  const g = new i.Matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.is(g.match("fob"), undefined);

  const g2 = new i.Matcher({
    start: _(""),
  });
  assert.equal(g2.match(""), [""]);
  assert.is(g2.match("xyz"), undefined);
});

test("terminal2", () => {
  const g = new i.Matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.not.ok(g.match("fob"));
});

test("seq", () => {
  const g = new i.Matcher({
    start: seq(_("a"), _("b"), _("c")),
  });
  assert.ok(g.match("abc"));
  assert.not.ok(g.match("xyz"));

  const g2 = new i.Matcher({
    start: seq(_("a"), app("any"), _("c")),
    any: range("\u0000", "\uFFFF"),
  });
  assert.ok(g2.match("abc"));
  assert.not.ok(g2.match("abz"));
});

test("simple choice", () => {
  const g = new i.Matcher({
    start: choice(_("a"), _("b")),
  });
  assert.ok(g.match("a"));
  assert.ok(g.match("b"));
  assert.not.ok(g.match("c"));
});

test("nested choice", () => {
  const g = new i.Matcher({
    start: choice(_("a"), choice(_("b"), _("c"))),
  });
  assert.ok(g.match("b"));
  assert.ok(g.match("c"));
});

test("choice with seq", () => {
  const g = new i.Matcher({
    start: choice(seq(_("a"), _("b")), seq(_("a"), _("c"))),
  });
  assert.ok(g.match("ab"));
  assert.ok(g.match("ac"));
  assert.not.ok(g.match("acd"));

  const g2 = new i.Matcher({
    start: choice(seq(_("ab")), seq(_("ac"))),
  });
  assert.ok(g2.match("ac"));
});

test("repetition", () => {
  const g = new i.Matcher({
    start: rep(_("a")),
  });
  assert.ok(g.match(""));
  assert.ok(g.match("a"));
  assert.ok(g.match("aaaa"));
});

test.run();
