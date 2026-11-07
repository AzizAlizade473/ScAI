# Scam Guardian — architecture

## 1. Overview

```
 Browser (phone-sized UI, index.html + lab.js)                    Node.js server (server.js)
 ┌──────────────────────────────────────────────┐                ┌──────────────────────────────────────┐
 │ Home · Keypad · Check · Lab · History ·      │  /api/analyze  │ rules.js  ── deterministic evidence  │
 │ Contacts · Settings · Call screens           │ ─────────────► │ scam-check.js ── redact → Gemini     │
 │                                              │  /api/classify │ fuse(rules, ai) ── final verdict     │
 │ rules.js runs here too (instant highlights)  │  /api/transcribe ► gemini-3.5-transcribe (STT)        │
 │ Lab: plays audio/<scenario>/<n>.wav ─────────┼─ /api/tts ───► │ Gemini TTS (cached in data/tts-cache) │
 │ Recorder: consented mic → 16 kHz WAV         │  /api/history  │ store.js → data/store.json (redacted) │
 │                                              │  /api/feedback │ cache.json (labelled result cache)    │
 └──────────────────────────────────────────────┘  /api/eval     └──────────────┬───────────────────────┘
                                                                                 │ HTTPS, API key in .env
                                                                       Google Gemini API (free tier)
```

| File | Role |
|---|---|
| `index.html` | App shell, design tokens, call engine, home / keypad / call / alert / history / contacts screens |
| `lab.js`, `lab.css` | Check, Simulation Lab, Judge mode, Settings, server history, evaluation dashboard |
| `rules.js` | Shared rules engine (browser + server): tactics, evidence spans, link analysis, fusion policy |
| `scam-check.js` | Gemini client: redaction, prompt, JSON schema, analysis, speech-to-text, text-to-speech, model fallback |
| `scenarios.js` | Lab scenarios (Azerbaijani scripts, voices, ground-truth labels) |
| `server.js`, `store.js` | HTTP API, validation, rate limit, same-origin check, persistence, caches |
| `eval/` | Labelled dataset, runner, measured results |
| `scripts/gen-voices.js` | Generates the scenario voices with Gemini TTS (16 kHz WAV) |

No npm dependencies: Node 18+ built-ins and browser APIs only.

## 2. Detection pipeline

1. **Rules (`rules.js`, < 5 ms).** These are regular expressions for 11 tactics in AZ / RU / EN: OTP / PIN request,
   card details, money transfer, "safe account", remote-access apps, prize fee, investment promise, suspicious
   link, impersonation, urgency and secrecy.
   - **Intent check.** At sentence and message level, the engine separates a *request* ("kodu deyin",
     "назовите код") from *safety advice* ("heç kimə deməyin", "никому не сообщайте"). A real bank's OTP SMS is
     therefore not flagged.
   - **Combinations.** A sensitive request together with impersonation, urgency or secrecy raises the risk to danger.
   - **Links.** Look-alike bank and e-gov domains, punycode, shorteners, IP hosts, risky TLDs, plain http and `@` tricks
     are flagged. Official Azerbaijani domains are allow-listed.
2. **Redaction.** Before anything leaves the device, card numbers, phones, IBANs, emails, any number of 3+ digits
   and URL query strings are replaced with placeholders.
3. **Gemini analysis.** Structured JSON output: `risk`, `level`, `scam_type`, `tactics`, evidence quotes, a
   one-sentence reason and 1–3 safe actions in AZ / RU / EN. The system prompt treats input as hostile data,
   which guards against prompt injection.
4. **Fusion (`ScamRules.fuse`).** Hard rule evidence (risk ≥ 0.8) can never be lowered by the AI. Softer single
   keyword hits are capped below "caution" when the AI is confident the text is normal. Otherwise the higher
   score wins. Without the AI, the rules decide alone.
5. **Calls.** After each sentence the rules run instantly and the last minute of transcript goes to Gemini
   (debounced; stale answers dropped). Caller signals are also used: the scam-report count, whether the caller
   is a saved contact, and whether an SMS code arrived during the call. The risk escalates to a full-screen
   alert with tone, vibration, a spoken Azerbaijani warning (pre-generated TTS) and a simulated SMS to the
   trusted person.

## 3. Simulation Lab and speech

- Scenarios: fake bank (card + OTP), fake police, investment + AnyDesk, real bank call, real grandson call.
- Each line is a WAV file voiced once with Gemini TTS. During the call the browser plays it and, at the same
  time, posts the same bytes to `/api/transcribe` (`gemini-3.5-transcribe`). The transcript shown and analysed
  is the speech-to-text output, not the script. If speech-to-text fails, the script text is shown and labelled.
- Evidence chips appear under each sentence (rules and ✦ AI). The **Evidence** button opens a timestamped
  timeline: speech-to-text results, rule hits, AI verdicts with model and latency, and level changes.
- **Judge mode:**
  - free text, voiced with TTS when quota allows;
  - your own voice: consent checkbox, then the mic is recorded in the browser as a 16 kHz WAV and sent with
    `?fresh=1&store=0`, so neither the audio nor its transcript is kept;
  - technical details: rules / AI / final scores, latency, model, cache flag, and the redacted text sent.

## 4. API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | AI on/off, models, fallback chain, models cooling down after quota errors |
| POST | `/api/analyze` | `{text, channel?, knownContact?, source?, save?, fresh?}` → rules + AI + fused + latency; saves redacted result |
| POST | `/api/classify` | Live call transcript → AI verdict |
| POST | `/api/transcribe` | Raw `audio/wav|webm|ogg|mp4`, ≤ 10 MB → `{text, model, ms}`; audio never stored |
| POST | `/api/tts` | `{text, voice}` → WAV (cached by hash) |
| GET / POST / DELETE | `/api/history`, `/api/history/:id` | Redacted analyses and call alert metadata |
| POST | `/api/feedback` | `{id, verdict: correct|wrong}` |
| GET | `/api/eval`, `/api/stats` | Evaluation results, history and feedback counts |

## 5. Security, privacy and reliability

- The API key exists only on the server (`.env`, git-ignored). POSTs from another site are refused (Origin check).
- A per-IP rate limit protects the AI endpoints. Every body is size-limited and every input validated.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy`
  that allows only the microphone on this site.
- Stored data (`data/`, git-ignored): redacted text, verdict, tactics, model and latency. Call records keep only the alert
  metadata and a masked number. Users can delete single items or the whole history.
- **Model fallback.** The free tier has small per-model quotas (some models allow 10–20 requests a day). The client
  rotates through models with separate quotas (flash-lite → flash → Gemma 4) and honours "retry in 10h" cooldowns.
- **Result cache.** Identical audio or transcripts reuse an earlier *real* result, labelled `cached`. Technical-details
  mode forces fresh calls.
- **If the AI is unreachable,** the rules keep working in the browser and on the server, and the interface says so.

## 6. Evaluation

`eval/dataset.json` holds 46 hand-written, labelled samples (AZ 22, RU 12, EN 12; 23 scam / 23 legit). 15 of them are
"hard" cases written to fool keyword rules. `node eval/run.js` runs each sample through rules, Gemini and fusion and
writes `eval/results.json`, which the Lab dashboard shows. This is a **development set**: the rules were tuned on it,
so it is not an independent test.

## 7. Real-device path (not in this prototype)

Android would capture call audio through an Accessibility service plus the speakerphone (a short beep tells both
sides), stream it to speech-to-text, and run the same rules and API. iOS does not allow call audio capture at all; there the
Check screen (messages and links) and a manual "protect this call" speaker mode are the realistic options.
