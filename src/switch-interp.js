function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

const instr = {
  app: 1,
  terminal: 2,
  range: 3,
  begin: 4,
  nextChoice: 5,
  endChoice: 6,
  endRep: 7,
  endNot: 8,
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

    const returnStack = [];
    const posStack = [];
    const ruleStack = [];
    let currRule = [instr.app, this.startRuleIndex];
    let ip = 0;

    const skipToEnd = () => {
      // Advance to the end of the current sequence
      let nesting = 0;
      while (ip < currRule.length) {
        // prettier-ignore
        switch (currRule[ip++]) {
          case instr.app: ip += 1; break;
          case instr.terminal: ip += currRule[ip++]; break;
          case instr.range: ip += 2; break;
          case instr.begin: ++nesting; break;
          case instr.nextChoice:
          case instr.endChoice:
          case instr.endRep:
          case instr.endNot:
            if (nesting-- === 0) {
              --ip;
              return;
            }
        }
      }
    };

    while (true) {
      while (ip < currRule.length) {
        const op = currRule[ip++];
        switch (op) {
          // Atomic instructions set `ret`, and use `break`.
          // Higher-order instructions use `continue`.
          case instr.terminal:
            const len = currRule[ip++];
            const str = this.textDecoder.decode(currRule.slice(ip, ip + len));
            ip += len;

            let ret = str;
            let origPos = pos;
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
          case instr.app:
            // TODO: Use LEB128 encoding to support >256 rules.
            const ruleIdx = currRule[ip++];
            returnStack.push([]);
            posStack.push(pos);
            ruleStack.push([currRule, ip]);
            currRule = this.compiledRules[ruleIdx];
            ip = 0;
            continue;
          case instr.begin:
            returnStack.push([]);
            posStack.push(pos);
            continue;
          case instr.nextChoice:
            if (returnStack.at(-1) === false) {
              // Previous alternative failed — clear and try the next.
              returnStack.pop();
            } else {
              // Previous alternative succeeded — skip the next one.
              skipToEnd();
            }
            continue;
          case instr.endChoice:
            continue;
          case instr.endRep:
          case instr.endNot:
          default:
            throw new Error(`unhandled bytecode: ${op}`);
        }
        let ret = returnStack.pop();
        if (ret === false) {
          returnStack.pop(); // Pop the list of child results.
          returnStack.push(false);
          pos = posStack.pop();
          skipToEnd();
        } else {
          returnStack.at(-1).push(ret);
        }
      } // end of rule body
      if (ruleStack.length === 1) {
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
      instr.begin,
      this.exps[0].toBytecode(ruleIndices),
      ...this.exps
        .slice(1)
        .flatMap((exp) => [instr.nextChoice, exp.toBytecode(ruleIndices)]),
      instr.endChoice,
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
