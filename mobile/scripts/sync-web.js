// Mirrors the web UI from the repository root into mobile/web (used by plugins/withWebAssets.js when the
// repository root is not available, e.g. a build started from a copy of just this folder).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.resolve(__dirname, '..', 'web');
const FILES = ['index.html', 'lab.css', 'lab.js', 'rules.js', 'scenarios.js', 'scam-check.js', 'live.js'];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
fs.cpSync(path.join(ROOT, 'audio'), path.join(OUT, 'audio'), { recursive: true });
console.log('web UI copied to', OUT);
