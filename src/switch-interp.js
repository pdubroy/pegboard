const instr = {
  // Rule applications have the low bit set.
  // Remaining bits encode the index of the rule to apply.
  app(idx) {
    if (idx <= 127) {
      return (idx << 1) + 1;
    }
    if (idx >= 256) {
      throw new Error("Not supported");
    }
    // Rule index between [128, 256) takes two bytes.
    return [0xff, idx];
  },
  term: 2,
  beginChoice: 4,
  endChoiceArm: 6,
  beginRep: 8,
  beginNot: 10,
  end: 12,
};

function compile(rules) {
  const ruleIndices = new Map(Object.keys(rules).map((k, i) => [k, i]));
  const ruleBodies = Object.values(rules).map((body) => {
    return new Uint8Array(body.toBytecode(ruleIndices));
  });
}

export class Matcher {
  constructor(rules) {
    const code = compile(rules);
  }

  match(input) {}
}

export class RuleApplication {
  constructor(ruleName) {
    this.ruleName = ruleName;
  }

  toBytecode() {}
}

export class Terminal {
  constructor(str) {
    this.str = str;
  }

  toBytecode() {}
}

export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  toBytecode() {}
}

export class Choice {
  constructor(exps) {
    this.exps = exps;
  }

  toBytecode() {}
}

export class Sequence {
  constructor(exps) {
    this.exps = exps;
  }

  toBytecode() {}
}

export class Not {
  constructor(exp) {
    this.exp = exp;
  }

  toBytecode() {}
}

export class Repetition {
  constructor(exp) {
    this.exp = exp;
  }

  toBytecode() {}
}
