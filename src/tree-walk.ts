import { CstNode, Result } from "./types.js";
import { MemoEntry } from "./MemoTable.js";

type PosInfo = Map<string, MemoEntry>;

export interface PExpr {
  eval(matcher: Matcher): CstNode;
}

class Matcher {
  input: string;
  pos: number;
  memoTable: PosInfo[];

  constructor(public rules: { [k: string]: PExpr }) {}

  match(input: string) {
    this.input = input;
    this.pos = 0;
    this.memoTable = [];
    var cst = new RuleApplication("start").eval(this);
    if (this.pos === this.input.length) {
      return cst;
    }
    return null;
  }

  hasMemoizedResult(ruleName: string) {
    var col = this.memoTable[this.pos];
    return col && col.has(ruleName);
  }

  memoizeResult(pos: number, ruleName: string, cst: CstNode) {
    var col = this.memoTable[pos];
    if (!col) {
      col = this.memoTable[pos] = new Map();
    }
    if (cst !== null) {
      col.set(ruleName, {
        cst: cst,
        nextPos: this.pos,
      });
    } else {
      col.set(ruleName, { cst: null });
    }
  }

  useMemoizedResult(ruleName: string) {
    var col = this.memoTable[this.pos];
    var result = col.get(ruleName);
    if (result.cst !== null) {
      this.pos = result.nextPos;
      return result.cst;
    }
    return null;
  }

  consume(c: string) {
    if (this.input[this.pos] === c) {
      this.pos++;
      return true;
    }
    return false;
  }
}

export class RuleApplication {
  constructor(private ruleName: string) {}

  eval(matcher: Matcher): Result {
    var name = this.ruleName;
    if (matcher.hasMemoizedResult(name)) {
      return matcher.useMemoizedResult(name);
    } else {
      var origPos = matcher.pos;
      var cst = matcher.rules[name].eval(matcher);
      matcher.memoizeResult(origPos, name, cst);
      return cst;
    }
  }
}

class Terminal {
  constructor(public str: string) {}

  eval(matcher: Matcher): Result {
    for (var i = 0; i < this.str.length; i++) {
      if (!matcher.consume(this.str[i])) {
        return null;
      }
    }
    return this.str;
  }
}

// Matches a single character within a character range.
export class Range {
  constructor(
    public start: string,
    public end: string,
  ) {}

  eval(matcher: Matcher): Result {
    const nextChar = matcher.input[matcher.pos];
    if (this.start <= nextChar && nextChar <= this.end) {
      matcher.pos++;
      return nextChar;
    }
    return null;
  }
}

class Choice {
  constructor(public exps: PExpr[]) {}

  eval(matcher: Matcher): Result {
    var origPos = matcher.pos;
    for (var i = 0; i < this.exps.length; i++) {
      matcher.pos = origPos;
      var cst = this.exps[i].eval(matcher);
      if (cst !== null) {
        return cst;
      }
    }
    return null;
  }
}

class Sequence {
  constructor(public exps: PExpr[]) {
    this.exps = exps;
  }

  eval(matcher: Matcher): Result {
    var ans = [];
    for (var i = 0; i < this.exps.length; i++) {
      var exp = this.exps[i];
      var cst = exp.eval(matcher);
      if (cst === null) {
        return null;
      }
      if (!(exp instanceof Not)) {
        ans.push(cst);
      }
    }
    return ans;
  }
}

class Not {
  constructor(public exp: PExpr) {}

  eval(matcher: Matcher): Result {
    var origPos = matcher.pos;
    if (this.exp.eval(matcher) === null) {
      matcher.pos = origPos;
      return [];
    }
    return null;
  }
}

export class Repetition {
  constructor(public exp: PExpr) {}

  eval(matcher: Matcher): Result {
    var ans = [];
    while (true) {
      var origPos = matcher.pos;
      var cst = this.exp.eval(matcher);
      if (cst === null) {
        matcher.pos = origPos;
        break;
      } else {
        ans.push(cst);
      }
    }
    return ans;
  }
}

export default {
  _: (value: string) => new Terminal(value),
  app: (ruleName: string) => new RuleApplication(ruleName),
  choice: (...exps: PExpr[]) => new Choice(exps),
  lookahead: (exp: PExpr) => new Not(new Not(exp)),
  matcher: (rules: { [k: string]: PExpr }) => new Matcher(rules),
  not: (exp: PExpr) => new Not(exp),
  range: (start: string, end: string) => new Range(start, end),
  rep: (exp: PExpr) => new Repetition(exp),
  seq: (...exps: PExpr[]) => new Sequence(exps),
};
