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

export class Matcher {
  constructor(rules) {
    const ruleIndexByName = new Map(Object.keys(rules).map((k, i) => [k, i]));

    this.compiledRules = [];
    for (const ruleName in rules) {
      const bytes = rules[ruleName].toBytecode(ruleIndexByName);
      const idx = ruleIndexByName.get(ruleName);
      this.compiledRules[idx] = new Uint8Array(bytes.flat(Infinity));
    }
    this.startRuleIndex = ruleIndexByName.get("start");
    this.textDecoder = new TextDecoder();
  }

  match(input) {
    let pos = 0;
    let ip = 0;
    let ruleStack = [];
    let currRule = this.compiledRules[this.startRuleIndex];

    const tree = [];

    while (true) {
      let failed = false;
      while (!failed && ip < currRule.length) {
        let op = currRule[ip++];
        switch (op) {
          case instr.range:
            // TODO: This is not correct, need UTF-8 decoding here.
            const startCp = currRule[ip++];
            const endCp = currRule[ip++];
            const nextCp = input.codePointAt(pos);
            if (startCp <= nextCp && nextCp <= endCp) {
              pos++;
              tree.push(String.fromCodePoint(nextCp));
            } else {
              console.log("range failed");
              failed = true;
            }
            break;
          case instr.term:
            const origPos = pos;
            const len = currRule[ip++];
            const str = this.textDecoder.decode(currRule.slice(ip, ip + len));
            ip += len;

            for (let i = 0; i < len; i++) {
              if (input[pos++] !== str[i]) {
                pos = origPos;
                failed = true;
                break;
              }
            }
            if (!failed) {
              tree.push(str);
            }
            break;
          default:
            if (op & 1) {
              const ruleIdx = op >> 1;
              // When pushing, advance ip over the rule application.
              ruleStack.push([currRule, ip]);
              currRule = this.compiledRules[ruleIdx];
              ip = 0;
            }
            break;
        }
      }
      if (ruleStack.length === 0) {
        break;
      }
      [currRule, ip] = ruleStack.pop();
    }
    return pos === input.length ? tree[0] : undefined;
  }
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
    assert(utf8Bytes.length <= 256, "max terminal length is 256");
    return [instr.term, utf8Bytes.length, ...utf8Bytes];
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