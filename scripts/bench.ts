import { run, bench, group } from "mitata";
import fs from "node:fs";

import { ES5 } from "../src/es5.js";
import switchFact from "../src/switch-interp.js";
import treeWalkFact from "../src/tree-walk.js";

const es5Switch = ES5(switchFact);
const es5TreeWalk = ES5(treeWalkFact);

const sources = {
  jquery: readTestData("jquery-3.2.1.js"),
  react: readTestData("react-15.5.4.js"),
  underscore: readTestData("underscore-1.8.3.js"),
};

function readTestData(name: string) {
  return fs.readFileSync(
    new URL(`../test/data/${name}`, import.meta.url),
    "utf-8",
  );
}

// Warmup
es5TreeWalk.match("var x = 3");
es5Switch.match("var x = 3");

group("jquery", () => {
  bench("AST interp", () => es5TreeWalk.match(sources.jquery));
  bench("bytecode interp (switch)", () => es5Switch.match(sources.jquery));
});

group("react", () => {
  bench("AST interp", () => es5TreeWalk.match(sources.react));
  bench("bytecode interp (switch)", () => es5Switch.match(sources.react));
});

group("underscore", () => {
  bench("AST interp", () => es5TreeWalk.match(sources.underscore));
  bench("bytecode interp (switch)", () => es5Switch.match(sources.underscore));
});

await run({
  avg: true, // enable/disable avg column (default: true)
  json: false, // enable/disable json output (default: false)
  colors: true, // enable/disable colors (default: true)
  min_max: true, // enable/disable min/max column (default: true)
  collect: false, // enable/disable collecting returned values into an array during the benchmark (default: false)
  percentiles: false, // enable/disable percentiles column (default: true)
});
