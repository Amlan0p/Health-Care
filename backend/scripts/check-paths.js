'use strict';
/**
 * Static integrity check for the frontend:
 *  1. every href/src in index.html that points at a local file exists;
 *  2. every relative `import … from './x.js'` in frontend/js resolves to a file;
 *  3. every sprite icon referenced (markup, JS strings, data JSON) exists in assets/icons/sprite.svg;
 *  4. every data-action in the markup has a registered handler in js/app.js;
 *  5. every `loadData('x')` has a matching js/data/x.json file.
 */
const fs = require('fs');
const path = require('path');

const FE = path.join(__dirname, '..', '..', 'frontend');
const problems = [];
const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

const html = read(path.join(FE, 'index.html'));
for (const m of html.matchAll(/\b(?:href|src)="([^"#:]+?)(?:#[^"]*)?"/g)) {
  const ref = m[1]; if (/^(https?:|data:|mailto:|tel:)/.test(ref) || ref === '') continue;
  if (!fs.existsSync(path.join(FE, ref))) problems.push(`index.html references missing file: ${ref}`);
}

const jsFiles = walk(path.join(FE, 'js')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  for (const m of read(f).matchAll(/from\s+'(\.[^']+)'/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) problems.push(`${path.relative(FE, f)} imports missing module ${m[1]}`);
  }
}

const sprite = read(path.join(FE, 'assets', 'icons', 'sprite.svg'));
const have = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
const used = new Set();
const scan = (text, where) => {
  for (const m of text.matchAll(/sprite\.svg#([a-z0-9-]+)/g)) used.add([m[1], where]);
  for (const m of text.matchAll(/\bicon\('([a-z0-9-]+)'/g)) used.add([m[1], where]);
  for (const m of text.matchAll(/icon\(\s*\w+\.icon\s*\)/g)) void m; // dynamic, covered by data scan below
};
scan(html, 'index.html'); jsFiles.forEach((f) => scan(read(f), path.relative(FE, f)));
const contentIcons = [];
for (const f of walk(path.join(FE, 'js', 'data')).filter((x) => x.endsWith('.json'))) {
  for (const m of read(f).matchAll(/"icon":\s*"([a-z0-9-]+)"/g)) contentIcons.push([m[1], path.relative(FE, f)]);
}
for (const f of fs.readdirSync(path.join(__dirname, '..', 'content')).filter((x) => x.endsWith('.json'))) {
  for (const m of read(path.join(__dirname, '..', 'content', f)).matchAll(/"icon":\s*"([a-z0-9-]+)"/g)) contentIcons.push([m[1], `backend/content/${f}`]);
}
for (const [name, where] of [...used, ...contentIcons]) if (!have.has(name)) problems.push(`icon "${name}" (${where}) is not in sprite.svg`);

const app = read(path.join(FE, 'js', 'app.js'));
const registered = new Set([...app.matchAll(/(?:^|[\s{,])'([a-z0-9-]+)':/g)].map((m) => m[1]));
const actions = new Set([...html.matchAll(/data-action="([a-z0-9-]+)"/g)].map((m) => m[1]));
for (const f of jsFiles.filter((x) => !x.endsWith('actions.js'))) for (const m of read(f).matchAll(/data-action="([a-z0-9-]+)"/g)) actions.add(m[1]);
for (const a of actions) if (!registered.has(a) && a !== 'open-legal') problems.push(`data-action="${a}" has no handler registered in js/app.js`);

for (const f of jsFiles) for (const m of read(f).matchAll(/loadData\('([a-z-]+)'\)/g)) {
  if (!fs.existsSync(path.join(FE, 'js', 'data', `${m[1]}.json`))) problems.push(`${path.relative(FE, f)}: missing data file ${m[1]}.json`);
}

console.log(`paths: ${actions.size} actions, ${have.size} sprite icons (${new Set([...used].map((u) => u[0])).size + new Set(contentIcons.map((c) => c[0])).size} referenced), ${jsFiles.length} modules checked`);
if (problems.length) { console.error(problems.map((p) => '✗ ' + p).join('\n')); process.exit(1); }
console.log('✓ all local references, imports, icons, actions and data files resolve');
