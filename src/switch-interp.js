function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

// Return an array containing four bytes encoding `val` in little-endian order.
function i32(val) {
  assert(
    Number.isInteger(val) && (val & 0xffffffff) === val,
    "not a 32-bit integer",
  );
  const buf = new ArrayBuffer(4);
  new Int32Array(buf)[0] = val;
  return Array.from(new Uint8Array(buf));
}

function sizeInBytes(frag) {
  return frag.flat(Infinity).length;
}

const instr = {
  app: 1,
  terminal: 2,
  range: 3,
  nextChoice: 5,
  endChoice: 6,
  endRep: 7,
  endNot: 8,
  jumpIfFailed: 9,
  jumpIfSucceeded: 10,
  pass: 11,
  clearResult: 12,
  newResultList: 13,
  appendResult: 14,
  savePos: 15,
  restorePosCond: 16,
  fail: 17,
};

// A jump fragment should take 5 bytes: a jump instruction plus an i32 offset.
const jumpFragSize = sizeInBytes([instr.jump, i32(0)]);

export class Matcher {
  constructor(rules) {
    const ruleIndexByName = new Map(Object.keys(rules).map((k, i) => [k, i]));

    // Treat rule bodies as implicitly being sequences.
    const ensureSeq = (body) =>
      body instanceof Sequence ? body : new Sequence([body]);

    this.compiledRules = [];
    for (const ruleName in rules) {
      const bytes = ensureSeq(rules[ruleName]).toBytecode(ruleIndexByName);
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
            ruleStack.push([currRule, ip]);
            currRule = this.compiledRules[ruleIdx];
            ip = 0;
            continue;
          case instr.savePos:
            posStack.push(pos);
            continue;
          case instr.restorePosCond:
            const prevPos = posStack.pop();
            if (returnStack.at(-1) === false) pos = prevPos;
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
          case instr.jumpIfFailed:
          case instr.jumpIfSucceeded:
            let disp =
              currRule[ip++] |
              (currRule[ip++] << 8) |
              (currRule[ip++] << 16) |
              (currRule[ip++] << 24);
            let cond = returnStack.at(-1) === false;
            if (op === instr.jumpIfSucceeded) cond = !cond;
            if (cond) ip += disp;
            continue;
          case instr.newResultList:
            returnStack.push([]);
            posStack.push(pos);
            continue;
          case instr.appendResult:
            returnStack.at(-2).push(returnStack.pop());
            posStack.pop();
            continue;
          case instr.clearResult:
            returnStack.pop();
            continue;
          case instr.pass:
            returnStack.push([]);
            continue;
          case instr.fail:
            returnStack.push(false);
            continue;
          case instr.endRep:
          case instr.endNot:
          default:
            throw new Error(`unhandled bytecode: ${op}, ip ${ip}`);
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
    const fragments = this.exps.map((e) =>
      e.toBytecode(ruleIndices).flat(Infinity),
    );

    const bytes = [instr.fail];

    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (const frag of fragments.reverse()) {
      const disp = bytes.length + 1;
      bytes.unshift(
        ...frag,
        instr.jumpIfSucceeded,
        ...i32(disp),
        instr.clearResult,
      );
    }
    return bytes;
  }
}

export class Sequence {
  constructor(exps) {
    this.exps = exps;
  }

  toBytecode(ruleIndices) {
    if (this.exps.length === 0) {
      return [instr.pass, instr.appendResult];
    }

    const fragments = this.exps.map((e) =>
      e.toBytecode(ruleIndices).flat(Infinity),
    );

    const bytes = [];

    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (const frag of fragments.reverse()) {
      const disp = bytes.length + 1;
      bytes.unshift(
        ...frag,
        instr.jumpIfFailed,
        ...i32(disp),
        instr.appendResult,
      );
    }
    bytes.unshift(instr.newResultList);

    bytes.push(instr.restorePosCond); // This is the jump target

    return bytes;
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
