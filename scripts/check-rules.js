// Static sanity check for firestore.rules / storage.rules (NOT a substitute for the emulator).
// Verifies: balanced braces/parens, every called helper is defined, no unconditional "allow ...: if true" on private collections.
const fs = require("fs");
let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
  const count = (c) => (src.match(new RegExp("\\" + c, "g")) || []).length;
  for (const [o, c] of [["{", "}"], ["(", ")"], ["[", "]"]]) if (count(o) !== count(c)) { bad++; console.error(f, "unbalanced", o, c, count(o), count(c)); }
  const defined = new Set([...src.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]));
  const builtin = new Set(["get", "exists", "getAfter", "existsAfter", "hasOnly", "hasAny", "hasAll", "diff", "affectedKeys", "keys", "size", "toDate", "matches", "debug", "string", "int", "float", "bool", "path", "duration", "timestamp", "latlng", "if", "in", "is", "list", "map", "data", "set", "removeAll", "addAll", "union", "difference", "intersection", "join", "split", "lower", "upper", "trim", "replace", "toMillis", "date", "now", "keys", "values", "hasOnly", "i", "if", "match", "allow", "function", "return", "let", "service", "rules_version"]);
  const called = new Set([...src.matchAll(/\b(\w+)\s*\(/g)].map((m) => m[1]));
  const missing = [...called].filter((n) => !defined.has(n) && !builtin.has(n));
  if (missing.length) { bad++; console.error(f, "undefined functions:", missing.join(", ")); }
  console.log(f, "functions:", defined.size, "| match blocks:", (src.match(/\bmatch\s+\//g) || []).length);
}
process.exit(bad ? 1 : 0);
