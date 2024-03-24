import { CstNode, Result } from "./types.js";
import { MemoTable } from "./MemoTable.js";

export interface PExpr {
  eval(matcher: Matcher): CstNode;
}

class Matcher {
  input: string;
  pos: number;
  memoTable: MemoTable<string>;

  constructor(public rules: { [k: string]: PExpr }) {}

  match(input: string) {
    this.input = input;
    this.pos = 0;
    this.memoTable = new MemoTable();
    const cst = new RuleApplication("start").eval(this);
    if (this.pos === this.input.length) {
      return cst;
    }
    return null;
  }

  hasMemoizedResult(ruleName: string) {
    return this.memoTable.has(this.pos, ruleName);
  }

  memoizeResult(pos: number, ruleName: string, cst: CstNode) {
    this.memoTable.memoizeResult(pos, ruleName, {
      cst,
      nextPos: cst ? this.pos : undefined,
    });
  }

  useMemoizedResult(ruleName: string) {
    const result = this.memoTable.getResult(this.pos, ruleName);
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
    const name = this.ruleName;
    if (matcher.hasMemoizedResult(name)) {
      return matcher.useMemoizedResult(name);
    } else {
      const origPos = matcher.pos;
      const cst = matcher.rules[name].eval(matcher);
      matcher.memoizeResult(origPos, name, cst);
      return cst;
    }
  }
}

class Terminal {
  constructor(public str: string) {}

  eval(matcher: Matcher): Result {
    for (let i = 0; i < this.str.length; i++) {
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
    const origPos = matcher.pos;
    for (let i = 0; i < this.exps.length; i++) {
      matcher.pos = origPos;
      const cst = this.exps[i].eval(matcher);
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
    const ans = [];
    for (let i = 0; i < this.exps.length; i++) {
      const exp = this.exps[i];
      const cst = exp.eval(matcher);
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
    const origPos = matcher.pos;
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
    const ans = [];
    while (true) {
      const origPos = matcher.pos;
      const cst = this.exp.eval(matcher);
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
