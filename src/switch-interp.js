function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

const instr = {
  // Rule applications have the low bit set.
  // Remaining bits encode the index of the rule to apply.
  app(idx) {
    if (idx < 127) {
      return (idx << 1) + 1;
    }
    assert(idx < 256, "Rule index must be less than 256");

    // Rule application in the range [127, 256) takes two bytes.
    return [0xff, idx];
  },
  term: 2,
  range: 4,
  beginChoice: 6,
  endChoiceArm: 8,
  beginRep: 10,
  beginNot: 12,
  end: 14,
};

function compile(rules) {
  const ruleIndexByName = new Map(Object.keys(rules).map((k, i) => [k, i]));

  // Return an object
  return Object.values(rules).map((body) => {
    const bytes = body.toBytecode(ruleIndexByName);
    return new Uint8Array(bytes.flat(Infinity));
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

  toBytecode(ruleIndices) {
    const idx = ruleIndices.get(this.ruleName);
    return [instr.app(idx)];
  }
}

export class Terminal {
  constructor(str) {
    this.str = str;
  }

  toBytecode() {
    const utf8Bytes = new TextEncoder().encode(this.str);
    return [instr.term, utf8Bytes];
  }
}

export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  toBytecode() {
    const startCp = this.start.codePointAt(0);
    const endCp = this.end.codePointAt(0);
    assert(startCp <= 0xffff, `range start too high: ${startCp}`);
    assert(endCp <= 0xffff, `range end too high: ${endCp}`);
    return [instr.range, startCp, endCp];
  }
}

export class Choice {
  constructor(exps) {
    this.exps = exps;
  }

  toBytecode(ruleIndices) {
    return [
      instr.beginChoice,
      ...this.exps.flatMap((exp) => [
        exp.toBytecode(ruleIndices),
        instr.endChoiceArm,
      ]),
      instr.end,
    ];
  }
}

export class Sequence {
  constructor(exps) {
    this.exps = exps;
  }

  toBytecode(ruleIndices) {
    return this.exps.map((e) => e.toBytecode(ruleIndices));
  }
}

export class Not {
  constructor(exp) {
    this.exp = exp;
  }

  toBytecode(ruleIndices) {
    return [instr.beginNot, this.exp.toBytecode(ruleIndices), instr.end];
  }
}

export class Repetition {
  constructor(exp) {
    this.exp = exp;
  }

  toBytecode(ruleIndices) {
    return [instr.beginRep, this.exp.toBytecode(ruleIndices), instr.end];
  }
}
