import { test } from "uvu";
import * as assert from "uvu/assert";

import { ES5 } from "../src/es5.ts";
import Factory from "../src/switch-interp.ts";

const es5 = ES5(Factory);

const { _, app, choice, matcher, not, range, rep, seq } = Factory;

// This works but currently takes a long time!
test.skip("ES5 basics", () => {
  assert.ok(es5.match("3", "logicalANDExpression"));
});

test("range", () => {
  const g = matcher({
    start: range("\u0000", "\uFFFF"),
  });
  assert.ok(g.match("a"));
});

test("rule application", () => {
  const g = matcher({
    start: app("any"),
    any: range("\u0000", "a"),
  });
  assert.ok(g.match("a"));
  assert.is(g.match("b"), null);

  const g2 = matcher({
    start: app("next"),
    next: app("any"),
    any: range("\u0000", "a"),
  });
  assert.ok(g2.match("a"));
  assert.not.ok(g2.match("b"));
});

test("terminal", () => {
  const g = matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.not.ok(g.match("fob"));

  const g2 = matcher({
    start: _(""),
  });
  assert.equal(g2.match(""), [""]);
  assert.not.ok(g2.match("xyz"));
});

test("terminal2", () => {
  const g = matcher({
    start: _("foo"),
  });
  assert.ok(g.match("foo"));
  assert.not.ok(g.match("fob"));
});

test("seq", () => {
  const g = matcher({
    start: seq(_("a"), _("b"), _("c")),
  });
  assert.ok(g.match("abc"));
  assert.not.ok(g.match("xyz"));

  const g2 = matcher({
    start: seq(_("a"), app("any"), _("c")),
    any: range("\u0000", "\uFFFF"),
  });
  assert.ok(g2.match("abc"));
  assert.not.ok(g2.match("abz"));
});

test("simple choice", () => {
  const g = matcher({
    start: choice(_("a"), _("b")),
  });
  assert.ok(g.match("a"));
  assert.ok(g.match("b"));
  assert.not.ok(g.match("c"));
});

test("nested choice", () => {
  const g = matcher({
    start: choice(_("a"), choice(_("b"), _("c"))),
  });
  assert.ok(g.match("b"));
  assert.ok(g.match("c"));
});

test("choice with seq", () => {
  const g = matcher({
    start: choice(seq(_("a"), _("b")), seq(_("a"), _("c"))),
  });
  assert.ok(g.match("ab"));
  assert.ok(g.match("ac"));
  assert.not.ok(g.match("acd"));

  const g2 = matcher({
    start: choice(seq(_("ab")), seq(_("ac"))),
  });
  assert.ok(g2.match("ac"));
});

test("basic repetition", () => {
  const g = matcher({
    start: rep(_("a")),
  });
  assert.ok(g.match(""));
  assert.ok(g.match("a"));
  assert.ok(g.match("aaaa"));
});

test("repetition of seq", () => {
  const g = matcher({
    start: rep(seq(_("a"), _("b"))),
  });
  assert.ok(g.match("ab"));
  assert.not.ok(g.match("aba"));
});

test("seq w/ repetition", () => {
  const g = matcher({
    start: seq(rep(_("a")), _("b")),
  });
  assert.ok(g.match("b"));
  assert.ok(g.match("aab"));
  assert.not.ok(g.match("aa"));
});

test("choice w/ repetition", () => {
  const g = matcher({
    start: choice(rep(_("a")), _("b")),
  });
  assert.not.ok(g.match("b"));
  assert.ok(g.match("aa"));
  assert.not.ok(g.match("ab"));
});

test("repetition in seq", () => {
  const g = matcher({
    start: seq(rep(_("a")), rep(_("b"))),
  });
  assert.ok(g.match("aa"));
  assert.ok(g.match("aab"));
  assert.ok(g.match("bbb"));
  assert.not.ok(g.match("c"));
  assert.not.ok(g.match("abc"));
  assert.not.ok(g.match("acb"));
});

test("neg lookahead", () => {
  const g = matcher({
    start: seq(not(_("a")), _("b")),
  });
  assert.ok(g.match("b"));
  assert.not.ok(g.match("a"));
});

test("pos lookahead", () => {
  const g = matcher({
    start: seq(not(not(_("a"))), _("a")),
  });
  assert.ok(g.match("a"));
  assert.not.ok(g.match("b"));
});

test.run();
