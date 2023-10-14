"use strict";
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.Repetition =
  exports.Not =
  exports.Sequence =
  exports.Choice =
  exports.Range =
  exports.Terminal =
  exports.RuleApplication =
  exports.Matcher =
    void 0;
function assert(cond, msg) {
  if (msg === void 0) {
    msg = "";
  }
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
  var buf = new ArrayBuffer(4);
  new Int32Array(buf)[0] = val;
  return Array.from(new Uint8Array(buf));
}
function sizeInBytes(frag) {
  return frag.flat(Infinity).length;
}
var instr = {
  app: 1,
  terminal: 2,
  range: 3,
  nextChoice: 5,
  endChoice: 6,
  endRep: 7,
  endNot: 8,
  jumpIfFailed: 9,
  jumpIfSucceeded: 10,
  jump: 11,
  clearResult: 12,
  newResultList: 13,
  appendResult: 14,
  savePos: 16,
  restorePosCond: 17,
  fail: 18,
};
// A jump fragment should take 5 bytes: a jump instruction plus an i32 offset.
var jumpFragSize = sizeInBytes([instr.jump, i32(0)]);
var Matcher = /** @class */ (function () {
  function Matcher(rules) {
    var ruleIndexByName = new Map(
      Object.keys(rules).map(function (k, i) {
        return [k, i];
      }),
    );
    // Treat rule bodies as implicitly being sequences.
    var ensureSeq = function (body) {
      return body instanceof Sequence ? body : new Sequence([body]);
    };
    this.compiledRules = [];
    for (var ruleName in rules) {
      var bytes = ensureSeq(rules[ruleName]).toBytecode(ruleIndexByName);
      var idx = ruleIndexByName.get(ruleName);
      this.compiledRules[idx] = new Uint8Array(bytes.flat(Infinity));
    }
    this.startRuleIndex = ruleIndexByName.get("start");
    this.textDecoder = new TextDecoder();
  }
  Matcher.prototype.match = function (input) {
    var _a;
    var pos = 0;
    var returnStack = [];
    var posStack = [];
    var ruleStack = [];
    var currRule = [instr.app, this.startRuleIndex];
    var ip = 0;
    var skipToEnd = function () {
      // Advance to the end of the current sequence
      var nesting = 0;
      while (ip < currRule.length) {
        // prettier-ignore
        switch (currRule[ip++]) {
                    case instr.app:
                        ip += 1;
                        break;
                    case instr.terminal:
                        ip += currRule[ip++];
                        break;
                    case instr.range:
                        ip += 2;
                        break;
                    case instr.begin:
                        ++nesting;
                        break;
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
        var op = currRule[ip++];
        switch (op) {
          // Atomic instructions set `ret`, and use `break`.
          // Higher-order instructions use `continue`.
          case instr.terminal:
            var len = currRule[ip++];
            var str = this.textDecoder.decode(currRule.slice(ip, ip + len));
            ip += len;
            var ret = str;
            var origPos = pos;
            for (var i = 0; i < len; i++) {
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
            var startCp = currRule[ip++];
            var endCp = currRule[ip++];
            var nextCp = input.codePointAt(pos);
            if (startCp <= nextCp && nextCp <= endCp) {
              pos++;
              returnStack.push(String.fromCodePoint(nextCp));
            } else {
              returnStack.push(false);
            }
            break;
          case instr.app:
            // TODO: Use LEB128 encoding to support >256 rules.
            var ruleIdx = currRule[ip++];
            ruleStack.push([currRule, ip]);
            currRule = this.compiledRules[ruleIdx];
            ip = 0;
            continue;
          case instr.savePos:
            posStack.push(pos);
            continue;
          case instr.restorePosCond:
            var prevPos = posStack.pop();
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
            var disp =
              currRule[ip++] |
              (currRule[ip++] << 8) |
              (currRule[ip++] << 16) |
              (currRule[ip++] << 24);
            var cond = returnStack.at(-1) === false;
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
          case instr.fail:
            returnStack.push(false);
            continue;
          case instr.endRep:
          case instr.endNot:
          default:
            throw new Error(
              "unhandled bytecode: ".concat(op, ", ip ").concat(ip),
            );
        }
      } // end of rule body
      if (ruleStack.length === 1) {
        break;
      }
      (_a = ruleStack.pop()), (currRule = _a[0]), (ip = _a[1]);
    }
    return pos >= input.length ? returnStack[0] : undefined;
  };
  return Matcher;
})();
exports.Matcher = Matcher;
var RuleApplication = /** @class */ (function () {
  function RuleApplication(ruleName) {
    this.ruleName = ruleName;
  }
  RuleApplication.prototype.toBytecode = function (ruleIndices) {
    var idx = ruleIndices.get(this.ruleName);
    return [instr.app, idx];
  };
  return RuleApplication;
})();
exports.RuleApplication = RuleApplication;
var Terminal = /** @class */ (function () {
  function Terminal(str) {
    this.str = str;
  }
  Terminal.prototype.toBytecode = function () {
    var utf8Bytes = new TextEncoder().encode(this.str);
    assert(utf8Bytes.length <= 256, "max terminal length is 256");
    return __spreadArray([instr.terminal, utf8Bytes.length], utf8Bytes, true);
  };
  return Terminal;
})();
exports.Terminal = Terminal;
var Range = /** @class */ (function () {
  function Range(start, end) {
    this.start = start;
    this.end = end;
  }
  Range.prototype.toBytecode = function () {
    var startCp = this.start.codePointAt(0);
    var endCp = this.end.codePointAt(0);
    assert(startCp <= 0xffff, "range start too high: ".concat(startCp));
    assert(endCp <= 0xffff, "range end too high: ".concat(endCp));
    return [instr.range, startCp, endCp];
  };
  return Range;
})();
exports.Range = Range;
var Choice = /** @class */ (function () {
  function Choice(exps) {
    this.exps = exps;
  }
  Choice.prototype.toBytecode = function (ruleIndices) {
    var fragments = this.exps.map(function (e) {
      return e.toBytecode(ruleIndices).flat(Infinity);
    });
    var bytes = [instr.fail];
    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (var _i = 0, _a = fragments.reverse(); _i < _a.length; _i++) {
      var frag = _a[_i];
      var disp = bytes.length + 1;
      bytes.unshift.apply(
        bytes,
        __spreadArray(
          __spreadArray(
            __spreadArray(
              __spreadArray([], frag, false),
              [instr.jumpIfSucceeded],
              false,
            ),
            i32(disp),
            false,
          ),
          [instr.clearResult],
          false,
        ),
      );
    }
    return bytes;
  };
  return Choice;
})();
exports.Choice = Choice;
var Sequence = /** @class */ (function () {
  function Sequence(exps) {
    this.exps = exps;
  }
  Sequence.prototype.toBytecode = function (ruleIndices) {
    if (this.exps.length === 0) {
      return [instr.newResultList, instr.appendResult];
    }
    var fragments = this.exps.map(function (e) {
      return e.toBytecode(ruleIndices).flat(Infinity);
    });
    var bytes = [];
    // Walk the fragments in reverse order so we can easily calculate
    // jump displacement.
    for (var _i = 0, _a = fragments.reverse(); _i < _a.length; _i++) {
      var frag = _a[_i];
      var disp = bytes.length + 1;
      bytes.unshift.apply(
        bytes,
        __spreadArray(
          __spreadArray(
            __spreadArray(
              __spreadArray([], frag, false),
              [instr.jumpIfFailed],
              false,
            ),
            i32(disp),
            false,
          ),
          [instr.appendResult],
          false,
        ),
      );
    }
    bytes.unshift(instr.newResultList);
    bytes.push(instr.restorePosCond); // This is the jump target
    return bytes;
  };
  return Sequence;
})();
exports.Sequence = Sequence;
var Not = /** @class */ (function () {
  function Not(exp) {
    this.exp = exp;
  }
  Not.prototype.toBytecode = function (ruleIndices) {
    return [instr.beginNot, this.exp.toBytecode(ruleIndices), instr.end];
  };
  return Not;
})();
exports.Not = Not;
var Repetition = /** @class */ (function () {
  function Repetition(exp) {
    this.exp = exp;
  }
  Repetition.prototype.toBytecode = function (ruleIndices) {
    var loopBody = __spreadArray(
      __spreadArray(
        __spreadArray(
          __spreadArray([], this.exp.toBytecode(ruleIndices), true),
          [instr.jumpIfFailed],
          false,
        ),
        i32(jumpFragSize + 1),
        true,
      ),
      [instr.appendResult],
      false,
    );
    var loop = __spreadArray(
      __spreadArray(
        __spreadArray([], loopBody, true),
        [
          // TODO: This could be an unconditional jump.
          instr.jumpIfSucceeded,
        ],
        false,
      ),
      i32(-sizeInBytes(loopBody) - jumpFragSize),
      true,
    );
    return __spreadArray(
      __spreadArray([instr.newResultList], loop, true),
      [instr.appendResult],
      false,
    );
  };
  return Repetition;
})();
exports.Repetition = Repetition;
//# sourceMappingURL=switch-interp.js.map
