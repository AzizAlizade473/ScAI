# Scam Guardian — 90-second demo script

Before you start: `node server.js` and open http://localhost:8787/#screen=lab. Permissions are
assumed granted in Settings, so the app opens straight to the phone screen. Turn the sound on. Check that Settings shows "AI service: Connected".

| Time | Show | Say |
|---|---|---|
| 0:00 | **Lab**: the "Why this matters" card | "On 3 November, police took apart call centres in Kyiv that targeted Azerbaijanis with scripted calls. Our app is built to recognise those scripts while the call is happening." |
| 0:10 | Tap **Start demo**. A real bank call rings and is answered automatically | "This call is a simulation: the voice is a pre-generated audio file. But the speech-to-text and the AI analysis are real, and they run live." |
| 0:15–0:40 | The transcript appears as the audio plays. The scam-check card stays green | "It's a real bank: it confirms a payment and *reminds* her never to share codes. Same words — 'SMS code' — but no request. Verdict: safe." |
| 0:40 | The call hangs up, and the **fake bank** call rings | "Now the scam, run with the same 'I'm from your bank' line." |
| 0:45–1:10 | Evidence chips appear under each sentence: impersonation → card request → SMS code + secrecy. The risk bar climbs. A small warning card drops onto the call screen and the phone vibrates — the call is not interrupted — and the trusted person is notified | "Rules flag the phrases instantly; Gemini judges the context and explains it in plain Azerbaijani. When she is asked for the code, the in-call warning fires and her daughter gets a message. She can still talk, or hang up." |
| 1:10 | Hang up → **Lab → Real vs scam** | "Side by side: same bank claim, opposite verdicts, and we can see when the first warning came." |
| 1:20 | **Check**: tap the *Fake bank SMS* example → **Check** | "It works for messages and links too: a look-alike bank domain, evidence and safe actions." |
| 1:30 | Optional: **Model quality** | "Measured on our labelled test set — precision, recall, latency — computed, not typed in." |

**Judge mode (if there is time):** type any sentence in **Lab → Your own scenario**, record your own voice
(with the consent checkbox), or turn on **Technical details** to see the rules / AI / final scores, the model,
the latency and the exact redacted text sent to Gemini.

**If the internet or the AI quota fails:** the rules engine still runs and flags the scam calls. The cards say
"AI unavailable", and any speech-to-text that fails falls back to the script text, labelled as such. Results
saved from an earlier run are reused and labelled "cache"; turn on **Technical details** to force fresh calls.

## Live AI call (2–3 minutes, the highlight)

Needs the server with a Gemini key that has Live API access, a microphone, and the sound on. On a phone use the
Android app (a phone *browser* only allows the microphone over HTTPS).

1. **Lab → Canlı AI zəng.** Pick a scenario (bank, police or investment), tick the microphone consent, tap
   **Zəng gəlsin**, answer the call.
2. Say: *"Nobody has written this conversation. The scammer is Gemini Live, speaking Azerbaijani; it hears me and
   answers what I say. Scam Guardian is a separate AI that only reads the transcript."*
3. Talk to it freely: ask who it is, doubt it, ask an unexpected question, interrupt it mid-sentence, go quiet.
   Watch the pill (*Dinləyir / Siz danışırsınız / Düşünür / Danışır*), the evidence chips and the risk bar.
4. When it asks for the card number or the code, the warning card appears. Use made-up digits only: they are
   masked on screen and the caller is told never to repeat them.
5. Turn on **Technical details** (Settings → Judge mode) to show the model and reply latency under each line;
   **Sübutlar → Necə işləyir** shows the real pipeline with this call's measured numbers.
6. Say "Sağ olun, zəng etməyin" or refuse firmly twice: the caller says goodbye and hangs up by itself.

If Gemini Live is unavailable, the app says so and switches to the slower turn-based pipeline (STT → LLM → TTS,
replies take several seconds). Without the server the live call is not offered; the Lab simulations and the
rules keep working.

## Two-phone call (real conversation between two teammates)

Needs: the laptop server running (`HOST=0.0.0.0 node server.js`), the laptop and both phones on the same
hotspot, both phones with the same APK, and internet on the hotspot for Gemini.

1. Both phones: **Laboratoriya → Komanda yoldaşına zəng (2 telefon)**, tick the consent box.
2. Phone A (plays the scammer): **A: Zəng edən** → a 4-digit code appears.
3. Phone B (the protected person): type the code → **B: Qəbul edən**. Phone A shows "Qoşuldu: B".
4. Phone A: **Zəng et**. Phone B rings with the normal incoming-call screen; answer.
5. Talk freely. Phone B shows the caller's real words, the evidence chips, the risk bar and the warning card
   when the caller asks for a card number or an SMS code. Phone A only shows the call.
6. For a fair comparison, make a second call as a real bank: confirm a payment and remind B never to share codes.
   It should stay "Təhlükəsiz".

Voice goes phone to phone (WebRTC). Phone B sends the caller's audio as it received it, and its own microphone,
as two separate streams to the server, which transcribes and analyses them. Phone A sends nothing for analysis.
