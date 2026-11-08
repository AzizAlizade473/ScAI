# Scam Guardian — features and architecture

Scam Guardian is an Azerbaijani-first scam-call and scam-message detector for older adults (YUNEX Digital
Inclusion hackathon). It looks like the phone's own dialer. During a call it listens, turns speech into text,
and warns quietly on the call screen when the caller uses scam tactics. The interface supports Azerbaijani,
Russian and English.

It ships two ways: a web app with a Node.js API, and an Android app (React Native + Expo) that runs the same UI.

## 1. Features

### Phone experience
- **Dialer-style home.** Recents, favourites, contacts, keypad, light and dark themes, in the style of the Android
  phone app. No onboarding or permission screens: the app assumes protection was allowed in Settings.
- **Incoming and in-call screens.** They look like a normal phone call. A shield button turns scam check on or
  off during the call. It is on by default (Settings → auto-scan).
- **Live transcript.** Each sentence appears as it is spoken, with an evidence chip that names the strongest tactic.
- **Minimal in-call warning.** At danger level a small card appears on the call screen: a title, one line about
  why, and a note that a trusted person was told. The phone vibrates. There is no red full-screen alarm and no
  spoken warning, so the call is never interrupted. The × button closes the card.
- **Scam check off does not stop the call.** The conversation continues; only the analysis stops.
- **Call-ended screen** in the same style, with the final verdict and the tactics found.

### Check (messages and links)
- Paste an SMS, WhatsApp message or link, or record your voice. The result shows the risk level, the scam type,
  the tactics with highlighted evidence, a one-sentence reason and 1–3 safe actions.

### Simulation Lab
- Five scripted calls with real Azerbaijani voices (Gemini TTS, 35 clips, 7 lines each):
  - scams: fake bank (card + OTP), fake police, investment + AnyDesk;
  - legitimate: real bank call, grandson call.
- The scammer and the victim speak in turn. Audio sets the pace: the next line starts when the clip ends.
  Speech-to-text and AI analysis catch up in the background, so a slow or missing server never stalls the call.
- **Demo mode** plays a legitimate call and then a scam call, to show that normal calls stay "safe".
- **Evidence timeline.** Timestamped speech-to-text results, rule hits, AI verdicts with model and latency, and
  level changes.

### Judge mode
- Judges type any text, or record their own voice (with a consent checkbox), and see the result.
- **Technical details:** rules, AI and final scores, latency, model, cache flag, and the redacted text that was sent.
- Recordings are sent with `?fresh=1&store=0`: neither the audio nor the transcript is stored.

### History, Settings, evaluation
- **History:** redacted past checks and call alerts, feedback (correct / wrong), delete one item or all.
- **Settings:** language (AZ / RU / EN), auto-scan, sound, Judge mode, server address (for the phone app).
  Trusted people are in the menu.
- **Evaluation dashboard:** measured precision, recall and latency from `eval/results.json`, by language and on
  hard cases.
- **News context:** a "Why this matters" card in the Lab about the call centres uncovered in Kyiv on
  3 November 2026. It states that the app cannot guarantee to stop every scam.

## 2. Architecture

```
 Android app (Expo, React Native)            Web UI (same files)               Node.js server (server.js)
 ┌──────────────────────────────┐   ┌─────────────────────────────────┐    ┌──────────────────────────────────┐
 │ WebView: file:///android_    │   │ index.html  shell, dialer, call │    │ rules.js      deterministic rules │
 │   asset/web/index.html       │──►│             engine, warnings    │    │ scam-check.js redact → Gemini     │
 │ Native bridge:               │   │ lab.js/css  Check, Lab, Judge,  │───►│ fuse(rules, ai) final verdict     │
 │  · mic recording (expo-audio)│   │             History, Settings   │HTTP│ store.js      redacted history    │
 │  · vibration, back button    │   │ rules.js    instant highlights  │    │ caches        result + TTS        │
 │  · status bar follows theme  │   │ scenarios.js + audio/*.wav      │    └────────────────┬─────────────────┘
 │  · links open in browser     │   └─────────────────────────────────┘                     │ HTTPS, key in .env
 └──────────────────────────────┘                                                Google Gemini API
```

### Frontend (`index.html`, `lab.js`, `lab.css`)
- Vanilla JavaScript, no framework, no build step. A single global `state`, screen renderers in `R`, actions in `A`.
- CSS design tokens (`--d-*`) for the dialer look, light and dark themes.
- `rules.js` also runs in the browser, so highlights appear instantly and the app works without a server.
- The call engine plays each line, runs the rules at once, and sends the last minute of transcript to the AI
  (debounced; stale answers dropped).

### Android app (`mobile/`)
- Expo SDK 58, React Native 0.88, TypeScript, Expo Router, `react-native-webview`, `expo-audio`, `expo-file-system`.
- The config plugin `plugins/withWebAssets.js` copies the web UI and all voice clips into the APK assets. The APK
  needs no Metro and no internet to open; only AI calls need the server.
- `GuardianWebView.tsx` injects `SG_NATIVE` and `SG_API_BASE` before the page loads. The page sends messages to the
  app (`vibrate`, `theme`, `exit`, `rec-start`, `rec-stop`, `rec-cancel`); the app answers with injected JavaScript.
- Voice recording: AAC, 16 kHz mono, microphone permission asked at first use.
- Builds: EAS profiles `development` (dev client), `preview` (APK), `production` (AAB). A local Windows build
  script (`mobile/scripts/build-apk-local.ps1`) makes `ScamGuardian.apk` without an Expo account.

### Backend (`server.js`, `scam-check.js`, `rules.js`, `store.js`)
- Node 18+, no npm dependencies.
- Gemini models:
  - analysis: `gemini-3.5-flash-lite`, with a fallback chain across models that have separate quotas
    (flash-lite → flash → Gemma 4); "retry in 10h" cooldowns are respected;
  - speech-to-text: `gemini-3.5-transcribe`;
  - text-to-speech: Gemini TTS, used to make the Lab voices (`scripts/gen-voices.js`) and in Judge mode.

| File | Role |
|---|---|
| `index.html` | App shell, design tokens, call engine, home / keypad / call / warning / history / contacts screens |
| `lab.js`, `lab.css` | Check, Simulation Lab, Judge mode, Settings, server history, evaluation dashboard, recorder |
| `rules.js` | Shared rules engine (browser + server): tactics, evidence spans, link analysis, fusion policy |
| `scam-check.js` | Gemini client: redaction, prompt, JSON schema, analysis, speech-to-text, text-to-speech, model fallback |
| `scenarios.js`, `audio/` | Lab scripts, voices, ground-truth labels; 35 WAV clips (16 kHz mono) |
| `server.js`, `store.js` | HTTP API, validation, rate limit, origin check, persistence, caches |
| `eval/` | Labelled dataset, runner, measured results |
| `mobile/` | Expo Android app |
| `render.yaml`, `Dockerfile` | Server deployment |

## 3. Detection pipeline

1. **Rules (`rules.js`, under 5 ms).** Regular expressions for 11 tactics in AZ / RU / EN: OTP / PIN request,
   card details, money transfer, "safe account", remote-access apps, prize fee, investment promise, suspicious
   link, impersonation, urgency and secrecy.
   - **Intent check.** The engine separates a *request* ("kodu deyin", "назовите код") from *safety advice*
     ("heç kimə deməyin", "никому не сообщайте"). A real bank's OTP SMS is therefore not flagged.
   - **Combinations.** A sensitive request together with impersonation, urgency or secrecy raises the risk to danger.
   - **Links.** Look-alike bank and e-gov domains, punycode, shorteners, IP hosts, risky TLDs, plain http and `@`
     tricks are flagged. Official Azerbaijani domains are allow-listed.
2. **Redaction.** Before text leaves the device, card numbers, phones, IBANs, emails, any number of 3+ digits and
   URL query strings become placeholders.
3. **Gemini analysis.** Structured JSON: `risk`, `level`, `scam_type`, `tactics`, evidence quotes, a one-sentence
   reason and 1–3 safe actions. The system prompt treats the input as untrusted data, which guards against
   prompt injection.
4. **Fusion (`ScamRules.fuse`).** Hard rule evidence (risk ≥ 0.8) is never lowered by the AI. Soft single-keyword
   hits are capped below "caution" when the AI is confident the text is normal. Otherwise the higher score wins.
   Without the AI, the rules decide alone.
5. **Calls.** Caller signals are added: whether the caller is a saved contact, and whether an SMS code arrived
   during the call. Risk escalates from safe to caution to danger; danger shows the in-call warning.

## 4. API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | AI on/off, models, fallback chain, models cooling down after quota errors |
| POST | `/api/analyze` | `{text, channel?, knownContact?, source?, save?, fresh?}` → rules + AI + fused + latency |
| POST | `/api/classify` | Live call transcript → AI verdict |
| POST | `/api/transcribe` | Raw `audio/wav|webm|ogg|mp4|aac`, ≤ 10 MB → `{text, model, ms}`; audio never stored |
| POST | `/api/tts` | `{text, voice}` → WAV (cached by hash) |
| GET / POST / DELETE | `/api/history`, `/api/history/:id` | Redacted analyses and call alert metadata |
| POST | `/api/feedback` | `{id, verdict: correct|wrong}` |
| GET | `/api/eval`, `/api/stats` | Evaluation results, history and feedback counts |

## 5. Security, privacy and reliability

- The API key exists only on the server (`.env`, git-ignored), never in the app or the repository.
- POSTs from other websites are refused (origin check). Cross-origin calls are allowed only from Origin `null`,
  which is the Android app's `file://` page.
- A per-IP rate limit protects the AI endpoints. Every body is size-limited and every input validated.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy`
  that allows only the microphone.
- Stored data (`data/`, git-ignored): redacted text, verdict, tactics, model and latency. Call records keep only
  alert metadata and a masked number. Users can delete single items or the whole history.
- **Result cache.** Identical audio or transcripts reuse an earlier real result, labelled `cached`. Technical
  details mode forces fresh calls.
- **Timeouts.** Every API call has a timeout (health 5 s, speech-to-text 15 s, others 20 s). The app re-checks the
  server every 15 s while it is not connected.
- **If the AI is unreachable,** the rules keep working in the app and on the server, Lab calls play in full with
  the script text (labelled), and the interface says the server is not connected.

## 6. Evaluation

`eval/dataset.json` holds 46 hand-written, labelled samples (AZ 22, RU 12, EN 12; 23 scam / 23 legit). 15 are
"hard" cases written to fool keyword rules. `node eval/run.js` runs each sample through the rules, Gemini and fusion,
and writes `eval/results.json`, which the Lab dashboard shows. Last run:

| Path | Precision | Recall |
|---|---|---|
| Rules only | 0.955 | 0.913 |
| AI only | 46 / 46 correct | |
| Rules + AI (fused) | 1.00 | 1.00 |

AI latency p50 was about 1.5 s. This is a **development set**: the rules were tuned on it, so it is not an
independent test.

## 7. Limits and real-device path

- Lab calls are simulated. Android does not let other apps read the audio of real phone calls, and this app does
  not claim to. The speech-to-text and AI analysis are real.
- A real Android product would capture call audio through the speakerphone with an Accessibility service (a short
  beep tells both sides), stream it to speech-to-text, and use the same rules and API. iOS does not allow call
  audio capture; there, the Check screen and a manual "protect this call" speaker mode are the realistic options.
- The phone app talks to a laptop server over plain http on the local network for the demo. Use an https server
  (for example on Render, `render.yaml`) beyond the demo.
