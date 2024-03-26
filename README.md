# Pegboard

PEG parsing in TypeScript, two ways:

- an AST interpreter (src/tree-walk.ts)
- a switch-based bytecode interpreter (src/switch-interp.ts)

## Tests

`npm test`

## Benchmarks

`npm run bench:bun` (for JSC) or `npm run bench:node` (V8)

## Debugging and profiling

Deopts:

1. Ensure [Deopt Explorer](https://github.com/microsoft/deoptexplorer-vscode) is
   is installed in VSCode.
2. `npx tsc && npx dexnode build/scripts/parse.js test/data/jquery-3.2.1.js`
3. Open the log file (named something like `isolate-0x140078000-55537-v8.log`)
   in Deopt Explorer.
