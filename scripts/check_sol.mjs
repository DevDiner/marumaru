// Static balance check for Solidity files (forge is absent on the editing box).
// Verifies {}/()/[]/ balance ignoring comments and strings. NOT a compiler ( checking on formatting)
// the authoritative check is `forge test` on the build machine.
import fs from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/check_sol.mjs <file.sol> [...]');
  process.exit(2);
}
const pairs = { '{': '}', '(': ')', '[': ']' };
let ok = true;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const stack = [];
  let inLine = false, inBlock = false, inStr = false, strc = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === strc && s[i - 1] !== '\\') inStr = false; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = true; strc = c; continue; }
    if (c === '{' || c === '(' || c === '[') stack.push(c);
    else if (c === '}' || c === ')' || c === ']') {
      const o = stack.pop();
      if (!o || pairs[o] !== c) { ok = false; console.log('MISMATCH', f, 'at', i, 'got', c); break; }
    }
  }
  if (stack.length) { ok = false; console.log('UNCLOSED', f, ':', stack.join('')); }
  else console.log('OK', f);
}
process.exit(ok ? 0 : 1);
