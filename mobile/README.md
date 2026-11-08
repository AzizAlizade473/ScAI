# Scam Guardian — Android app (Expo, TypeScript)

The Android app runs the **same Scam Guardian UI** as the web prototype: same HTML, CSS, JS and Lab voice clips,
so the design is identical. The files are bundled into the APK by `plugins/withWebAssets.js` and shown in a WebView.
The native side handles what a WebView cannot:

| Feature | Native implementation |
|---|---|
| Voice recording (Judge mode, Check → Voice) | `expo-audio` recorder, AAC 16 kHz mono, microphone permission requested at first use |
| Vibration on a scam warning | React Native `Vibration` |
| Android back button | `BackHandler`: closes sheets, returns to Home, then exits |
| Status bar / system background | Follows the UI theme (dark call screens, light/dark home) |
| External links (news sources) | Open in the system browser |
| Splash screen and adaptive icon | `expo-splash-screen` and generated brand icons (`npm run icons`) |
| Offline UI | The UI and the rules engine run from the APK with no network; only AI calls need the server |

The AI (Gemini analysis, speech-to-text) runs on the Scam Guardian server (`server.js` in the repository root).
The API key stays on the server and is never put in the app.

## 1. Start the AI server

On a laptop on the same Wi-Fi as the phone:

```bash
cd ..                      # repository root
HOST=0.0.0.0 node server.js
```

Find the laptop's IP (`ipconfig` on Windows, for example `192.168.1.10`). The server address is then
`http://192.168.1.10:8787`.

Or deploy the server: `render.yaml` in the repository root is a Render Blueprint. Set `GEMINI_API_KEY` in the
Render dashboard and use the https URL it gives you.

## 2. Run during development

```bash
cd mobile
npm install
npx expo start                 # press "a" with a development build installed, or scan the QR code
```

- **Development build (recommended).** Has the bundled UI, recording, vibration and back button.
  Build it once with `npm run build:dev` (EAS) or `npx expo run:android` (needs Android Studio and JDK 17).
- **Expo Go.** Works only for viewing. Expo Go cannot carry the bundled UI, so it loads the UI from the server.
  Start it with `EXPO_PUBLIC_API_URL=http://192.168.1.10:8787 npx expo start --go`.
  Voice recording also needs the development build.

## 3. Build an installable APK (EAS)

```bash
npm install -g eas-cli         # once
eas login                      # once, with your Expo account
eas init                       # once, links the project to your account
npm run build:apk              # preview profile → .apk download link
```

EAS prints a link and a QR code. Open it on the phone to download and install the APK. In the app, open
**☰ → Ayarlar → Server ünvanı**, enter the server address from step 1 and tap **Yadda saxla**.

To bake a server address into the build instead, create an EAS environment variable before building:

```bash
eas env:create --name EXPO_PUBLIC_API_URL --value https://your-server.onrender.com --environment preview
```

| Profile | Command | Output |
|---|---|---|
| development | `npm run build:dev` | Debug APK with the dev client (for `npx expo start`) |
| preview | `npm run build:apk` | Release APK, installable directly, no Metro |
| production | `npm run build:aab` | Signed Android App Bundle for Google Play |

Install an APK over USB: `adb install path/to/app.apk`

## Checks

```bash
npm run typecheck      # tsc --noEmit
npm run lint
npm run doctor         # expo-doctor
npm run export:android # bundles the JS like a release build
npm run prebuild       # generates android/ and copies the web UI into the APK assets
```

## Notes and limits

- The calls in the Lab are **simulated**: Android does not give other apps access to the audio of real phone
  calls, and this app does not claim it. Speech-to-text and the AI analysis are real.
- The app talks to the server over plain http on a local network (`usesCleartextTraffic`) so a laptop server works
  in the demo. Use an https server for anything beyond a demo.
- The server accepts cross-origin calls only from the app (Origin `null`), so other websites cannot use its Gemini quota.
