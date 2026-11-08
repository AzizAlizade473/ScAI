// Config plugin for local Windows builds only: Windows limits paths to 260 characters, and the app's
// generated C++ code (React Native codegen for gesture-handler, screens, safe-area) is compiled under
// android/app/.cxx/RelWithDebInfo/<hash>/<abi>/... which goes past that limit. When SG_CXX_DIR is set
// (scripts/build-apk-local.ps1 sets it), the CMake staging folder moves to that short path and CMake hashes
// object-file paths longer than 128 characters (CMAKE_OBJECT_PATH_MAX).
// EAS / Linux / macOS builds do not set it and are unchanged.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withShortCxxDir(config) {
  const dir = process.env.SG_CXX_DIR;
  if (!dir) return config;
  return withAppBuildGradle(config, cfg => {
    const marker = '// sg-short-cxx';
    if (!cfg.modResults.contents.includes(marker)) {
      const p = dir.replace(/\\/g, '/');
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /\nandroid\s*\{/,
        `\nandroid {\n    ${marker}\n    externalNativeBuild { cmake { buildStagingDirectory = file("${p}") } }\n    defaultConfig { externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=128" } } }`
      );
    }
    return cfg;
  });
};
