import { CstNode } from "./types.ts";

export type Result = CstNode | false;

export interface PExpr {
  toBytecode(ruleIndices: Map<string, number>): number[];
}

function assert(cond: boolean, msg = "") {
  if (!cond) {
    throw new Error(msg);
  }
}

function checkNotNull<T>(x: T): NonNullable<T> {
  if (x == null) {
    throw new Error(`expected non-null: ${x}`);
  }
  return x as NonNullable<T>;
}

// Return an array containing four bytes encoding `val` in little-endian order.
function i32(val: number): number[] {
  assert(
    Number.isInteger(val) && (val & 0xffffffff) === val,
    "not a 32-bit integer",
  );
  const buf = new ArrayBuffer(4);
  new Int32Array(buf)[0] = val;
  return Array.from(new Uint8Array(buf));
}

function i16(val: number): number[] {
  assert(
    Number.isInteger(val) && (val & 0xffff) === val,
    "not a 16-bit integer",
  );
  const buf = new ArrayBuffer(2);
  new Int16Array(buf)[0] = val;
  return Array.from(new Uint8Array(buf));
}

function sizeInBytes(frag: number[]) {
  return frag.flat(Infinity).length;
}

const instr = {
  app: 1,
  terminal: 2,
  range: 3,
  jumpIfFailed: 9,
  jumpIfSucceeded: 10,
  jump: 11,
  clearResult: 12,
  newResultList: 13,
  appendResult: 14,
  savePos: 15,
  restorePos: 16,
  restorePosCond: 17,
  fail: 18,
  not: 19,
  debug1: 20,
  debug2: 21,
};

// A jump fragment should take 5 bytes: a jump instruction plus an i32 offset.
const jumpFragSize = sizeInBytes([instr.jump, ...i32(0)]);

class Matcher {
  compiledRules: Uint8Array[];
  startRuleIndex: number;
  textDecoder: TextDecoder;

  ruleIndexByName: Map<string, number>;
  ruleNameByIndex: Map<number, string>;

  constructor(rules: { [k: string]: PExpr }) {
    const ruleIndexByName = (this.ruleIndexByName = new Map(
      Object.keys(rules).map((k, i) => [k, i]),
    ));
    this.ruleNameByIndex = new Map(
      Array.from(ruleIndexByName.entries()).map(([idx, name]) => [name, idx]),
    );

    // Treat rule bodies as implicitly being sequences.
    const ensureSeq = (body: PExpr) =>
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

  match(input: string, startRule = "start"): Result {
    let pos = 0;

    this.startRuleIndex = this.ruleIndexByName.get(startRule);

    const returnStack: Result[] = [];
    const posStack: number[] = [];
    const ruleStack: [Uint8Array, number][] = [];
    let currRule = new Uint8Array([instr.app, this.startRuleIndex]);
    let ip = 0;

    // const logRuleEnter = (idx: number) => {
    //   const indent = new Array(ruleStack.length).join(" ");
    //   const ruleName = this.ruleNameByIndex.get(idx);
    //   if (ruleName === "unicodeCombiningMark") debugger;
    //   console.log(indent + ruleName + ", pos = " + pos);
    // };
    // logRuleEnter(this.startRuleIndex);

    const progress: number[] = [];
    //    let ruleIdxs: number[] = [this.startRuleIndex];

    while (true) {
      while (ip < currRule.length) {
        const op = currRule[ip++];
        const origPos = pos;
        switch (op) {
          case instr.terminal:
            const len = currRule[ip++];
            const str = this.textDecoder.decode(
              new Uint8Array(currRule.slice(ip, ip + len)),
            );
            ip += len;

            let ret: Result = str;
            for (let i = 0; i < str.length; i++) {
              if (input[pos++] !== str[i]) {
                ret = false;
                pos = origPos;
                break;
              }
            }
            returnStack.push(ret);
            break;
          case instr.range:
            const startCp = currRule[ip++] | (currRule[ip++] << 8);
            const endCp = currRule[ip++] | (currRule[ip++] << 8);
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
            // ruleIdxs.push(ruleIdx);
            ruleStack.push([currRule, ip]);
            currRule = this.compiledRules[ruleIdx];
            ip = 0;
            //            logRuleEnter(ruleIdx);
            break;
          case instr.restorePos:
            pos = checkNotNull(posStack.pop());
            break;
          case instr.restorePosCond:
            const prevPos = checkNotNull(posStack.pop());
            if (returnStack.at(-1) === false) {
              pos = prevPos;
              returnStack.splice(-2, 1); // Throw away result
            }
            break;
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
            break;
          case instr.newResultList:
            returnStack.push([]);
            break;
          case instr.savePos:
            posStack.push(pos);
            break;
          case instr.appendResult:
            // TODO: Can we avoid the cast here?
            (returnStack.at(-2) as any[]).push(returnStack.pop());
            break;
          case instr.clearResult:
            checkNotNull(returnStack.pop());
            break;
          case instr.fail:
            returnStack.push(false);
            break;
          case instr.not:
            returnStack.push(checkNotNull(returnStack.pop()) ? false : []);
            break;
          case instr.debug1:
            progress.push(pos);
            break;
          case instr.debug2:
            const beforePos = progress.pop();
            if (pos === beforePos && returnStack.at(-1)) {
              throw new Error("possible infinite loop");
            }
            break;
          default:
            throw new Error(`unhandled bytecode: ${op}, ip ${ip}`);
        }
      } // end of rule body
      if (ruleStack.length === 1) {
        break;
      }
      // ruleIdxs.pop();
      [currRule, ip] = ruleStack.pop();
    }
    assert(posStack.length === 0, "too much on pos stack");
    assert(returnStack.length === 1, "too much on return stack");
    return pos >= input.length ? returnStack[0] : false;
  }
}

class RuleApplication {
  constructor(public ruleName: string) {}

  toBytecode(ruleIndices: Map<string, number>) {
    const idx = ruleIndices.get(this.ruleName);
    return [instr.app, idx];
  }
}

class Terminal {
  constructor(public str: string) {}

  toBytecode() {
    const utf8Bytes = new TextEncoder().encode(this.str);
    assert(utf8Bytes.length <= 256, "max terminal length is 256");
    return [instr.terminal, utf8Bytes.length, ...utf8Bytes];
  }
}

class Range {
  constructor(
    public start: string,
    public end: string,
  ) {}

  toBytecode() {
    const startCp = this.start.codePointAt(0);
    const endCp = this.end.codePointAt(0);
    assert(startCp <= 0xffff, `range start too high: ${startCp}`);
    assert(endCp <= 0xffff, `range end too high: ${endCp}`);
    return [instr.range, ...i16(startCp), ...i16(endCp)];
  }
}

class Choice {
  constructor(public exps: PExpr[]) {}

  toBytecode(ruleIndices: Map<string, number>) {
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

class Sequence {
  constructor(public exps: PExpr[]) {}

  toBytecode(ruleIndices: Map<string, number>) {
    if (this.exps.length === 0) {
      return [instr.newResultList];
    }

    const fragments = this.exps.map((e) =>
      e.toBytecode(ruleIndices).flat(Infinity),
    );

    const bytes = [];

    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (const frag of fragments.reverse()) {
      const disp: number = bytes.length + 1;
      bytes.unshift(
        ...frag,
        instr.jumpIfFailed,
        ...i32(disp),
        instr.appendResult,
      );
    }
    bytes.unshift(instr.newResultList, instr.savePos);

    bytes.push(instr.restorePosCond); // This is the jump target

    return bytes;
  }
}

class Not {
  constructor(public exp: PExpr) {}

  toBytecode(ruleIndices: Map<string, number>) {
    return [
      instr.savePos,
      ...this.exp.toBytecode(ruleIndices),
      instr.not,
      instr.restorePos,
    ];
  }
}

class Repetition {
  constructor(public exp: PExpr) {
    this.exp = exp;
  }

  toBytecode(ruleIndices: Map<string, number>) {
    const loopBody = [
      instr.debug1,
      ...this.exp.toBytecode(ruleIndices),
      instr.debug2,
      instr.jumpIfFailed,
      ...i32(jumpFragSize + 1),
      instr.appendResult,
    ];

    const loop = [
      ...loopBody,
      // TODO: This could be an unconditional jump.
      instr.jumpIfSucceeded,
      // Displacement is relative to the instruction *after* the jump, so
      // we need to account for the jump itself when jumping backwards.
      ...i32(-sizeInBytes(loopBody) - jumpFragSize),
    ];

    return [instr.newResultList, ...loop, instr.clearResult];
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
