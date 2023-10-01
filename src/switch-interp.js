function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

const instr = {
  app: 1,
  terminal: 2,
  range: 3,
  beginChoice: 4,
  endChoiceArm: 5,
  beginRep: 6,
  beginNot: 7,
  end: 8,
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

    // Note that since the first rule application is implicit, the return
    // stack always has one element more than `ruleStack`.
    const returnStack = [[]];

    while (true) {
      while (ip < currRule.length) {
        let nesting = 0;
        let op = currRule[ip++];
        switch (op) {
          case instr.app:
            // TODO: Use LEB128 encoding to support >256 rules.
            const ruleIdx = currRule[ip++];
            returnStack.push([]);
            ruleStack.push([currRule, ip]);
            currRule = this.compiledRules[ruleIdx];
            ip = 0;
            continue;
          case instr.terminal:
            const origPos = pos;
            const len = currRule[ip++];
            const str = this.textDecoder.decode(currRule.slice(ip, ip + len));
            ip += len;

            let ret = str;
            for (let i = 0; i < len; i++) {
              if (input[pos++] !== str[i]) {
                pos = origPos;
                ret = false;
                break;
              }
            }
            returnStack.push(ret);
            break;
          case instr.range:
            // TODO: This is not correct, need UTF-8 decoding here.
            const startCp = currRule[ip++];
            const endCp = currRule[ip++];
            const nextCp = input.codePointAt(pos);
            if (startCp <= nextCp && nextCp <= endCp) {
              pos++;
              returnStack.push(String.fromCodePoint(nextCp));
            } else {
              returnStack.push(false);
            }
            break;
          case beginChoice:
          case endChoiceArm:
          case beginRep:
          case beginNot:
          case end:
        }
        const childResult = returnStack.pop();
        if (childResult === false) {
          returnStack.pop();
          returnStack.push(false);

          // Advance to the end of the current sequence
          let origNesting = nesting;
          loop: while ((op = currRule[ip++]) !== undefined) {
            // prettier-ignore
            switch (op) {
              case instr.app: ip += 1; break;
              case instr.terminal: ip += currRule[ip++]; break;
              case instr.range: ip += 2; break;
              case instr.beginChoice:
              case instr.beginRep:
              case instr.beginNot: ++nesting; break;
              case instr.endChoiceArm: break;
              case instr.end: if (nesting-- === origNesting) break loop;
            }
          }
        } else {
          returnStack.at(-1).push(childResult);
        }
      } // end of rule body
      if (ruleStack.length === 0) {
        break;
      }
      [currRule, ip] = ruleStack.pop();
    }
    return pos >= input.length ? returnStack[0] : undefined;
  }
}

export class RuleApplication {
  constructor(ruleName) {
    this.ruleName = ruleName;
  }

  toBytecode(ruleIndices) {
    const idx = ruleIndices.get(this.ruleName);
    return [instr.app, idx];
  }
}

export class Terminal {
  constructor(str) {
    this.str = str;
  }

  toBytecode() {
    const utf8Bytes = new TextEncoder().encode(this.str);
    assert(utf8Bytes.length <= 256, "max terminal length is 256");
    return [instr.terminal, utf8Bytes.length, ...utf8Bytes];
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
