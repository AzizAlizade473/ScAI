/* Scam Guardian — Live AI scam call (client side).
 * Talks to the server's /api/live WebSocket (live/session.js). Modules in this file:
 *   MicCapture    getUserMedia (echo cancellation, noise suppression) → 16 kHz PCM16, local VAD, echo gate
 *   Player        gapless playback of the caller's 24 kHz PCM16, flushed on interruption
 *   LiveCall      session protocol: events → the existing call screen (transcript, risk, warning)
 *   UI            Lab card, listening / thinking / speaking pill, Judge details, architecture sheet
 * Uses the existing call engine in index.html (lines, lineDone, recompute, triggerDanger, hangUp) unchanged. */
(function () {
'use strict';

const LSTR = {
 az: {
  'lv.title': 'Canlı AI zəng', 'lv.b': 'Süni intellekt fırıldaqçı sizə zəng edir və sizinlə sərbəst danışır: sizi eşidir, cavabınıza uyğun danışır. Ssenari yoxdur. Scam Guardian zəngi ayrıca, müstəqil yoxlayır.',
  'lv.pick': 'Ssenari', 'lv.consent': 'Bu zəng üçün mikrofonumdan istifadəyə razıyam. Səs yazılmır və saxlanmır; danışığım yalnız zəng vaxtı Google Gemini-yə ötürülür. Həqiqi kart nömrəsi və ya kod demirəm, yalnız uydurma rəqəmlər.',
  'lv.start': 'Zəng gəlsin', 'lv.arch': 'Necə işləyir', 'lv.need': 'Canlı AI zəng üçün server lazımdır. Server olmadan yalnız qaydalar işləyir: Yoxla və hazır simulyasiyalar.',
  'lv.consentFirst': 'Əvvəlcə mikrofon razılığını qeyd edin', 'lv.engine': 'Mühərrik', 'lv.detector': 'Detektor', 'lv.last': 'Son zəng',
  'lv.s.connecting': 'Qoşulur…', 'lv.s.listening': 'Dinləyir', 'lv.s.thinking': 'Düşünür…', 'lv.s.speaking': 'Danışır', 'lv.s.you': 'Siz danışırsınız', 'lv.s.ended': 'Bitdi', 'lv.s.error': 'Bağlantı kəsildi', 'lv.s.muted': 'Mikrofon söndürülüb',
  'lv.end.user_hung_up': 'Zəngi bitirdiniz', 'lv.end.caller_hung_up': 'Zəng edən dəstəyi qoydu', 'lv.end.silence': 'Cavab olmadığı üçün zəng bitdi', 'lv.end.time_limit': 'Vaxt limiti: zəng bitdi', 'lv.end.network': 'AI bağlantısı kəsildi', 'lv.end.error': 'Canlı zəng başlamadı',
  'lv.noMic': 'Mikrofona icazə verilmədi', 'lv.fallback': 'Gemini Live əlçatan deyil: növbəli rejim (STT → LLM → TTS), cavablar gec gəlir', 'lv.noTts': 'Səs sintezi əlçatan deyil: cavab yalnız mətn kimi',
  'ev.turn': 'Növbə', 'ev.note': 'Qeyd', 'ev.cut': 'Kəsildi', 'lv.reply': 'cavab', 'lv.sttLag': 'transkript',
  'lv.a.mic': 'Mikrofon və VAD', 'lv.a.micD': 'Telefonda: exo-ləğv, səs-küyün azaldılması, eko qapısı (zəng edən danışarkən dinamikin səsi geri getmir). 16 kHz PCM. Serverdə enerji VAD: nitqin sonu, gecikmə ölçüsü.',
  'lv.a.agent': 'Fırıldaqçı AI', 'lv.a.agentLive': 'Gemini Live, səsdən səsə: nitqi anlama, cavab və səs bir modeldə, axınla. Növbə Google VAD ilə; siz danışanda o susur (kəsmə).', 'lv.a.agentTurn': 'Növbəli ehtiyat: VAD seqmenti → STT → LLM (JSON) → TTS. Hər mərhələ ayrıca ölçülür; tam dupleks deyil.',
  'lv.a.tr': 'Transkript', 'lv.a.trD': 'Real səsin nitq tanıması (sizin mikrofon və zəng edənin səsi). Uzun rəqəmlər ekrana çıxmır.',
  'lv.a.det': 'Müstəqil detektor', 'lv.a.detD': 'rules.js hər cümlədə + ayrı Gemini təsnifatçısı son 14 cümlədə. Fırıldaqçının promptunu və vəziyyətini görmür; nəticəsi fırıldaqçıya getmir.',
  'lv.a.risk': 'Risk birləşdirmə', 'lv.a.riskD': 'Qaydalar + AI (rules.js fuse). Güclü qayda sübutunu AI aşağı sala bilməz. Təhlükə bir dəfə yaranırsa zəng boyu qalır.',
  'lv.a.ui': 'Xəbərdarlıq', 'lv.a.uiD': 'Zəng ekranında kiçik kart və vibrasiya; zəng kəsilmir.',
  'lv.m.turns': 'Növbələr', 'lv.m.reply': 'Cavab (nitqin sonu → ilk səs)', 'lv.m.m2e': 'Ağızdan qulağa (telefonda)', 'lv.m.stt': 'Transkript gecikməsi', 'lv.m.stages': 'STT / LLM / TTS', 'lv.m.ai': 'Detektor AI', 'lv.m.rules': 'Qaydalar',
  'lv.m.none': 'Hələ ölçü yoxdur: canlı zəng edin.', 'lv.m.note': 'Bütün rəqəmlər bu zəngdə ölçülüb.'
 },
 ru: {
  'lv.title': 'Живой звонок ИИ', 'lv.b': 'ИИ-мошенник звонит вам и свободно разговаривает: слышит вас и отвечает по ситуации. Сценария нет. Scam Guardian независимо проверяет звонок.',
  'lv.pick': 'Сценарий', 'lv.consent': 'Я разрешаю использовать микрофон для этого звонка. Звук не записывается и не хранится; речь передаётся в Google Gemini только во время звонка. Я не называю настоящие номера карт и коды, только выдуманные цифры.',
  'lv.start': 'Позвонить мне', 'lv.arch': 'Как это работает', 'lv.need': 'Для живого звонка ИИ нужен сервер. Без сервера работают только правила: Проверка и готовые симуляции.',
  'lv.consentFirst': 'Сначала отметьте согласие на микрофон', 'lv.engine': 'Движок', 'lv.detector': 'Детектор', 'lv.last': 'Последний звонок',
  'lv.s.connecting': 'Подключение…', 'lv.s.listening': 'Слушает', 'lv.s.thinking': 'Думает…', 'lv.s.speaking': 'Говорит', 'lv.s.you': 'Вы говорите', 'lv.s.ended': 'Завершён', 'lv.s.error': 'Связь прервана', 'lv.s.muted': 'Микрофон выключен',
  'lv.end.user_hung_up': 'Вы завершили звонок', 'lv.end.caller_hung_up': 'Звонящий положил трубку', 'lv.end.silence': 'Звонок завершён: нет ответа', 'lv.end.time_limit': 'Лимит времени: звонок завершён', 'lv.end.network': 'Связь с ИИ прервана', 'lv.end.error': 'Живой звонок не начался',
  'lv.noMic': 'Нет доступа к микрофону', 'lv.fallback': 'Gemini Live недоступен: пошаговый режим (STT → LLM → TTS), ответы медленнее', 'lv.noTts': 'Синтез речи недоступен: ответ только текстом',
  'ev.turn': 'Ход', 'ev.note': 'Заметка', 'ev.cut': 'Перебили', 'lv.reply': 'ответ', 'lv.sttLag': 'расшифровка',
  'lv.a.mic': 'Микрофон и VAD', 'lv.a.micD': 'На телефоне: эхоподавление, шумоподавление, эхо-затвор (звук динамика не уходит обратно, пока говорит звонящий). 16 кГц PCM. VAD на сервере: конец речи, замер задержки.',
  'lv.a.agent': 'ИИ-мошенник', 'lv.a.agentLive': 'Gemini Live, голос-в-голос: понимание речи, ответ и голос в одной модели, потоком. Очерёдность по VAD Google; когда вы говорите, он замолкает.', 'lv.a.agentTurn': 'Пошаговый запасной режим: сегмент VAD → STT → LLM (JSON) → TTS. Каждый этап замеряется; это не полный дуплекс.',
  'lv.a.tr': 'Расшифровка', 'lv.a.trD': 'Распознавание реального звука (ваш микрофон и голос звонящего). Длинные числа не выводятся.',
  'lv.a.det': 'Независимый детектор', 'lv.a.detD': 'rules.js на каждой фразе + отдельный классификатор Gemini на последних 14 фразах. Не видит промпт и состояние мошенника; его выводы мошеннику не передаются.',
  'lv.a.risk': 'Сведение риска', 'lv.a.riskD': 'Правила + ИИ (rules.js fuse). ИИ не может понизить сильное доказательство правил. Опасность сохраняется до конца звонка.',
  'lv.a.ui': 'Предупреждение', 'lv.a.uiD': 'Небольшая карточка на экране звонка и вибрация; звонок не прерывается.',
  'lv.m.turns': 'Ходы', 'lv.m.reply': 'Ответ (конец речи → первый звук)', 'lv.m.m2e': 'От рта до уха (на телефоне)', 'lv.m.stt': 'Задержка расшифровки', 'lv.m.stages': 'STT / LLM / TTS', 'lv.m.ai': 'ИИ-детектор', 'lv.m.rules': 'Правила',
  'lv.m.none': 'Замеров пока нет: сделайте живой звонок.', 'lv.m.note': 'Все цифры измерены в этом звонке.'
 },
 en: {
  'lv.title': 'Live AI call', 'lv.b': 'An AI scammer calls you and talks freely: it hears you and answers what you actually say. There is no script. Scam Guardian checks the call separately and independently.',
  'lv.pick': 'Scenario', 'lv.consent': 'I allow the microphone for this call. Audio is not recorded or stored; my speech goes to Google Gemini only during the call. I will not say real card numbers or codes, only made-up digits.',
  'lv.start': 'Call me', 'lv.arch': 'How it works', 'lv.need': 'The live AI call needs the server. Without it only the rules work: Check and the pre-recorded simulations.',
  'lv.consentFirst': 'Tick the microphone consent first', 'lv.engine': 'Engine', 'lv.detector': 'Detector', 'lv.last': 'Last call',
  'lv.s.connecting': 'Connecting…', 'lv.s.listening': 'Listening', 'lv.s.thinking': 'Thinking…', 'lv.s.speaking': 'Speaking', 'lv.s.you': 'You are speaking', 'lv.s.ended': 'Ended', 'lv.s.error': 'Connection lost', 'lv.s.muted': 'Microphone off',
  'lv.end.user_hung_up': 'You ended the call', 'lv.end.caller_hung_up': 'The caller hung up', 'lv.end.silence': 'Call ended: no answer', 'lv.end.time_limit': 'Time limit: call ended', 'lv.end.network': 'Connection to the AI lost', 'lv.end.error': 'The live call did not start',
  'lv.noMic': 'Microphone not allowed', 'lv.fallback': 'Gemini Live unavailable: turn-based mode (STT → LLM → TTS), slower replies', 'lv.noTts': 'Speech synthesis unavailable: text-only reply',
  'ev.turn': 'Turn', 'ev.note': 'Note', 'ev.cut': 'Interrupted', 'lv.reply': 'reply', 'lv.sttLag': 'transcript',
  'lv.a.mic': 'Microphone and VAD', 'lv.a.micD': 'On the phone: echo cancellation, noise suppression and an echo gate (speaker sound does not go back while the caller talks). 16 kHz PCM. Server-side energy VAD: end of speech, latency measurement.',
  'lv.a.agent': 'Scammer AI', 'lv.a.agentLive': 'Gemini Live, speech to speech: understanding, reply and voice in one streaming model. Turn-taking by Google VAD; it stops when you talk (barge-in).', 'lv.a.agentTurn': 'Turn-based fallback: VAD segment → STT → LLM (JSON) → TTS. Each stage timed separately; not full duplex.',
  'lv.a.tr': 'Transcript', 'lv.a.trD': 'Speech recognition of the real audio (your microphone and the caller\'s voice). Long digit runs are never shown.',
  'lv.a.det': 'Independent detector', 'lv.a.detD': 'rules.js on every sentence + a separate Gemini classifier on the last 14 sentences. It never sees the scammer\'s prompt or state, and nothing it outputs goes to the scammer.',
  'lv.a.risk': 'Risk aggregation', 'lv.a.riskD': 'Rules + AI (rules.js fuse). The AI cannot lower hard rule evidence. Once danger, it stays danger for the call.',
  'lv.a.ui': 'Warning', 'lv.a.uiD': 'A small card on the call screen and vibration; the call is not interrupted.',
  'lv.m.turns': 'Turns', 'lv.m.reply': 'Reply (end of speech → first audio)', 'lv.m.m2e': 'Mouth to ear (on the phone)', 'lv.m.stt': 'Transcript lag', 'lv.m.stages': 'STT / LLM / TTS', 'lv.m.ai': 'Detector AI', 'lv.m.rules': 'Rules',
  'lv.m.none': 'No measurements yet: make a live call.', 'lv.m.note': 'Every number was measured in this call.'
 }
};
for (const l of Object.keys(LSTR)) Object.assign(STR[l], LSTR[l]);

state.live = { persona: 'bank', consent: false, last: null, lastPersona: null };
const L = () => state.lang;
const msTxt = v => (v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms');
const liveInfo = () => (state.health && state.health.live) || null;
const wsUrl = () => {
  const base = API_BASE() || (location.protocol.startsWith('http') ? location.origin : '');
  return base ? base.replace(/^http/i, 'ws') + '/api/live' : '';
};

/* ------------------------------------------------------------------ MicCapture */
/* 16 kHz PCM16 in 100 ms frames. While the caller's voice plays, an echo gate sends silence unless the
 * user clearly speaks over it (barge-in); then the last ~170 ms are sent too so the first syllable is kept. */
class MicCapture {
  constructor(ctx, onFrame, onLevel) {
    this.ctx = ctx; this.onFrame = onFrame; this.onLevel = onLevel;
    this.muted = false; this.isPlaying = () => false;
    this.out = new Int16Array(1600); this.n = 0;
    this.noise = 0.006; this.echo = 0.01; this.hot = 0; this.gate = false; this.quiet = 0;
    this.speaking = false; this.voiced = 0; this.silent = 0; this.lastVoiceAt = 0;
    this.pre = []; this.onSpeech = null; this.onBargeIn = null;
  }
  async open() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.proc = this.ctx.createScriptProcessor(2048, 1, 1);
    this.ratio = this.ctx.sampleRate / 16000; this.pos = 0;
    this.proc.onaudioprocess = e => this._process(e.inputBuffer.getChannelData(0));
    const mute = this.ctx.createGain(); mute.gain.value = 0;              /* keeps the processor running, silently */
    src.connect(this.proc); this.proc.connect(mute); mute.connect(this.ctx.destination);
    this.src = src;
  }
  _process(d) {
    let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / d.length), frameMs = 1000 * d.length / this.ctx.sampleRate, now = performance.now();
    const playing = this.isPlaying();
    /* local VAD: UI state and the mouth-to-ear measurement */
    const thr = Math.max(0.02, this.noise * 3);
    if (!this.speaking && !playing && rms < thr) this.noise = this.noise * 0.97 + rms * 0.03;
    const voice = rms > (playing && !this.gate ? Math.max(thr, this.echo * 2.5, 0.045) : thr);
    if (voice) { this.voiced += frameMs; this.silent = 0; this.lastVoiceAt = now; } else { this.silent += frameMs; if (!this.speaking) this.voiced = 0; }
    if (!this.speaking && this.voiced >= 120) { this.speaking = true; this.onSpeech && this.onSpeech(true); }
    if (this.speaking && this.silent >= 600) { this.speaking = false; this.voiced = 0; this.onSpeech && this.onSpeech(false, this.lastVoiceAt); }
    /* echo gate */
    let send = !this.muted;
    if (send && playing) {
      if (this.gate) { this.quiet = rms < Math.max(thr, this.echo * 1.5) ? this.quiet + frameMs : 0; if (this.quiet > 700) this.gate = false; }
      else {
        if (rms > Math.max(0.045, this.echo * 2.5)) this.hot += frameMs; else { this.hot = 0; this.echo = this.echo * 0.9 + rms * 0.1; }
        if (this.hot >= 220) { this.gate = true; this.quiet = 0; for (const p of this.pre) this._push(p, true); this.pre = []; this.onBargeIn && this.onBargeIn(); }
      }
      if (!this.gate) { this.pre.push(d.slice()); if (this.pre.length > 4) this.pre.shift(); send = false; }
    } else if (!playing) { this.gate = false; this.hot = 0; this.pre = []; }
    this._push(d, send);
    this.onLevel && this.onLevel(send ? rms : 0);
  }
  /* box-filter downsampling to 16 kHz, then 100 ms frames */
  _push(d, real) {
    const r = this.ratio;
    while (this.pos + r <= d.length) {
      let s = 0; const a = Math.floor(this.pos), b = Math.floor(this.pos + r);
      if (real) { for (let i = a; i < b; i++) s += d[i]; s /= (b - a) || 1; }
      this.out[this.n++] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
      this.pos += r;
      if (this.n === this.out.length) { this.onFrame(this.out.buffer.slice(0)); this.n = 0; }
    }
    this.pos -= d.length;
  }
  close() {
    try { this.proc && (this.proc.onaudioprocess = null, this.proc.disconnect()); } catch (e) {}
    try { this.src && this.src.disconnect(); } catch (e) {}
    try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
}

/* ------------------------------------------------------------------ Player */
class Player {
  constructor(ctx) { this.ctx = ctx; this.next = 0; this.sources = new Set(); this.gain = ctx.createGain(); this.gain.connect(ctx.destination); this.onDrained = null; this.onStart = null; this.turnStarted = false; }
  play(buf) {
    if (buf.byteLength < 2) return;
    const i16 = new Int16Array(buf, 0, buf.byteLength >> 1), f = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
    const b = this.ctx.createBuffer(1, f.length, 24000); b.copyToChannel(f, 0);
    const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.gain);
    const at = Math.max(this.ctx.currentTime + 0.05, this.next);
    s.start(at); this.next = at + b.duration; this.sources.add(s);
    if (!this.turnStarted) { this.turnStarted = true; this.onStart && this.onStart(performance.now() + (at - this.ctx.currentTime) * 1000); }
    s.onended = () => { this.sources.delete(s); if (!this.sources.size) this.onDrained && this.onDrained(); };
  }
  playing() { return this.sources.size > 0 || this.ctx.currentTime < this.next + 0.25; }
  flush() { for (const s of this.sources) { try { s.onended = null; s.stop(); } catch (e) {} } this.sources.clear(); this.next = 0; this.onDrained && this.onDrained(); }
}

/* ------------------------------------------------------------------ LiveCall */
let S = null;    /* the one live call on this phone */

function nativeMicPermission() {
  if (!SGN.on) return Promise.resolve(true);
  return new Promise(ok => {
    const t = setTimeout(() => ok(false), 20000);
    window.SGNative.onMicPermission = g => { clearTimeout(t); ok(!!g); };
    SGN.send({ type: 'mic-permission' });
  });
}

class LiveCall {
  constructor(c, personaId) {
    this.c = c; this.persona = personaId; this.state = 'connecting'; this.you = false;
    this.turnDone = false; this.ended = false; this.ready = null; this.metrics = []; this.turns = [];
    this.lastSpeechEnd = 0; this.m2e = []; this.rulesMs = []; this.aiMs = []; this.hidden = 0;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });   /* created inside the tap */
    this.player = new Player(this.ctx);
    this.player.onDrained = () => this._drained();
    /* turn-complete can arrive just before or after the last audio chunk ends: a small watcher reports
     * "played" reliably and keeps the listening / speaking pill current */
    this.tick = setInterval(() => { if (this.turnDone && !this.player.playing()) this._drained(); else this._paint(); }, 200);
    this.player.onStart = at => { if (this.lastSpeechEnd) { const v = Math.round(at - this.lastSpeechEnd); if (v > 0 && v < 30000) { this.m2e.push(v); this._send({ type: 'clientMetric', turn: this.turns.length, mouthToEarMs: v }); } this.lastSpeechEnd = 0; } };
  }
  async begin() {
    const url = wsUrl();
    if (!url) return this.fail('error', t('lv.need'));
    try { if (!(await nativeMicPermission())) throw new Error('denied'); }
    catch (e) { return this.fail('error', t('lv.noMic')); }
    this.mic = new MicCapture(this.ctx, buf => this._sendAudio(buf), lv => this._level(lv));
    this.mic.isPlaying = () => this.player.playing();
    /* Gemini generates faster than real time, so most of a reply is already queued here when the user
     * talks over it: stop it locally at once (the server interrupts generation itself if still running) */
    this.mic.onBargeIn = () => { if (this.player.playing()) { this.player.flush(); this._timeline('note', t('ev.cut')); log('Barge-in: caller audio stopped'); } };
    this.mic.onSpeech = (on, lastAt) => { this.you = on; if (!on) this.lastSpeechEnd = lastAt; this._paint(); };
    try { await this.mic.open(); } catch (e) { return this.fail('error', t('lv.noMic') + ' (' + e.name + ')'); }
    if (this.ended) return this.mic.close();
    try { await this.ctx.resume(); } catch (e) {}
    const ws = this.ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this._send({ type: 'start', persona: this.persona, consent: true, lang: L(), mode: 'auto' }); };
    ws.onmessage = e => { if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch (x) { return; } this._event(m); } else if (!this.ended) this.player.play(e.data); };
    ws.onclose = () => { if (!this.ended) this.fail('network', t('lv.end.network')); };
    ws.onerror = () => {};
    this._timeline('note', 'WebSocket ' + url.replace(/^wss?:\/\//, ''));
  }
  _send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  _sendAudio(buf) { if (this.ws && this.ws.readyState === 1 && this.ready && this.ws.bufferedAmount < 256000) this.ws.send(buf); }
  _timeline(kind, text, meta, lv) { const c = this.c; (c.timeline = c.timeline || []).push({ t: c.sec, kind, text, meta, lv }); }
  _event(m) {
    const c = this.c; if (state.call !== c && m.type !== 'end') return;
    switch (m.type) {
      case 'ready':
        this.ready = m; state.live.lastReady = m;
        this._timeline('note', `${m.mode === 'live' ? 'Gemini Live' : 'STT → LLM → TTS'} · ${m.model}`, `setup ${msTxt(m.setupMs)} · ${t('lv.detector')}: rules.js + ${m.detector.model}`);
        if (m.mode !== 'live') snack(t('lv.fallback'));
        log(`Live call: ${m.mode} ${m.model} (setup ${m.setupMs} ms), detector ${m.detector.model}`);
        break;
      case 'state': this.state = m.state; this._paint(); break;
      case 'vad': break;
      case 'partial': this._partial(m.who, m.text); break;
      case 'line': this._line(m); break;
      case 'turn':
        this.turns.push({ turn: m.turn, replyMs: m.replyMs });
        this.player.turnStarted = false; this.turnDone = false;
        break;
      case 'metrics': {
        const x = m.metric; this.metrics.push(x);
        const st = x.stages ? ` · STT ${msTxt(x.stages.sttMs)} · LLM ${msTxt(x.stages.llmMs)} · TTS ${msTxt(x.stages.ttsMs)}` : '';
        this._timeline('turn', `${t('ev.turn')} ${x.turn} · ${t('lv.reply')} ${msTxt(x.replyMs)}`, `${x.sttLagMs != null ? t('lv.sttLag') + ' ' + msTxt(x.sttLagMs) : ''}${st}`);
        this.turnDone = true; this.player.turnStarted = false;
        if (!this.player.playing()) this._drained();
        break;
      }
      case 'callerEnding': this.turnDone = true; if (!this.player.playing()) this._drained(); break;
      case 'interrupted': this.player.flush(); this._timeline('note', t('ev.cut')); break;
      case 'rules': this.rulesMs.push(m.ms); break;
      case 'aiStart': c.ai.status = 'checking'; refreshLive(); break;
      case 'ai': {
        const r = m.result; this.aiMs.push(r.ms);
        c.ai.result = r; c.ai.status = 'ok'; c.ai.ms = r.ms; c.ai.applied = m.seq; ai.last = r;
        window.onAIResult && onAIResult(c, r);
        log(`Detector: ${r.level} ${r.risk.toFixed(2)} (${r.scamType}) · ${r.model} · ${r.ms} ms`);
        if (c.phase === 'listening') recompute(); else refreshLive();
        break;
      }
      case 'aiError': c.ai.status = 'error'; c.ai.err = m.message; refreshLive(); log('Detector AI error: ' + m.message); break;
      case 'risk': c.liveRisk = m.risk; if (c.phase === 'listening') recompute(); break;
      case 'detectorState': break;
      case 'notice':
        if (m.code === 'silence') this._timeline('note', '…' + m.text + ' s');
        else if (m.code === 'tts_unavailable') { this._timeline('note', t('lv.noTts'), m.text); snack(t('lv.noTts')); }
        else if (m.code === 'fallback_turn') this._timeline('note', t('lv.fallback'), m.text);
        else this._timeline('note', m.code, m.text);
        break;
      case 'error': this._timeline('note', 'error', m.message); log('Live call error: ' + m.message); break;
      case 'end': this._end(m); break;
    }
  }
  _drained() { if (this.turnDone && !this.ended) { this.turnDone = false; this._send({ type: 'played' }); } this._paint(); }
  _partial(who, text) {
    const c = this.c; if (c.phase !== 'listening') return;
    const id = 'lvInt-' + who; let el = document.getElementById(id);
    if (!text) { if (el) el.remove(); return; }
    if (!el) { const lis = $('#listening'); if (!lis) return; lis.insertAdjacentHTML('beforebegin', `<li class="line who-${who} interim" id="${id}"><div class="who">${who === 'you' ? t('call.you') : esc(callee().name || t('call.caller'))}</div><p></p></li>`); el = document.getElementById(id); }
    el.querySelector('p').textContent = text;
    const tl = $('#trList'); if (tl) tl.scrollTop = tl.scrollHeight;
  }
  _line(m) {
    const c = this.c; const el = document.getElementById('lvInt-' + m.who); if (el) el.remove();
    if (c.phase !== 'listening') { this.hidden++; return; }     /* scam check off: the call goes on, nothing is analysed or shown */
    const turn = m.who === 'caller' ? this.turns[this.turns.length - 1] : null;
    c.lines.push({ who: m.who, text: m.text, live: { id: m.id, source: m.source, cut: !!m.cut, replyMs: turn ? turn.replyMs : null } });
    const i = c.lines.length - 1;
    const lis = $('#listening'); if (lis) lis.insertAdjacentHTML('beforebegin', lineHTML(c.lines[i], i));
    const tl = $('#trList'); if (tl) tl.scrollTop = tl.scrollHeight;
    this._timeline('stt', (m.who === 'you' ? t('call.you') : t('call.caller')) + ': ' + m.text, m.source + (m.cut ? ' · ' + t('ev.cut') : ''));
    lineDone(i);
  }
  _level(v) { const b = $('#lvMic'); if (b) b.style.setProperty('--l', Math.min(1, v * 9).toFixed(2)); }
  label() {
    if (this.ended) return this.state === 'error' ? 'error' : 'ended';
    if (this.c.mute) return 'muted';
    if (this.you && this.state !== 'speaking') return 'you';
    if (this.player.playing() || this.state === 'speaking') return 'speaking';
    return this.state;
  }
  _paint() { const p = $('#lvPill'); if (p) { const k = this.label(); p.dataset.s = k; p.querySelector('span').textContent = t('lv.s.' + k); } }
  _end(m) {
    if (this.ended) return;
    this.summary = m.summary || null;
    state.live.last = Object.assign({}, this.summary || {}, { m2eP50: p50(this.m2e), persona: this.persona, at: Date.now() });
    this.close(false);
    if (state.call === this.c) {
      this._timeline('note', t('lv.end.' + m.reason) || m.reason);
      if (m.reason !== 'user_hung_up') { snack(t('lv.end.' + m.reason)); setTimeout(() => { if (state.call === this.c) hangUp(); }, 400); }
    }
  }
  fail(reason, msg) {
    if (this.ended) return;
    this.state = 'error'; this._paint();
    this._timeline('note', msg);
    snack(msg); log('Live call: ' + msg);
    this.close(false);
    setTimeout(() => { if (state.call === this.c) hangUp(); }, 1500);
  }
  close(notify = true) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.tick);
    if (notify) this._send({ type: 'end' });
    try { this.ws && this.ws.close(); } catch (e) {}
    try { this.player.flush(); } catch (e) {}
    try { this.mic && this.mic.close(); } catch (e) {}
    setTimeout(() => { try { this.ctx.close(); } catch (e) {} }, 300);
    this._paint();
    if (S === this) S = null;
  }
}
const p50 = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/* ------------------------------------------------------------------ hooks into the call engine */
const _openCall = openCall;
openCall = function (who) {   /* eslint-disable-line no-global-assign */
  _openCall(who);
  const c = state.call;
  if (c && c.script && c.script.live) { S = new LiveCall(c, c.script.persona); S.begin(); }
};
const _labStop = window.labStop;
window.labStop = function () { if (S) S.close(true); _labStop && _labStop(); };
const _stopProtection = stopProtection;
stopProtection = function () { _stopProtection(); if (S && state.call === S.c) S._send({ type: 'detector', on: false }); };   /* eslint-disable-line no-global-assign */
const _startProtection = startProtection;
startProtection = function (hold) { _startProtection(hold); if (S && state.call === S.c) S._send({ type: 'detector', on: true }); };   /* eslint-disable-line no-global-assign */
const _mute = A.mute;
A.mute = function (el) { _mute && _mute.call(A, el); if (S && state.call === S.c && S.mic) { S.mic.muted = !!S.c.mute; S._paint(); } };

const _lineExtra = window.lineExtra;
window.lineExtra = function (l) {
  if (!l.live) return _lineExtra ? _lineExtra(l) : '';
  if (!state.judge) return l.live.cut ? `<div class="stt-meta">${t('ev.cut')}</div>` : '';
  const bits = [esc(l.live.source)];
  if (l.who === 'caller' && l.live.replyMs != null) bits.push(t('lv.reply') + ' ' + msTxt(l.live.replyMs));
  if (l.live.cut) bits.push(t('ev.cut'));
  return `<div class="stt-meta">${ic(l.who === 'you' ? 'mic' : 'spark', 'ic-sm')} ${bits.join(' · ')}</div>`;
};

const _call = R.call;
R.call = function () {
  let h = _call();
  const c = state.call;
  if (!c || !c.script || !c.script.live) return h;
  const k = S && S.c === c ? S.label() : 'connecting';
  h = h.replace('<div id="cxAlert">', `<div class="lv-bar"><span class="lv-pill" id="lvPill" data-s="${k}"><i aria-hidden="true"></i><span>${t('lv.s.' + k)}</span></span><span class="lv-mic" id="lvMic" aria-hidden="true"><i></i></span></div><div id="cxAlert">`);
  return h.replace('>SIMULYASİYA<', '>CANLI AI<');
};

/* ------------------------------------------------------------------ architecture sheet */
function archSheet() {
  const r = S && S.ready ? S.ready : state.live.lastReady, info = liveInfo();
  const live = S ? S : null, last = state.live.last;
  const mode = r ? r.mode : 'live';
  const model = r ? r.model : info ? info.models[0] : '—';
  const det = r ? r.detector.model : info ? info.detector : '—';
  const reply = live ? live.metrics.map(x => x.replyMs).filter(v => v != null) : [];
  const stt = live ? live.metrics.map(x => x.sttLagMs).filter(v => v != null) : [];
  const stage = k => live ? live.metrics.map(x => x.stages && x.stages[k]).filter(v => v != null) : [];
  const rows = live ? [
    [t('lv.m.turns'), live.metrics.length],
    [t('lv.m.reply'), `p50 ${msTxt(p50(reply))}`],
    [t('lv.m.m2e'), `p50 ${msTxt(p50(live.m2e))}`],
    [t('lv.m.stt'), `p50 ${msTxt(p50(stt))}`],
    ...(mode === 'turn' ? [[t('lv.m.stages'), `${msTxt(p50(stage('sttMs')))} / ${msTxt(p50(stage('llmMs')))} / ${msTxt(p50(stage('ttsMs')))}`]] : []),
    [t('lv.m.ai'), `p50 ${msTxt(p50(live.aiMs))} · ${live.aiMs.length}×`],
    [t('lv.m.rules'), `p50 ${p50(live.rulesMs) == null ? '—' : p50(live.rulesMs) + ' ms'}`]
  ] : last ? [
    [t('lv.m.turns'), last.turns],
    [t('lv.m.reply'), `p50 ${msTxt(last.replyMsP50)} · p95 ${msTxt(last.replyMsP95)}`],
    [t('lv.m.m2e'), `p50 ${msTxt(last.m2eP50)}`],
    [t('lv.m.stt'), `p50 ${msTxt(last.sttLagMsP50)}`],
    ...(last.mode === 'turn' ? [[t('lv.m.stages'), `${msTxt(last.sttMsP50)} / ${msTxt(last.llmMsP50)} / ${msTxt(last.ttsMsP50)}`]] : []),
    [t('lv.m.ai'), `p50 ${msTxt(last.aiMsP50)} · ${last.aiRuns}×`],
    [t('lv.m.rules'), `p50 ${last.rulesMsP50 == null ? '—' : last.rulesMsP50 + ' ms'}`]
  ] : [];
  const step = (n, title, d, meta) => `<li><b><span class="n">${n}</span>${title}</b><small>${d}</small>${meta ? `<code>${esc(meta)}</code>` : ''}</li>`;
  return `<div class="scrim" data-action="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="lvArchT"><div class="handle"></div>
    <h2 id="lvArchT">${t('lv.arch')}</h2>
    <ol class="lv-arch">
      ${step(1, t('lv.a.mic'), t('lv.a.micD'), 'PCM16 16 kHz · WebSocket /api/live')}
      ${step(2, t('lv.a.agent'), mode === 'turn' ? t('lv.a.agentTurn') : t('lv.a.agentLive'), mode === 'turn' ? 'gemini-3.5-transcribe → ' + (info ? info.detector : '') + ' → Gemini TTS' : model + ' · PCM16 24 kHz')}
      ${step(3, t('lv.a.tr'), t('lv.a.trD'), mode === 'turn' ? 'gemini-3.5-transcribe' : model + ' input / output transcription')}
      ${step(4, t('lv.a.det'), t('lv.a.detD'), 'rules.js + ' + det)}
      ${step(5, t('lv.a.risk'), t('lv.a.riskD'), 'live/risk.js')}
      ${step(6, t('lv.a.ui'), t('lv.a.uiD'))}
    </ol>
    ${rows.length ? `<table class="tech">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table><p class="hint" style="text-align:left">${t('lv.m.note')}</p>` : `<p class="hint">${t('lv.m.none')}</p>`}
  </div>`;
}
const _renderSheet2 = renderSheet;
renderSheet = function () {   /* eslint-disable-line no-global-assign */
  if (state.sheet === 'liveArch') { $('#sheetHost').innerHTML = archSheet(); return; }
  _renderSheet2();
  if (state.sheet === 'evidence' && state.call && state.call.script && state.call.script.live) {
    const sh = $('#sheetHost .sheet');
    if (sh) sh.insertAdjacentHTML('beforeend', `<div class="lb-row" style="padding:0 8px 8px"><button class="lb-btn" data-action="liveArch">${ic('info')}${t('lv.arch')}</button></div>`);
  }
};

/* ------------------------------------------------------------------ Lab card */
function liveCard() {
  const info = liveInfo(), on = !!(info && info.available), lv = state.live, last = lv.last;
  const personas = on ? info.personas : [];
  const sel = personas.find(p => p.id === lv.persona) || personas[0];
  return `<div class="lb-card lv-card"><h2>${ic('mic')}${t('lv.title')}</h2><p>${t('lv.b')}</p>
    ${on ? `<div class="chips lv-chips" role="group" aria-label="${t('lv.pick')}">${personas.map(p => `<button class="fchip" data-action="livePersona" data-id="${p.id}" aria-pressed="${sel && p.id === sel.id}">${esc(p.title[L()])}</button>`).join('')}</div>
      ${sel ? `<p class="hint" style="text-align:left;margin-top:6px">${esc(sel.sub[L()])}</p>` : ''}
      <label class="lb-check"><input type="checkbox" id="liveConsent" ${lv.consent ? 'checked' : ''}>${t('lv.consent')}</label>
      <div class="lb-row"><button class="lb-btn green" data-action="liveStart" ${lv.consent ? '' : 'aria-disabled="true"'}>${ic('phoneFill')}${t('lv.start')}</button>
        <button class="lb-btn" data-action="liveArch">${ic('info')}${t('lv.arch')}</button></div>
      <table class="tech" style="margin-top:10px"><tr><th>${t('lv.engine')}</th><td>Gemini Live · ${esc(info.models[0])}</td></tr><tr><th>${t('lv.detector')}</th><td>rules.js + ${esc(info.detector)}</td></tr>
        ${last ? `<tr><th>${t('lv.last')}</th><td>${last.turns} · ${t('lv.reply')} p50 ${msTxt(last.replyMsP50)} · ${t('risk.' + (last.level || 'safe'))}</td></tr>` : ''}</table>`
    : `<div class="lb-note" role="note">${ic('info')}<span>${t('lv.need')}</span></div>`}
  </div>`;
}
const _lab = R.lab;
R.lab = function () {
  const h = _lab();
  const i = h.indexOf('<h2 class="lb-sec">');
  return i < 0 ? h + liveCard() : h.slice(0, i) + liveCard() + h.slice(i);
};

Object.assign(A, {
  livePersona(el) { state.live.persona = el.dataset.id; render(); },
  liveArch() { state.sheet = 'liveArch'; renderSheet(); },
  liveStart() {
    const info = liveInfo();
    if (!info || !info.available) { snack(t('lv.need')); return; }
    if (!state.live.consent) { snack(t('lv.consentFirst')); $('#liveConsent')?.focus(); return; }
    const p = info.personas.find(x => x.id === state.live.persona) || info.personas[0];
    stopCall();
    state.lab.demo = false;
    state.callee = Object.assign({ dir: 'in', lab: 'live' }, p.caller);
    state.labScript = { id: 'live-' + p.id, live: true, persona: p.id, lab: false, kind: 'scam', lines: [] };
    go('incoming'); vibrate([300, 200, 300]);
    log(`Live AI call: incoming "${p.id}" (unscripted, Gemini Live)`);
  }
});
document.addEventListener('change', e => { if (e.target.id === 'liveConsent') { state.live.consent = e.target.checked; const b = $('[data-action="liveStart"]'); if (b) b.setAttribute('aria-disabled', String(!e.target.checked)); } });

window.__live = () => S;   /* for tests: the current live call */
})();
