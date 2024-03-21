import { MemoTable } from "./MemoTable.js";
import { Result } from "./types.js";

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

const OP_APP = 1;
const OP_TERMINAL = 2;
const OP_RANGE = 3;
const OP_JUMP_IF_FAILED = 4;
const OP_JUMP_IF_SUCCEEDED = 5;
const OP_END = 6;
const OP_RETURN = 7;
const OP_RETURN_COND = 8;
const OP_NEW_RESULT_LIST = 9;
const OP_APPEND_RESULT = 10;
const OP_SAVE_POS = 11;
const OP_RESTORE_POS = 12;
const OP_RESTORE_POS_COND = 13;
const OP_FAIL = 14;
const OP_NOT = 15;
const OP_MEMOIZE = 16;

// A jump fragment should take 5 bytes: a jump instruction plus an i32 offset.
const jumpFragSize = sizeInBytes([OP_JUMP_IF_FAILED, ...i32(0)]);

class Matcher {
  bytecode: Uint8Array;

  ruleIndexByName: Map<string, number>;
  ruleNameByIndex: Map<number, string>;
  ruleOffsetByIndex: Map<number, number>;

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

    const compiledRules: Uint8Array[] = [];
    for (const ruleName in rules) {
      const bytes = ensureSeq(rules[ruleName]).toBytecode(ruleIndexByName);
      const idx = checkNotNull(ruleIndexByName.get(ruleName));
      assert(idx < 256);
      compiledRules[idx] = new Uint8Array([
        ...bytes.flat(Infinity),
        OP_MEMOIZE,
        idx,
        OP_END,
      ]);
    }
    this.ruleOffsetByIndex = new Map<number, number>();

    let totalLen = compiledRules.reduce((acc, arr) => acc + arr.length, 0);
    this.bytecode = new Uint8Array(totalLen);

    let offset = 0;
    for (const [i, arr] of compiledRules.entries()) {
      this.ruleOffsetByIndex.set(i, offset);
      this.bytecode.set(arr, offset);
      offset += arr.length;
    }
  }

  match(input: string, startRule = "start"): Result {
    let pos = 0;

    const returnStack: Result[] = [];
    const posStack: number[] = [];
    const ruleStack: [number, number][] = [];
    const inputLen = input.length;
    let result: Result;

    const memoTable = new MemoTable<number>();
    const bc = this.bytecode;

    const startRuleIndex = checkNotNull(this.ruleIndexByName.get(startRule));

    // ruleStack.push([startRuleIndex, 0]);
    // posStack.push(pos);
    let ip = this.ruleOffsetByIndex.get(startRuleIndex);

    while (true) {
      const op = bc[ip++];
      const origPos = pos;
      switch (op) {
        case OP_APP:
          // TODO: Use LEB128 encoding to support >256 rules.
          const ruleIdx = bc[ip++];
          if (memoTable.has(pos, ruleIdx)) {
            const { cst, nextPos } = memoTable.getResult(pos, ruleIdx);
            result = cst;
            pos = nextPos;
          } else {
            ruleStack.push([ruleIdx, ip]);
            posStack.push(origPos);
            ip = this.ruleOffsetByIndex.get(ruleIdx);
          }
          break;
        case OP_TERMINAL:
          // TODO: Cache the string to avoid reconstructing it every time?
          const strLen = bc[ip++];
          const bytes = new Uint8Array(bc.slice(ip, ip + strLen * 2));
          const codes = new Uint16Array(bytes.buffer);
          ip += strLen * 2;
          result = "";
          for (let i = 0; i < strLen; i++) {
            const s = String.fromCharCode(codes[i]);
            if (pos >= inputLen || input[pos++] !== s) {
              result = null;
              pos = origPos;
              break;
            }
            result += s;
          }
          break;
        case OP_RANGE:
          const startCp = bc[ip++] | (bc[ip++] << 8);
          const endCp = bc[ip++] | (bc[ip++] << 8);
          const nextCp = pos < inputLen ? input.codePointAt(pos) : -1;
          if (startCp <= nextCp && nextCp <= endCp) {
            pos++;
            result = String.fromCodePoint(nextCp);
          } else {
            result = null;
          }
          break;
        case OP_JUMP_IF_FAILED: {
          let disp =
            bc[ip++] | (bc[ip++] << 8) | (bc[ip++] << 16) | (bc[ip++] << 24);
          if (result === null) ip += disp;
          break;
        }
        case OP_JUMP_IF_SUCCEEDED: {
          let disp =
            bc[ip++] | (bc[ip++] << 8) | (bc[ip++] << 16) | (bc[ip++] << 24);
          if (result !== null) ip += disp;
          break;
        }
        case OP_RETURN:
          result = returnStack.pop();
          break;
        case OP_RETURN_COND:
          const outerResult = returnStack.pop();
          result = result !== null ? outerResult : null;
          break;
        case OP_NEW_RESULT_LIST:
          returnStack.push([]);
          break;
        case OP_APPEND_RESULT:
          // TODO: Can we avoid the cast here?
          (returnStack.at(-1) as Result[]).push(result);
          break;
        case OP_SAVE_POS:
          posStack.push(pos);
          break;
        case OP_RESTORE_POS:
          pos = checkNotNull(posStack.pop());
          break;
        case OP_RESTORE_POS_COND:
          const prevPos = checkNotNull(posStack.pop());
          if (result === null) {
            pos = prevPos;
          }
          break;
        case OP_FAIL:
          result = null;
          break;
        case OP_NOT:
          result = result ? null : [];
          break;
        case OP_END:
          if (ruleStack.length === 0) {
            assert(posStack.length === 0, "too much on pos stack");
            assert(
              returnStack.length === 0,
              `too much on return stack ${returnStack}`,
            );
            return pos >= inputLen ? result : null;
          }
          posStack.pop();
          const [_, savedIp] = ruleStack.pop();

          // Restore control to the outer rule.
          ip = savedIp;
          break;
        case OP_MEMOIZE:
          const memoIdx = bc[ip++];
          if (posStack.length > 0) {
            const memoPos = checkNotNull(posStack.at(-1));
            memoTable.memoizeResult(memoPos, memoIdx, {
              cst: result,
              nextPos: pos,
            });
          }
          break;
        default:
          throw new Error(`unhandled bytecode: ${op}, ip ${ip}`);
      }
    }
  }
}

class RuleApplication {
  constructor(public ruleName: string) {}

  toBytecode(ruleIndices: Map<string, number>) {
    const idx = ruleIndices.get(this.ruleName);
    return [OP_APP, idx];
  }
}

class Terminal {
  constructor(public str: string) {}

  toBytecode() {
    const { str } = this;
    const codes = new Uint16Array(str.length);
    for (let i = 0; i < str.length; i++) {
      codes[i] = str[i].charCodeAt(0);
    }
    const bytes = Array.from(new Uint8Array(codes.buffer));
    assert(codes.length <= 256, "max terminal length is 256");
    return [OP_TERMINAL, codes.length, ...bytes];
  }
}

class Range {
  constructor(
    public start: string,
    public end: string,
  ) {}

  toBytecode() {
    const startCp = checkNotNull(this.start.codePointAt(0));
    const endCp = checkNotNull(this.end.codePointAt(0));
    assert(startCp <= 0xffff, `range start too high: ${startCp}`);
    assert(endCp <= 0xffff, `range end too high: ${endCp}`);
    return [OP_RANGE, ...i16(startCp), ...i16(endCp)];
  }
}

class Choice {
  constructor(public exps: PExpr[]) {}

  toBytecode(ruleIndices: Map<string, number>) {
    const fragments = this.exps.map((e) =>
      e.toBytecode(ruleIndices).flat(Infinity),
    );

    const bytes = [OP_FAIL];

    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (const frag of fragments.reverse()) {
      const disp = bytes.length;
      bytes.unshift(...frag, OP_JUMP_IF_SUCCEEDED, ...i32(disp));
    }
    return bytes;
  }
}

class Sequence {
  constructor(public exps: PExpr[]) {}

  toBytecode(ruleIndices: Map<string, number>) {
    if (this.exps.length === 0) {
      return [OP_NEW_RESULT_LIST, OP_RETURN];
    }

    const fragments = this.exps.map((e) =>
      e.toBytecode(ruleIndices).flat(Infinity),
    );

    const bytes = [];

    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (const frag of fragments.reverse()) {
      const disp: number = bytes.length + 1;
      bytes.unshift(...frag, OP_JUMP_IF_FAILED, ...i32(disp), OP_APPEND_RESULT);
    }
    bytes.unshift(OP_NEW_RESULT_LIST, OP_SAVE_POS);
    bytes.push(OP_RESTORE_POS_COND); // This is the jump target
    bytes.push(OP_RETURN_COND);

    return bytes;
  }
}

class Not {
  constructor(public exp: PExpr) {}

  toBytecode(ruleIndices: Map<string, number>) {
    return [
      OP_SAVE_POS,
      ...this.exp.toBytecode(ruleIndices),
      OP_NOT,
      OP_RESTORE_POS,
    ];
  }
}

class Repetition {
  constructor(public exp: PExpr) {
    this.exp = exp;
  }

  toBytecode(ruleIndices: Map<string, number>) {
    const loopBody = [
      ...this.exp.toBytecode(ruleIndices),
      OP_JUMP_IF_FAILED,
      ...i32(jumpFragSize + 1),
      OP_APPEND_RESULT,
    ];

    const loop = [
      ...loopBody,
      // TODO: This could be an unconditional jump.
      OP_JUMP_IF_SUCCEEDED,
      // Displacement is relative to the instruction *after* the jump, so
      // we need to account for the jump itself when jumping backwards.
      ...i32(-sizeInBytes(loopBody) - jumpFragSize),
    ];

    return [OP_NEW_RESULT_LIST, ...loop, OP_RETURN];
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
