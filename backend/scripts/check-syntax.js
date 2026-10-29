'use strict';
// Syntax-checks every .js file in backend/ and frontend/ (frontend files are ES modules).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.git', 'vendor']);
let failed = 0; let count = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) check(p);
  }
}
function check(file) {
  count += 1;
  const inFrontend = file.startsWith(path.join(ROOT, 'frontend'));
  // Frontend: ES modules or classic scripts — try module parsing via a temp .mjs copy.
  const target = inFrontend ? path.join(require('os').tmpdir(), `chk-${count}.mjs`) : file;
  if (inFrontend) fs.copyFileSync(file, target);
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }); }
  catch (e) { failed += 1; console.error(`✗ ${path.relative(ROOT, file)}\n${e.stderr.toString()}`); }
  finally { if (inFrontend) fs.rmSync(target, { force: true }); }
}
walk(path.join(ROOT, 'backend'));
walk(path.join(ROOT, 'frontend'));
console.log(`${count} files checked, ${failed} failed.`);
process.exit(failed ? 1 : 0);
