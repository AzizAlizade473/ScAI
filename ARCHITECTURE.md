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

### Live AI call (Lab → Canlı AI zəng)
- An AI scammer calls the phone and holds an **unscripted Azerbaijani voice conversation**: it hears the user's
  real voice, understands the answer and replies to it. No line is pre-written.
- Three fictional personas: fake bank security officer (card number + SMS code), fake police officer ("safe
  account", secrecy), fake investment manager (guaranteed profit, AnyDesk). Male voices.
- Natural turn-taking: Gemini's voice activity detection decides when the user has finished; the user can
  interrupt (barge-in) and the caller stops at once. Silence gets "Alo? Məni eşidirsiniz?" after 9 and 18 s;
  after ~27 s the caller says goodbye and hangs up. The caller also ends the call itself after firm refusals.
- **Scam Guardian analyses the same call independently** and shows evidence, risk and the in-call warning
  exactly as on a normal call. A pill on the call screen shows *Dinləyir / Siz danışırsınız / Düşünür / Danışır*.
- Explicit microphone consent (checkbox) before the call; audio is streamed, never stored.

### Judge mode
- Judges type any text, or record their own voice (with a consent checkbox), and see the result.
- In a live AI call, Judge mode shows the transcript source (model) and the reply latency under every line, and
  the Evidence sheet lists every turn with its measured latency plus a **How it works** view of the real pipeline
  with this call's numbers.
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
  app (`vibrate`, `theme`, `exit`, `rec-start`, `rec-stop`, `rec-cancel`, `mic-permission`); the app answers with injected JavaScript.
- Voice recording: AAC, 16 kHz mono, microphone permission asked at first use. The live AI call opens the
  microphone inside the WebView (`getUserMedia`, granted by `mediaCapturePermissionGrantType`) after the app has
  the Android microphone permission.
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
| `live.js` | Live AI call client: mic capture, echo gate, player, call-screen integration, architecture sheet |
| `live/` | Live AI call server modules (see section 2a) |
| `scripts/test-live.js` | End-to-end live call tests with real recorded speech; writes `eval/live-results.json` |
| `mobile/` | Expo Android app |
| `render.yaml`, `Dockerfile` | Server deployment |

## 2a. Live AI call

```
 phone (live.js)                         server (live/session.js, one per WebSocket)            Google
 ┌───────────────────────────┐  PCM16   ┌───────────────────────────────────────────────┐
 │ MicCapture                │  16 kHz  │ EnergyVad ── end of speech → latency, silence │
 │  getUserMedia: echo canc.,│ ───────► │      │                                         │  WebSocket
 │  noise suppr., AGC        │          │      ▼                                         │ ◄────────► Gemini Live
 │  echo gate + barge-in     │          │ ScammerAgent  LiveScammer (native audio,       │  (gemini-3.8-live,
 │ Player (24 kHz, gapless)  │ ◄─────── │               VAD, barge-in, end_call tool)    │   3.1-flash-live,
 │ pill: listening/thinking/ │  PCM16   │               TurnScammer fallback:            │   2.5 native audio)
 │       speaking            │  24 kHz  │               VAD → STT → LLM → TTS            │
 │                           │          │      │ transcripts (ASR of the real audio)     │
 │ existing call screen:     │  JSON    │      ▼                                         │
 │  transcript, evidence,    │ ◄─────── │ ThreatDetector  rules.js + separate classifier │ ──► gemini-3.5-flash-lite
 │  risk meter, warning      │  events  │ RiskAggregator  fuse + danger latch            │
 └───────────────────────────┘          └───────────────────────────────────────────────┘
```

| Module | Responsibility |
|---|---|
| `live/ws.js` | Minimal RFC 6455 WebSocket server (no dependencies): frames, fragmentation, ping, size limit |
| `live/vad.js` | Energy VAD with a minimum-tracking noise floor: speech start / end on 20 ms frames |
| `live/personas.js` | Fictional scammer personas and the shared system prompt (tactics, behaviour, safety rules) |
| `live/scammer-live.js` | Gemini Live client: model fallback with cooldowns, setup, audio in/out, transcripts, `end_call` tool |
| `live/scammer-turn.js` | Turn-based fallback: VAD segment → `gemini-3.5-transcribe` → LLM JSON reply → Gemini TTS, each timed |
| `live/detector.js` | Independent detector: rules on every caller sentence, debounced single-flight AI classification |
| `live/risk.js` | Risk aggregation with `rules.js` fusion; danger is latched for the rest of the call |
| `live/session.js` | Orchestrator: protocol, turn bookkeeping, silence handling, limits, metrics, clean shutdown |
| `live/types.js` | JSDoc type definitions; `tsc -p live` type-checks the server modules |

**Why Gemini Live.** One native-audio model does speech understanding, the reply and the voice, streamed. The
reply starts about a second after the user stops talking (measured below). Turn-taking is VAD-based with
barge-in: it is a streamed, interruptible conversation, not a full-duplex one where both talk over each other.
If no Live model is available (quota, outage), the session falls back to the turn-based pipeline and the app
says so; that path is slower, and its STT, LLM and TTS times are measured separately.

**Independence of the detector.** The detector's only input is the transcript of the actual audio. It never sees
the scammer's prompt, persona or state, runs on a different model with its own prompt that treats the transcript
as hostile data, and nothing it produces is sent to the scammer. The risk can only go up to danger and stay there.

**Echo and feedback.** The phone uses the platform's echo cancellation, plus an echo gate: while the caller's
voice plays, the microphone sends silence unless the user clearly talks over it; then the last ~170 ms are sent
too and the local playback stops at once (barge-in). Gemini Live generates faster than real time, so most of a
reply is already on the phone when the user interrupts; stopping it locally is what makes interruption work.

**Safety.** Microphone consent is a required checkbox. Audio is streamed only during the call and is never
written to disk. Digit runs of 4+ (card numbers, codes) are masked before they reach the screen and redacted
before the detector's classifier. The scammer prompt forbids reading digits back, real names, real numbers or
links. The personas are fictional. Max 7 minutes per call, 3 calls per server, 2 per IP address.

**Protocol.** Client → server: binary PCM16 16 kHz frames (100 ms) and JSON `start` (persona, consent), `played`,
`detector` (scam check on/off), `clientMetric`, `end`. Server → client: binary PCM16 24 kHz and JSON `ready`,
`state`, `vad`, `partial`, `line`, `turn`, `metrics`, `interrupted`, `rules`, `aiStart`, `ai`, `aiError`, `risk`,
`notice`, `callerEnding`, `error`, `end` (with a summary).

## 2b. Two-phone call

```
 Phone A (caller) ◄──── WebRTC audio, peer to peer on the hotspot ────► Phone B (protected)
        │                (Chromium WebRTC in the WebView: AEC, NS, AGC)        │
        │ signalling only                                                      │ signalling + two analysis tracks:
        ▼                                                                      ▼ [1] caller audio as received
                         server.js  WebSocket /api/call  (live/call-room.js)     [2] B's own microphone
                         rooms: 4-digit code, per-phone token, consent from both, 30 min TTL
                         CallAnalyzer per room: streaming STT per speaker (gemini-3.5-transcribe-live;
                         per-segment gemini-3.5-transcribe as fallback) → lines with speaker, times, session
                         → ThreatDetector (rules.js + Gemini) → RiskAggregator → events to phone B only
```

- **Why not LiveKit.** It needs a LiveKit server (cloud account or a self-hosted binary), native modules
  rebuilt for Expo SDK 58, and a native Node SDK for the audio worker. The WebView already contains Chromium's
  WebRTC stack with echo cancellation, noise suppression and gain control, so two phones on one hotspot can talk
  peer to peer with no new native code. The server is only used for signalling and analysis.
- **Speakers are never mixed.** Each track has its own transcription stream and its own lines.
- **The caller cannot feed the detector.** The server analyses the audio that phone B actually received;
  phone A sends no transcripts, verdicts or analysis audio.
- **Network.** The voice needs the phones to reach each other on the hotspot; signalling needs the laptop server;
  the transcription and AI need internet on the hotspot. Without internet the call still works, without analysis.
- **Measured** with two clients and recorded Azerbaijani speech (8 November 2026): voice connected 140–610 ms after
  answering in the browser and 8.4 s on the Android emulator; the final transcript arrived about 1.5 s after the
  speaker stopped; AI verdict p50 2.3–2.4 s; first warning 3.9 s after the caller's words on the emulator.
  A scam call (card number, SMS code, secrecy) reached danger with the warning; a real-bank call stayed safe.
  Not yet tested on two physical phones.
- **Speech recognition accuracy (fixed 8 November 2026).** Root cause of wrong Azerbaijani text: the streaming
  transcription had no language set, so it guessed per sentence (Turkish spellings like "Bu kadar pulu",
  sometimes Italian). Now `languageCodes: ['az-AZ']` (`STT_LANGS` to add Russian) and a sensitive end of speech
  (500 ms) that ends at each sentence. The detector reads exactly these transcripts, so it improves with them.
  Measured on recorded speech: quiet 80-88 % of words exact (most "errors" are "on altı" written as "16");
  with crowd noise and a long echo at 10 dB every line of a scam call was exact and the warning came 3.3 s after the
  words; at 3-5 dB words are lost but the scam / normal verdict was still right in all 6 test recordings.
  Speech the model hears but cannot transcribe is shown as "səs aydın deyil" and is not analysed.
- **Speech test** (Lab → Səs testi): read a given sentence on the phone; it runs through the same streaming
  transcription and detector and shows what was heard, word accuracy and whether the verdict is right.
  `SG_CALL_DEBUG=1` saves each speaker's analysed audio to `data/debug-audio/` (git-ignored) and logs every line.

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
| GET | `/api/number-check`, `/api/insights`; POST `/api/reports` | Number risk, daily scam summary and number reports from the MySQL database (`Backend/`); 501 without it |
| WebSocket | `/api/live` | Live AI call: PCM16 audio both ways + JSON events (section 2a); `/api/health` lists models and personas |

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

### Live AI call tests

`node scripts/test-live.js [talk noise bargein silence hangup turn fallback]` acts as the phone against a running
server: it streams recorded Azerbaijani speech (the Lab's victim clips, 16 kHz) in real time as the microphone,
with silence between turns, waits for the caller's audio to "play" for its real duration, and records every
event. Nothing is mocked; results go to `eval/live-results.json`. Runs on 8 November 2026 (free-tier key, laptop
on Wi-Fi):

| Case | What happened | Measured |
|---|---|---|
| `talk`: 5 user answers incl. an off-topic question and doubt | 6 caller turns, all on topic; asked for the card number, then the SMS code; detector danger from the first sentence | reply p50 1.07 s, p95 1.46 s; independent STT p50 1.7 s; detector AI p50 2.3 s |
| `bargein`: user talks over the caller | caller stopped with 6.7 s of its reply unplayed; line marked as cut | reply 1.17 s |
| `noise`: white noise at 3 % full scale all call | conversation continued; one answer misrecognised under the noise | reply p50 1.34 s, p95 1.73 s |
| `silence`: user never speaks | "Alo? Məni eşidirsiniz?" at 9 s and 18 s, goodbye at 27 s, call ended by the caller | — |
| `hangup`: user refuses three times, then goes quiet | caller pushed harder each time, then said goodbye and hung up itself (`end_call`) | reply p50 1.08 s |
| `fallback`: Live model unavailable | session switched to the turn-based pipeline and said so | reply 9.1 s (STT 2.5 s, LLM 1.7 s, TTS 4.4 s) |
| `turn`: turn-based pipeline | works, but slowly | reply up to 18 s (STT up to 6.1 s, LLM 2.1 s, TTS 4.3 s) |

In the browser, the real client (WebAudio microphone, echo gate, player) measured **mouth to ear** (end of the
user's speech to the first reply sample playing) at 1.13–1.29 s over four turns. Reply = end of the user's speech
(last voiced frame, server VAD) to the first reply audio sent. The victim clips are synthetic voices; some were
transcribed with Turkish spellings ("Niye yani" for "Necə yəni"), real voices may differ.

## 7. Limits and real-device path

- Lab calls are simulated. Android does not let other apps read the audio of real phone calls, and this app does
  not claim to. The speech-to-text and AI analysis are real.
- The live AI call is a real, unscripted voice conversation, but it runs inside the app over the internet, not
  over the phone network. Turn-taking is VAD-based with barge-in, not full duplex. It needs the server and a
  Gemini key with Live API access; free-tier quotas limit how many calls a day are possible.
- A real Android product would capture call audio through the speakerphone with an Accessibility service (a short
  beep tells both sides), stream it to speech-to-text, and use the same rules and API. iOS does not allow call
  audio capture; there, the Check screen and a manual "protect this call" speaker mode are the realistic options.
- The phone app talks to a laptop server over plain http on the local network for the demo. Use an https server
  (for example on Render, `render.yaml`) beyond the demo.
