import * as fs from "node:fs";

import { ES5 } from "../src/es5.js";
import switchFact from "../src/switch-interp.js";

const es5Switch = ES5(switchFact);
const source = fs.readFileSync(process.argv[2], "utf-8");

es5Switch.match("var x = 3"); // Warmup

for (let i = 0; i < 5; i++) {
  const startTime = performance.now();
  es5Switch.match(source);
  console.log(`***************** ${performance.now() - startTime}ms`);
}
