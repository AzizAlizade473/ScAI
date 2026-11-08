// @ts-check
/* Shared type definitions for the Live AI scam-call mode (JSDoc, checked with `npm run typecheck:live`).
 *
 * Pipeline (one LiveCallSession per WebSocket, nothing shared between sessions):
 *
 *   client mic ─PCM16 16 kHz─► session ─► VAD (metrics, turn timing)
 *                                   └──► ScammerAgent  (Gemini Live native audio, or the turn-based
 *                                          STT → LLM → TTS fallback) ─PCM16 24 kHz─► client speaker
 *   ScammerAgent transcripts (speech-to-text of the real audio) ─► TranscriptLine
 *        └─► ThreatDetector (rules.js + separate Gemini classifier) ─► RiskAggregator ─► UI events
 *
 * The detector never receives the scammer's prompt, persona or internal state, and nothing the detector
 * produces is ever sent to the scammer.
 */

/** @typedef {'caller' | 'you'} Speaker */

/**
 * A finished sentence of the conversation, as heard by speech-to-text.
 * @typedef {object} TranscriptLine
 * @property {number} id         1-based, increasing within a session
 * @property {Speaker} who
 * @property {string} text       display text (long digit runs masked)
 * @property {number} at         ms since the session started
 * @property {string} source     which model produced the transcript
 * @property {boolean} [cut]     the caller was interrupted mid-sentence
 */

/**
 * @typedef {object} Persona
 * @property {string} id
 * @property {{az: string, ru: string, en: string}} title
 * @property {{az: string, ru: string, en: string}} sub
 * @property {{name: string, number: string, reports: number}} caller
 * @property {string} voice      prebuilt Gemini voice (male)
 * @property {string} icon
 * @property {string} role       persona and plan, appended to the shared system prompt
 */

/**
 * Events every scammer engine emits (Live and turn-based share this interface).
 * @typedef {object} ScammerEvents
 * @property {(pcm24k: Buffer) => void} audio
 * @property {(text: string) => void} outText       partial transcript of the caller's speech
 * @property {(text: string) => void} inText        partial transcript of the user's speech
 * @property {() => void} turnComplete
 * @property {() => void} interrupted
 * @property {(reason: string) => void} endCall
 * @property {(m: StageMetrics) => void} metrics     turn-based engine only: per-stage timing
 * @property {(e: Error) => void} error
 * @property {(info: {code: number, reason: string}) => void} closed
 */

/**
 * @typedef {object} ScammerAgent
 * @property {string} mode                 'live' | 'turn'
 * @property {string} model                model(s) actually used
 * @property {() => Promise<{model: string, ms: number}>} connect
 * @property {(pcm16k: Buffer) => void} sendAudio
 * @property {(text: string) => void} direct  stage direction (silence, wrap up); never spoken
 * @property {() => void} [testDrop]   test only: drop the upstream connection
 * @property {() => void} close
 * @property {(ev: string, fn: (...a: any[]) => void) => any} on
 */

/**
 * @typedef {object} StageMetrics
 * @property {number} [sttMs]
 * @property {number} [llmMs]
 * @property {number} [ttsMs]
 * @property {string} [sttModel]
 * @property {string} [llmModel]
 * @property {string} [ttsModel]
 */

/**
 * Detector output for one analysis run.
 * @typedef {object} DetectorAI
 * @property {number} seq
 * @property {number} upToLine    last transcript line id the verdict covers
 * @property {any} result         ScamCheck.normalize() shape + model + ms
 */

/**
 * @typedef {object} RiskState
 * @property {number} risk
 * @property {'safe'|'caution'|'danger'} level
 * @property {string[]} tactics
 * @property {boolean} latched     danger stays danger for the rest of the call
 */

/**
 * Per-turn latency, measured on the server.
 * @typedef {object} TurnMetric
 * @property {number} turn
 * @property {number|null} replyMs       end of the user's speech (server VAD) → first reply audio sent
 * @property {number|null} sttLagMs      end of the user's speech → last transcript fragment
 * @property {StageMetrics} [stages]     turn-based engine: stt / llm / tts separately
 */

module.exports = {};
