# Scam Guardian

An AI scam guard for older adults in Azerbaijan. It checks **calls, messages and links** in Azerbaijani,
Russian and English. A deterministic rules engine and Google Gemini work together, and every verdict comes
with its evidence, a plain-language explanation and safe actions.

- **Check:** paste an SMS, link or call text, or speak it. You get the risk, highlighted evidence, link analysis and what to do.
- **Simulation Lab:** voiced scam and legitimate calls (Azerbaijani). The audio plays, is transcribed with **real
  speech-to-text**, and is analysed line by line, with an evidence timeline and an escalating warning.
- **Judge mode:** your own text, a scenario you write, or your own consented voice recording. Everything is recomputed live, with scores, latency and model shown.
- **Model quality:** precision / recall / F1 / latency measured on a labelled test set.

> **Honesty note:** the calls are simulated. Android does not give other apps access to real call audio, and
> Scam Guardian does not claim it. The speech-to-text and the AI analysis are real.

## Run it

```bash
cp .env.example .env      # paste your key from https://aistudio.google.com/apikey
node server.js            # Node 18+, no npm install
```

Open http://localhost:8787. To demo on a phone on the same Wi-Fi, run `HOST=0.0.0.0 node server.js`. Voice
recording needs `localhost` or HTTPS, so on a phone use the Check examples and the Lab calls.

| Command | What it does |
|---|---|
| `node server.js` | App + API on port 8787 |
| `node eval/run.js` | Runs the labelled set through rules, Gemini and fusion → `eval/results.json` |
| `node eval/run.js --rules` | Rules only, no API calls |
| `node scripts/gen-voices.js` | Generates the Lab voices with Gemini TTS (skips existing clips) |

The free Gemini tier has small per-model limits (some models allow 10–20 requests a day). The server rotates
through models with separate quotas and caches identical results, and labels them "cache". Turn on
**Settings → Technical details** to force fresh calls.

## Android app

`mobile/` is an Expo (TypeScript, Expo Router) Android app. It runs the same UI, with native recording, vibration and back
button, and connects to this server. Build an installable APK with EAS: see [mobile/README.md](mobile/README.md).

## Database (MySQL) and Docker

`Backend/` runs the app with a real MySQL database and a bronze → silver → gold data pipeline, all with one
`docker compose up`. See [Backend/README.md](Backend/README.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and [DEMO.md](DEMO.md) for the 90-second demo.
