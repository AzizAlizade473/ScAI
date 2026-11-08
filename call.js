/* Scam Guardian — two-phone call (client side). Both phones run this same app.
 *   Phone A "Zəng edən" creates a room and gets a 4-digit code; Phone B "Qəbul edən" joins with the code.
 *   A rings B; B sees the normal incoming-call screen, answers, and the two talk over WebRTC
 *   (Chromium WebRTC inside the app's WebView: echo cancellation, noise suppression, gain control).
 *   Phone B — the protected person — sends the server two separate tracks: the caller's voice exactly as B
 *   receives it (tag 1) and B's own microphone (tag 2). The server transcribes and analyses them
 *   (live/call-room.js) and B's existing call screen shows transcript, evidence, risk and the warning.
 *   Phone A sends no analysis data at all, so a caller cannot feed the detector fake text.
 * Uses the existing call engine (openCall, lineDone, recompute, triggerDanger, hangUp) and design. */
(function () {
'use strict';

const CSTR = {
 az: { 'pp.title': 'Komanda yoldaşına zəng (2 telefon)', 'pp.b': 'İki telefon, eyni tətbiq, eyni Wi-Fi. A zəng edir və fırıldaqçı rolunu oynayır, B cavab verir. Scam Guardian B-nin telefonunda zəng edənin real səsini yoxlayır.',
  'pp.consent': 'Bu zəngdə səsimin canlı mətnə çevrilməsinə və yoxlanmasına razıyam. Səs yazılmır; həqiqi kart nömrəsi və ya kod demirik.',
  'pp.asA': 'A: Zəng edən', 'pp.asB': 'B: Qəbul edən', 'pp.code': 'Kod', 'pp.join': 'Qoşul', 'pp.ring': 'Zəng et', 'pp.cancel': 'Ləğv et',
  'pp.waitPeer': 'Bu kodu ikinci telefona deyin. Yoldaş gözlənilir…', 'pp.peerIn': 'Qoşuldu: {name}', 'pp.waitCall': 'Qoşuldunuz. Zəng gözlənilir…',
  'pp.consentFirst': 'Əvvəlcə razılığı qeyd edin', 'pp.badCode': '4 rəqəmli kodu yazın', 'pp.need': 'İki telefonlu zəng üçün server lazımdır.',
  'pp.declined': 'Zəng rədd edildi', 'pp.ended': 'Zəng bitdi', 'pp.lost': 'Bağlantı kəsildi', 'pp.peerAway': 'Qarşı tərəfin bağlantısı kəsildi, gözlənilir…',
  'pp.s.calling': 'Zəng edilir…', 'pp.s.connecting': 'Qoşulur…', 'pp.s.connected': 'Qoşuldu', 'pp.s.reconnecting': 'Bərpa olunur…', 'pp.s.error': 'Bağlantı yoxdur', 'pp.s.muted': 'Mikrofon söndürülüb',
  'pp.callerNote': 'Siz zəng edənsiniz. Scam Guardian zəngi qarşı tərəfin telefonunda yoxlayır.', 'pp.aiOff': 'AI əlçatan deyil: yalnız qaydalar işləyir', 'pp.sttOff': 'Nitq tanıma əlçatan deyil',
  'pp.teammate': 'Komanda yoldaşı', 'pp.number': 'Scam Guardian zəngi', 'pp.noRtc': 'Bu cihaz WebRTC dəstəkləmir', 'pp.connMs': 'Səs bağlantısı', 'pp.warnMs': 'Xəbərdarlıq sözlərdən sonra' },
 ru: { 'pp.title': 'Звонок коллеге (2 телефона)', 'pp.b': 'Два телефона, одно приложение, один Wi-Fi. A звонит и играет мошенника, B отвечает. Scam Guardian проверяет настоящий голос звонящего на телефоне B.',
  'pp.consent': 'Я согласен на расшифровку и проверку моей речи в этом звонке. Звук не записывается; настоящих номеров карт и кодов не называем.',
  'pp.asA': 'A: Звонящий', 'pp.asB': 'B: Принимающий', 'pp.code': 'Код', 'pp.join': 'Подключиться', 'pp.ring': 'Позвонить', 'pp.cancel': 'Отмена',
  'pp.waitPeer': 'Назовите этот код второму телефону. Ждём…', 'pp.peerIn': 'Подключился: {name}', 'pp.waitCall': 'Вы подключены. Ждём звонка…',
  'pp.consentFirst': 'Сначала отметьте согласие', 'pp.badCode': 'Введите код из 4 цифр', 'pp.need': 'Для звонка двух телефонов нужен сервер.',
  'pp.declined': 'Звонок отклонён', 'pp.ended': 'Звонок завершён', 'pp.lost': 'Связь прервана', 'pp.peerAway': 'Связь с собеседником прервалась, ждём…',
  'pp.s.calling': 'Вызов…', 'pp.s.connecting': 'Подключение…', 'pp.s.connected': 'Соединено', 'pp.s.reconnecting': 'Восстановление…', 'pp.s.error': 'Нет связи', 'pp.s.muted': 'Микрофон выключен',
  'pp.callerNote': 'Вы звоните. Scam Guardian проверяет звонок на телефоне собеседника.', 'pp.aiOff': 'ИИ недоступен: работают только правила', 'pp.sttOff': 'Распознавание речи недоступно',
  'pp.teammate': 'Коллега', 'pp.number': 'Звонок Scam Guardian', 'pp.noRtc': 'Устройство не поддерживает WebRTC', 'pp.connMs': 'Голосовое соединение', 'pp.warnMs': 'Предупреждение после слов' },
 en: { 'pp.title': 'Call a teammate (2 phones)', 'pp.b': 'Two phones, the same app, the same Wi-Fi. A calls and plays the scammer, B answers. Scam Guardian checks the caller\'s real voice on B\'s phone.',
  'pp.consent': 'I agree that my speech in this call is transcribed and checked live. Audio is not recorded; we say no real card numbers or codes.',
  'pp.asA': 'A: Caller', 'pp.asB': 'B: Receiver', 'pp.code': 'Code', 'pp.join': 'Join', 'pp.ring': 'Call', 'pp.cancel': 'Cancel',
  'pp.waitPeer': 'Tell this code to the second phone. Waiting…', 'pp.peerIn': 'Joined: {name}', 'pp.waitCall': 'Joined. Waiting for the call…',
  'pp.consentFirst': 'Tick the consent first', 'pp.badCode': 'Enter the 4-digit code', 'pp.need': 'The two-phone call needs the server.',
  'pp.declined': 'Call declined', 'pp.ended': 'Call ended', 'pp.lost': 'Connection lost', 'pp.peerAway': 'The other phone lost connection, waiting…',
  'pp.s.calling': 'Calling…', 'pp.s.connecting': 'Connecting…', 'pp.s.connected': 'Connected', 'pp.s.reconnecting': 'Reconnecting…', 'pp.s.error': 'No connection', 'pp.s.muted': 'Microphone off',
  'pp.callerNote': 'You are the caller. Scam Guardian checks this call on the other phone.', 'pp.aiOff': 'AI unavailable: rules only', 'pp.sttOff': 'Speech recognition unavailable',
  'pp.teammate': 'Teammate', 'pp.number': 'Scam Guardian call', 'pp.noRtc': 'This device does not support WebRTC', 'pp.connMs': 'Voice connection', 'pp.warnMs': 'Warning after the words' }
};
for (const l of Object.keys(CSTR)) Object.assign(STR[l], CSTR[l]);

const msTxt = v => (v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms');
const callUrl = () => { const b = API_BASE() || (location.protocol.startsWith('http') ? location.origin : ''); return b ? b.replace(/^http/i, 'ws') + '/api/call' : ''; };

/* ------------------------------------------------------------------ state */
const P = {
  ws: null, role: null, code: '', token: '', session: '', peer: '', status: 'idle', consent: false, codeInput: '',
  pc: null, local: null, remote: null, audioEl: null, ctx: null, taps: [], pendingIce: [], c: null, rtc: 'new',
  closing: false, rejoinUntil: 0, aiWarned: false, sttWarned: false, ringT: null, pendingOffer: null, iceRestarted: false
};
state.p2p = P;

function send(o) { if (P.ws && P.ws.readyState === 1) P.ws.send(JSON.stringify(o)); }
function paintCard() { const b = document.getElementById('ppBox'); if (b) b.innerHTML = cardInner(); }
function setRtc(s) { P.rtc = s; paintPill(); }

/* ------------------------------------------------------------------ signalling socket */
function openSocket(first) {
  const url = callUrl();
  if (!url) { snack(t('pp.need')); return; }
  const ws = P.ws = new WebSocket(url);
  ws.onopen = () => send(first);
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMessage(m); };
  ws.onclose = () => {
    if (P.ws !== ws || P.closing) return;
    P.ws = null;
    if (P.code && P.token && (P.status === 'incall' || P.status === 'ringing' || P.status === 'waiting' || P.status === 'peer' || P.status === 'joined')) {
      /* a dropped signalling socket does not end the call: the voice keeps flowing peer to peer; rejoin */
      if (!P.rejoinUntil) P.rejoinUntil = Date.now() + 28000;
      if (Date.now() < P.rejoinUntil) { if (P.c) setRtc('reconnecting'); setTimeout(() => { if (!P.ws && !P.closing) openSocket({ type: 'rejoin', code: P.code, token: P.token, role: P.role }); }, 1500); return; }
    }
    lost();
  };
}
function lost() { const inCall = P.c && state.call === P.c; reset(); snack(t('pp.lost')); if (inCall) hangUp(); paintCard(); }

function onMessage(m) {
  const c = P.c;
  switch (m.type) {
    case 'created': Object.assign(P, { role: 'caller', code: m.code, token: m.token, session: m.session, status: 'waiting' }); paintCard(); break;
    case 'joined': Object.assign(P, { role: 'receiver', code: m.code, token: m.token, session: m.session, peer: m.peer, status: 'joined' }); paintCard(); break;
    case 'rejoined': P.rejoinUntil = 0; if (P.c) setRtc(P.pc && P.pc.connectionState === 'connected' ? 'connected' : 'connecting'); log('Call: signalling rejoined'); break;
    case 'peer': P.peer = m.name; P.status = 'peer'; paintCard(); vibrate(60); break;
    case 'peerLeft': P.peer = ''; P.status = 'waiting'; paintCard(); break;
    case 'peerAway': snack(t('pp.peerAway')); break;
    case 'peerBack': break;
    case 'incoming': incoming(m.from); break;
    case 'accepted': if (P.role === 'caller') { P.status = 'incall'; setRtc('connecting'); startRtc(true); } break;
    case 'declined': if (P.role === 'caller') { snack(t('pp.declined')); P.status = 'peer'; const c0 = P.c; P.c = null; endLocal(); if (c0 && state.call === c0) hangUp(); paintCard(); } break;
    case 'signal': onSignal(m.data); break;
    case 'connectTime': if (c) timeline('note', t('pp.connMs') + ' ' + msTxt(m.ms), 'accept → WebRTC connected'); break;
    case 'ended': {
      const inCall = P.c && state.call === P.c;
      if (m.summary) { state.p2pLast = Object.assign({ connectMs: m.connectMs }, m.summary); log(`Call summary: ${JSON.stringify(state.p2pLast)}`); }
      reset();
      if (inCall) { snack(t('pp.ended')); hangUp(); }
      paintCard(); break;
    }
    case 'error': snack(m.message || m.code); if (m.code === 'no_room' && P.status === 'idle') paintCard(); if (!P.code) { closeSocket(); } break;
    /* ---- analysis results: only the protected phone gets these ---- */
    case 'line': onLine(m); break;
    case 'rules': break;
    case 'aiStart': if (c && state.call === c) { c.ai.status = 'checking'; refreshLive(); } break;
    case 'ai': if (c && state.call === c) {
      const r = m.result; c.ai.result = r; c.ai.status = 'ok'; c.ai.ms = r.ms; ai.last = r;
      window.onAIResult && onAIResult(c, r);
      log(`Detector: ${r.level} ${r.risk.toFixed(2)} (${r.scamType}) · ${r.model} · ${r.ms} ms`);
      if (c.phase === 'listening') recompute(); else refreshLive();
    } break;
    case 'aiError': if (c && state.call === c) { c.ai.status = 'error'; c.ai.err = m.message; refreshLive(); if (!P.aiWarned) { P.aiWarned = true; snack(t('pp.aiOff')); timeline('note', t('pp.aiOff'), m.message); } } break;
    case 'risk': if (c && state.call === c) {
      c.liveRisk = m.risk;
      if (m.warnMs != null) timeline('note', t('pp.warnMs') + ' ' + msTxt(m.warnMs), m.level);
      if (c.phase === 'listening') recompute();
    } break;
    case 'notice': if (m.code === 'stt_unavailable' && !P.sttWarned) { P.sttWarned = true; snack(t('pp.sttOff')); timeline('note', t('pp.sttOff'), m.text); } break;
  }
}
function timeline(kind, text, meta, lv) { const c = P.c; if (!c) return; (c.timeline = c.timeline || []).push({ t: c.sec, kind, text, meta, lv }); }

function onLine(m) {
  const c = P.c; if (!c || state.call !== c || m.session !== P.session) return;   /* never mix sessions */
  if (c.phase === 'starting') { (P.held = P.held || []).push(m); return; }   /* shown as soon as the check has started */
  if (c.phase !== 'listening') return;                                         /* scam check off: nothing is shown */
  c.lines.push({ who: m.who, text: m.text, live: { id: m.id, source: m.source, sttMs: m.sttMs, cut: false } });
  const i = c.lines.length - 1;
  const lis = $('#listening'); if (lis) lis.insertAdjacentHTML('beforebegin', lineHTML(c.lines[i], i));
  const tl = $('#trList'); if (tl) tl.scrollTop = tl.scrollHeight;
  timeline('stt', (m.who === 'you' ? t('call.you') : t('call.caller')) + ': ' + m.text, `${m.source} · ${msTxt(m.sttMs)} · ${(m.t0 / 1000).toFixed(1)}–${(m.t1 / 1000).toFixed(1)} s`);
  lineDone(i);
}

/* ------------------------------------------------------------------ call flow */
function incoming(from) {
  P.peer = from || P.peer; P.status = 'ringing';
  stopCall();
  state.callee = { name: P.peer || t('pp.teammate'), number: t('pp.number'), reports: 0, dir: 'in' };
  state.labScript = { id: 'p2p', p2p: true, role: 'receiver', kind: null, lines: [] };
  go('incoming'); vibrate([300, 200, 300, 200, 300]);
  clearInterval(P.ringT); P.ringT = setInterval(() => { if (state.screen === 'incoming' && P.status === 'ringing') { tone(480, .35, 0, .12); tone(620, .35, .4, .12); } else clearInterval(P.ringT); }, 2200);
}
function ring() {
  if (P.role !== 'caller' || !P.peer) return;
  send({ type: 'ring' });
  P.status = 'ringing';
  state.callee = { name: P.peer || t('pp.teammate'), number: t('pp.number'), reports: 0, dir: 'out' };
  state.labScript = { id: 'p2p', p2p: true, role: 'caller', kind: null, lines: [] };
  openCall(state.callee);
}

const _openCall = openCall;
openCall = function (who) {   /* eslint-disable-line no-global-assign */
  _openCall(who);
  const c = state.call;
  if (!c || !c.script || !c.script.p2p) return;
  P.c = c;
  if (c.script.role === 'caller') {
    /* the caller's phone does not analyse anything */
    c.timeouts.forEach(clearTimeout); c.timeouts = []; c.phase = 'off'; setRtc('calling'); render();
  } else {
    clearInterval(P.ringT);
    P.status = 'incall'; setRtc('connecting');
    send({ type: 'accept' });
    startRtc(false);
  }
};

async function micPermission() {
  if (!SGN.on) return true;
  return new Promise(ok => { const tm = setTimeout(() => ok(false), 20000); window.SGNative.onMicPermission = g => { clearTimeout(tm); ok(!!g); }; SGN.send({ type: 'mic-permission' }); });
}

async function startRtc(isCaller) {
  if (!window.RTCPeerConnection) { snack(t('pp.noRtc')); return; }
  try {
    if (!(await micPermission())) throw new Error('denied');
    P.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) { snack(t('lv.noMic')); timeline('note', t('lv.noMic'), e.name || e.message); send({ type: 'hangup' }); return; }
  if (!P.c) { P.local.getTracks().forEach(tr => tr.stop()); return; }
  if (P.c.mute) P.local.getAudioTracks().forEach(tr => { tr.enabled = false; });
  const pc = P.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  P.local.getTracks().forEach(tr => pc.addTrack(tr, P.local));
  pc.onicecandidate = e => { if (e.candidate) send({ type: 'signal', data: { candidate: e.candidate.toJSON() } }); };
  pc.ontrack = e => {
    P.remote = e.streams[0] || new MediaStream([e.track]);
    if (!P.audioEl) { P.audioEl = document.createElement('audio'); P.audioEl.autoplay = true; P.audioEl.setAttribute('playsinline', ''); P.audioEl.style.display = 'none'; document.body.appendChild(P.audioEl); }
    P.audioEl.srcObject = P.remote;
    P.audioEl.play().catch(() => {});
    if (P.role === 'receiver') startTaps();
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') { setRtc('connected'); send({ type: 'rtc', state: 'connected' }); }
    else if (s === 'disconnected') setRtc('reconnecting');
    else if (s === 'failed') { setRtc('reconnecting'); if (isCaller) restartIce(); }
  };
  if (isCaller) {
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    send({ type: 'signal', data: { sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: offer.type, sdp: offer.sdp } } });
  } else if (P.pendingOffer) { const o = P.pendingOffer; P.pendingOffer = null; onSignal(o); }
}
async function restartIce() {
  const pc = P.pc; if (!pc || P.iceRestarted) return;
  P.iceRestarted = true;
  try { const o = await pc.createOffer({ iceRestart: true }); await pc.setLocalDescription(o); send({ type: 'signal', data: { sdp: { type: o.type, sdp: o.sdp } } }); } catch (e) { log('ICE restart failed: ' + e.message); }
}
async function onSignal(d) {
  if (!d) return;
  const pc = P.pc;
  if (d.sdp) {
    if (!pc) { P.pendingOffer = d; return; }
    try {
      await pc.setRemoteDescription(d.sdp);
      for (const c of P.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (d.sdp.type === 'offer') { const a = await pc.createAnswer(); await pc.setLocalDescription(a); send({ type: 'signal', data: { sdp: { type: a.type, sdp: a.sdp } } }); }
    } catch (e) { log('Call SDP error: ' + e.message); }
  } else if (d.candidate) {
    if (!pc || !pc.remoteDescription) { P.pendingIce.push(d.candidate); return; }
    pc.addIceCandidate(d.candidate).catch(() => {});
  }
}

/* The protected phone's two analysis taps: separate tracks, never mixed, never played (gain 0). */
class Tap {
  constructor(ctx, stream, tag) {
    this.tag = tag; this.ratio = ctx.sampleRate / 16000; this.pos = 0; this.out = new Int16Array(1600); this.n = 0; this.on = true;
    this.src = ctx.createMediaStreamSource(stream);
    this.proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain(); mute.gain.value = 0;
    this.proc.onaudioprocess = e => this.push(e.inputBuffer.getChannelData(0));
    this.src.connect(this.proc); this.proc.connect(mute); mute.connect(ctx.destination);
  }
  push(d) {
    const r = this.ratio;
    while (this.pos + r <= d.length) {
      let s = 0; const a = Math.floor(this.pos), b = Math.floor(this.pos + r);
      for (let i = a; i < b; i++) s += d[i]; s /= (b - a) || 1;
      this.out[this.n++] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
      this.pos += r;
      if (this.n === this.out.length) {
        if (this.on && P.ws && P.ws.readyState === 1 && P.ws.bufferedAmount < 256000) {
          const f = new Uint8Array(1 + this.out.length * 2); f[0] = this.tag; f.set(new Uint8Array(this.out.buffer), 1); P.ws.send(f.buffer);
        }
        this.n = 0;
      }
    }
    this.pos -= d.length;
  }
  close() { try { this.proc.onaudioprocess = null; this.proc.disconnect(); this.src.disconnect(); } catch (e) {} }
}
function startTaps() {
  if (P.taps.length || !P.remote || !P.local) return;
  P.ctx = new (window.AudioContext || window.webkitAudioContext)();
  P.ctx.resume().catch(() => {});
  P.taps = [new Tap(P.ctx, P.remote, 1), new Tap(P.ctx, P.local, 2)];
  P.taps[1].on = !(P.c && P.c.mute);
  log('Call: analysing the caller\'s received audio (tag 1) and your microphone (tag 2) separately');
}

function endLocal() {
  try { P.pc && P.pc.close(); } catch (e) {}
  P.pc = null;
  P.taps.forEach(x => x.close()); P.taps = [];
  try { P.ctx && P.ctx.close(); } catch (e) {} P.ctx = null;
  try { P.local && P.local.getTracks().forEach(tr => tr.stop()); } catch (e) {} P.local = null;
  if (P.audioEl) { try { P.audioEl.srcObject = null; P.audioEl.remove(); } catch (e) {} P.audioEl = null; }
  P.remote = null; P.pendingIce = []; P.pendingOffer = null; P.iceRestarted = false; clearInterval(P.ringT);
}
function closeSocket() { P.closing = true; try { P.ws && P.ws.close(); } catch (e) {} P.ws = null; P.closing = false; }
function reset() {
  endLocal(); closeSocket();
  Object.assign(P, { held: [], role: null, code: '', token: '', session: '', peer: '', status: 'idle', c: null, rtc: 'new', rejoinUntil: 0, aiWarned: false, sttWarned: false });
}

/* hang-up / leaving the call screen: tell the server, then clean up */
const _labStop = window.labStop;
window.labStop = function () {
  if (P.c && state.call === P.c) { send({ type: 'hangup' }); reset(); }
  return _labStop && _labStop();
};
const _decline = A.decline;
A.decline = function () {
  if (state.labScript && state.labScript.p2p && P.role === 'receiver') { send({ type: 'decline' }); P.status = 'joined'; clearInterval(P.ringT); state.labScript = null; }
  return _decline.apply(A, arguments);
};
const _mute = A.mute;
A.mute = function (el) {
  _mute && _mute.call(A, el);
  const c = state.call;
  if (c && c === P.c) { if (P.local) P.local.getAudioTracks().forEach(tr => { tr.enabled = !c.mute; }); if (P.taps[1]) P.taps[1].on = !c.mute; paintPill(); }
};
const _beginListening = beginListening;
beginListening = function () {   /* eslint-disable-line no-global-assign */
  _beginListening();
  const c = state.call;
  if (c && c === P.c && P.held && P.held.length) { const h = P.held; P.held = []; h.forEach(onLine); }
};
const _stopProtection = stopProtection;
stopProtection = function () { _stopProtection(); if (P.c && state.call === P.c) send({ type: 'detector', on: false }); };   /* eslint-disable-line no-global-assign */
const _startProtection = startProtection;
startProtection = function (hold) { _startProtection(hold); if (P.c && state.call === P.c && P.role === 'receiver') send({ type: 'detector', on: true }); };   /* eslint-disable-line no-global-assign */

/* the caller's call screen: no analysis there */
const _callBody = callBodyHTML;
callBodyHTML = function () {   /* eslint-disable-line no-global-assign */
  const c = state.call;
  if (c && c.script && c.script.p2p && c.script.role === 'caller') return `<div class="sc-off">${ic('shieldCheck')}<span>${t('pp.callerNote')}</span></div>`;
  return _callBody();
};
function pillKey() {
  if (P.c && P.c.mute) return ['muted', 'pp.s.muted'];
  return ({ calling: ['thinking', 'pp.s.calling'], connecting: ['connecting', 'pp.s.connecting'], connected: ['listening', 'pp.s.connected'], reconnecting: ['connecting', 'pp.s.reconnecting'], error: ['error', 'pp.s.error'] })[P.rtc] || ['connecting', 'pp.s.connecting'];
}
function paintPill() { const p = $('#ppPill'); if (!p) return; const [s, k] = pillKey(); p.dataset.s = s; p.querySelector('span').textContent = t(k); }
const _call = R.call;
R.call = function () {
  let h = _call();
  const c = state.call;
  if (!c || !c.script || !c.script.p2p) return h;
  const [s, k] = pillKey();
  h = h.replace('<div id="cxAlert">', `<div class="lv-bar"><span class="lv-pill" id="ppPill" data-s="${s}"><i aria-hidden="true"></i><span>${t(k)}</span></span></div><div id="cxAlert">`);
  return h.replace('>SIMULYASİYA<', '>2 TELEFON<');
};
const _lineExtra = window.lineExtra;
window.lineExtra = function (l) {
  if (l.live && l.live.sttMs != null && state.judge) return `<div class="stt-meta">${ic(l.who === 'you' ? 'mic' : 'spark', 'ic-sm')} ${esc(l.live.source)} · ${msTxt(l.live.sttMs)}</div>`;
  return _lineExtra ? _lineExtra(l) : '';
};

/* ------------------------------------------------------------------ Lab card */
function cardInner() {
  if (!HAS_SERVER()) return `<div class="lb-note" role="note">${ic('info')}<span>${t('pp.need')}</span></div>`;
  const st = P.status;
  if (st === 'idle') return `
    <label class="lb-check"><input type="checkbox" id="ppConsent" ${P.consent ? 'checked' : ''}>${t('pp.consent')}</label>
    <div class="lb-row"><button class="lb-btn green" data-action="ppCreate">${ic('phoneFill')}${t('pp.asA')}</button></div>
    <div class="lb-row" style="align-items:center"><label class="sr-only" for="ppCode">${t('pp.code')}</label>
      <input id="ppCode" class="lb-ta" style="min-height:48px;max-width:130px;font-size:22px;letter-spacing:4px;text-align:center" inputmode="numeric" maxlength="4" placeholder="0000" value="${esc(P.codeInput)}">
      <button class="lb-btn" data-action="ppJoin">${ic('users')}${t('pp.asB')}</button></div>`;
  if (P.role === 'caller') return `
    <p class="pp-code" aria-label="${t('pp.code')}">${esc(P.code)}</p>
    <p class="hint" style="text-align:left">${P.peer ? t('pp.peerIn', { name: esc(P.peer) }) : t('pp.waitPeer')}</p>
    <div class="lb-row"><button class="lb-btn green" data-action="ppRing" ${P.peer && st !== 'incall' && st !== 'ringing' ? '' : 'disabled'}>${ic('phoneFill')}${t('pp.ring')}</button>
      <button class="lb-btn" data-action="ppCancel">${ic('x')}${t('pp.cancel')}</button></div>`;
  return `<p class="pp-code">${esc(P.code)}</p><p class="hint" style="text-align:left">${t('pp.waitCall')}</p>
    <div class="lb-row"><button class="lb-btn" data-action="ppCancel">${ic('x')}${t('pp.cancel')}</button></div>`;
}
function lastHTML() {
  const s = state.p2pLast; if (!s) return '';
  return `<table class="tech" style="margin-top:10px"><tr><th>${t('pp.connMs')}</th><td>${msTxt(s.connectMs)}</td></tr><tr><th>STT p50</th><td>${msTxt(s.sttMsP50)}</td></tr><tr><th>AI p50</th><td>${msTxt(s.aiMsP50)} · ${esc(s.detectorModel || '')}</td></tr><tr><th>${t('pp.warnMs')}</th><td>${msTxt(s.warnMs)}</td></tr></table>`;
}
const _lab = R.lab;
R.lab = function () {
  const h = _lab();
  const card = `<div class="lb-card"><h2>${ic('users')}${t('pp.title')}</h2><p>${t('pp.b')}</p><div id="ppBox">${cardInner()}</div>${lastHTML()}</div>`;
  const i = h.indexOf('<h2 class="lb-sec">');
  return i < 0 ? h + card : h.slice(0, i) + card + h.slice(i);
};
Object.assign(A, {
  ppCreate() { if (!P.consent) { snack(t('pp.consentFirst')); return; } openSocket({ type: 'create', consent: true, name: 'A' }); },
  ppJoin() {
    const code = String($('#ppCode')?.value || P.codeInput).replace(/\D/g, '');
    if (!P.consent) { snack(t('pp.consentFirst')); return; }
    if (code.length !== 4) { snack(t('pp.badCode')); return; }
    openSocket({ type: 'join', code, consent: true, name: 'B' });
  },
  ppRing() { ring(); },
  ppCancel() { send({ type: 'hangup' }); reset(); paintCard(); }
});
document.addEventListener('change', e => { if (e.target.id === 'ppConsent') P.consent = e.target.checked; });
document.addEventListener('input', e => { if (e.target.id === 'ppCode') P.codeInput = e.target.value.replace(/\D/g, '').slice(0, 4); });

window.__p2p = () => P;   /* for tests */
})();
