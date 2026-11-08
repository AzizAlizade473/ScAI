# Scam Guardian — 90-second demo script

Before you start: `node server.js` and open http://localhost:8787/#screen=lab. Permissions are
assumed granted in Settings, so the app opens straight to the phone screen. Turn the sound on. Check that Settings shows "AI service: Connected".

| Time | Show | Say |
|---|---|---|
| 0:00 | **Lab**: the "Why this matters" card | "On 3 November, police took apart call centres in Kyiv that targeted Azerbaijanis with scripted calls. Our app is built to recognise those scripts while the call is happening." |
| 0:10 | Tap **Start demo**. A real bank call rings and is answered automatically | "This call is a simulation: the voice is a pre-generated audio file. But the speech-to-text and the AI analysis are real, and they run live." |
| 0:15–0:40 | The transcript appears as the audio plays. The scam-check card stays green | "It's a real bank: it confirms a payment and *reminds* her never to share codes. Same words — 'SMS code' — but no request. Verdict: safe." |
| 0:40 | The call hangs up, and the **fake bank** call rings | "Now the scam, run with the same 'I'm from your bank' line." |
| 0:45–1:10 | Evidence chips appear under each sentence: impersonation → card request → SMS code + secrecy. The risk bar climbs. A warning drops onto the call screen — the call is not interrupted — with the spoken warning in Azerbaijani and the SMS to the trusted person | "Rules flag the phrases instantly; Gemini judges the context and explains it in plain Azerbaijani. When she is asked for the code, the in-call warning and the spoken alert fire, and her daughter gets a message. She can still talk, or hang up." |
| 1:10 | Hang up → **Lab → Real vs scam** | "Side by side: same bank claim, opposite verdicts, and we can see when the first warning came." |
| 1:20 | **Check**: tap the *Fake bank SMS* example → **Check** | "It works for messages and links too: a look-alike bank domain, evidence and safe actions." |
| 1:30 | Optional: **Model quality** | "Measured on our labelled test set — precision, recall, latency — computed, not typed in." |

**Judge mode (if there is time):** type any sentence in **Lab → Your own scenario**, record your own voice
(with the consent checkbox), or turn on **Technical details** to see the rules / AI / final scores, the model,
the latency and the exact redacted text sent to Gemini.

**If the internet or the AI quota fails:** the rules engine still runs and flags the scam calls. The cards say
"AI unavailable", and any speech-to-text that fails falls back to the script text, labelled as such. Results
saved from an earlier run are reused and labelled "cache"; turn on **Technical details** to force fresh calls.
