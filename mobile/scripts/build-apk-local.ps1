# Builds a standalone release APK on this Windows PC (no Expo account needed) and copies it to
# the repository root as ScamGuardian.apk.
#
#   powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk-local.ps1
#
# Needs JDK 17+ and the Android SDK. Override the defaults with the JAVA_HOME / ANDROID_HOME environment
# variables, and the backend baked into the app with EXPO_PUBLIC_API_URL (it can also be changed in the
# app: Settings -> Server address).
#
# Windows limits paths to 260 characters and React Native's C++ build (react-native-worklets) goes past that
# from a deep folder such as C:\Users\...\Downloads\...; a virtual drive (subst) does not help because Node
# resolves it back to the real path. So the app is mirrored into a short real folder (SG_BUILD_DIR, default
# C:\m) and built there. Only source files are copied: no .git, no data, no secrets (.env is excluded).
param([switch]$Resume)   # -Resume: continue the last build in the build folder (skips copy, install, prebuild)
$ErrorActionPreference = 'Stop'

if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  $jdk = Get-ChildItem "$env:USERPROFILE\Android" -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $jdk) { throw 'JDK 17 not found. Set JAVA_HOME.' }
  $env:JAVA_HOME = $jdk.FullName
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:USERPROFILE\Android\sdk" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms")) { throw "Android SDK not found at $env:ANDROID_HOME. Set ANDROID_HOME." }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
if (-not $env:EXPO_PUBLIC_API_URL) { $env:EXPO_PUBLIC_API_URL = 'http://192.168.120.129:8787' }
$env:NODE_ENV = 'production'
if (-not $env:SG_CXX_DIR) { $env:SG_CXX_DIR = 'C:\sgx' }   # short CMake staging folder (plugins/withShortCxxDir.js)

$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$build = if ($env:SG_BUILD_DIR) { $env:SG_BUILD_DIR } else { 'C:\m' }
Write-Host "== Scam Guardian APK build" -ForegroundColor Cyan
Write-Host "   source: $repo   build folder: $build"
Write-Host "   JDK: $env:JAVA_HOME   SDK: $env:ANDROID_HOME"
Write-Host "   default AI server in the app: $env:EXPO_PUBLIC_API_URL"

if (-not $Resume) {
Write-Host "`n== [1/5] Mirroring the source into $build" -ForegroundColor Cyan
# the mobile app becomes the root of the build folder; the web UI goes to <build>\web (plugins/withWebAssets.js)
robocopy "$repo\mobile" $build /MIR /NFL /NDL /NJH /NJS /NP /XD node_modules android .cxx .expo dist web /XF .env *.apk | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
New-Item -ItemType Directory -Force "$build\web" | Out-Null
foreach ($f in 'index.html','lab.css','lab.js','rules.js','scenarios.js','scam-check.js') { Copy-Item "$repo\$f" "$build\web\$f" -Force }
robocopy "$repoudio" "$build\webudio" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy audio failed ($LASTEXITCODE)" }

Write-Host "`n== [2/5] Installing packages" -ForegroundColor Cyan
Set-Location "$build"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

Write-Host "`n== [3/5] Generating the Android project and bundling the web UI into the APK assets" -ForegroundColor Cyan
npx expo prebuild --platform android --clean --no-install
if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed' }
} else { Write-Host "`n== Resuming the previous build in $build" -ForegroundColor Cyan }

Write-Host "`n== [4/5] Gradle release build (first run: 15-30 min)" -ForegroundColor Cyan
Set-Location "$build\android"
.\gradlew.bat assembleRelease --console=plain "-PreactNativeArchitectures=arm64-v8a,x86_64"
if ($LASTEXITCODE -ne 0) { Set-Location $repo; throw 'Gradle build failed' }

Write-Host "`n== [5/5] Copying the APK" -ForegroundColor Cyan
Copy-Item "$build\android\app\build\outputs\apk\release\app-release.apk" "$repo\ScamGuardian.apk" -Force
$size = [math]::Round((Get-Item "$repo\ScamGuardian.apk").Length / 1MB, 1)
Set-Location $repo
Write-Host "`nBUILD READY: $repo\ScamGuardian.apk ($size MB)" -ForegroundColor Green
