// Config plugin: bundles the Scam Guardian web UI (the exact same HTML/CSS/JS and Lab voice clips as
// the web prototype in the repository root) into the APK at android/app/src/main/assets/web/.
// The app loads it from file:///android_asset/web/index.html, so it works without Metro or a network
// for the UI; only AI calls go to the backend.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const FILES = ['index.html', 'lab.css', 'lab.js', 'rules.js', 'scenarios.js', 'scam-check.js', 'live.js'];
const DIRS = ['audio'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/* The web app lives one level up (repository root). `npm run sync-web` also mirrors it into
 * mobile/web for builds where only the mobile folder is available. */
function webRoot(projectRoot) {
  const up = path.resolve(projectRoot, '..');
  if (FILES.every(f => fs.existsSync(path.join(up, f)))) return up;
  const local = path.join(projectRoot, 'web');
  if (FILES.every(f => fs.existsSync(path.join(local, f)))) return local;
  throw new Error('withWebAssets: Scam Guardian web files not found in ' + up + ' or ' + local);
}

module.exports = function withWebAssets(config) {
  return withDangerousMod(config, ['android', async cfg => {
    const src = webRoot(cfg.modRequest.projectRoot);
    const dst = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'web');
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    for (const f of FILES) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    for (const d of DIRS) if (fs.existsSync(path.join(src, d))) copyDir(path.join(src, d), path.join(dst, d));
    return cfg;
  }]);
};
