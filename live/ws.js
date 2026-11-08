// @ts-check
/* Minimal RFC 6455 WebSocket server (no dependencies): text + binary messages, fragmentation,
 * ping/pong, close, payload size limit. Enough for the Live call bridge between the app and server.js. */
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WsConn extends EventEmitter {
  /** @param {import('net').Socket} socket @param {number} maxPayload */
  constructor(socket, maxPayload) {
    super();
    this.socket = socket;
    this.max = maxPayload;
    /** @type {Buffer<ArrayBufferLike>} */
    this.buf = Buffer.alloc(0);
    /** @type {{op: number, parts: Buffer[]} | null} */
    this.frag = null;
    this.open = true;
    this.done = false;
    socket.on('data', b => this._onData(/** @type {Buffer} */ (b)));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
    this.pinger = setInterval(() => this._write(9, Buffer.alloc(0)), 20000);
  }
  /** @param {Buffer} chunk */
  _onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (this.buf.length < 10) return;
        if (this.buf.readUInt32BE(2) !== 0) return this.close(1009, 'too big');
        len = this.buf.readUInt32BE(6); off = 10;
      }
      if (len > this.max) return this.close(1009, 'too big');
      if (!masked) return this.close(1002, 'unmasked frame');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this._frame(fin, op, data);
      if (!this.open) return;
    }
  }
  /** @param {boolean} fin @param {number} op @param {Buffer} data */
  _frame(fin, op, data) {
    if (op === 8) return this.close(1000);
    if (op === 9) return this._write(10, data);
    if (op === 10) return;
    if (op === 0) {
      if (!this.frag) return this.close(1002, 'bad continuation');
      this.frag.parts.push(data);
      if (fin) { const d = Buffer.concat(this.frag.parts), o = this.frag.op; this.frag = null; this._msg(o, d); }
      return;
    }
    if (!fin) { this.frag = { op, parts: [data] }; return; }
    this._msg(op, data);
  }
  /** @param {number} op @param {Buffer} d */
  _msg(op, d) {
    if (op === 1) this.emit('text', d.toString('utf8'));
    else if (op === 2) this.emit('binary', d);
  }
  /** @param {number} op @param {Buffer} payload */
  _write(op, payload) {
    if (!this.open || this.socket.destroyed) return;
    const len = payload.length;
    let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
    this.socket.write(Buffer.concat([h, payload]));
  }
  /** @param {object} o */
  sendJson(o) { this._write(1, Buffer.from(JSON.stringify(o))); }
  /** @param {Buffer} b */
  sendBinary(b) { this._write(2, b); }
  /** bytes waiting in the socket (back-pressure) */
  get buffered() { return this.socket.writableLength; }
  close(code = 1000, reason = '') {
    if (!this.open) return;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason));
    p.writeUInt16BE(code, 0); p.write(reason, 2);
    this._write(8, p);
    this.open = false;
    this.socket.end();
    this._closed();
  }
  _closed() {
    if (this.done) return;
    this.done = true; this.open = false;
    clearInterval(this.pinger);
    this.emit('close');
  }
}

/**
 * Completes the HTTP upgrade. Returns null (and answers 400) when the request is not a WebSocket handshake.
 * @param {import('http').IncomingMessage} req @param {import('net').Socket} socket
 * @param {{maxPayload?: number}} [opts]
 */
function accept(req, socket, opts = {}) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { reject(socket, 400, 'Bad Request'); return null; }
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + acceptKey, '', ''].join('\r\n'));
  socket.setNoDelay(true);
  return new WsConn(socket, opts.maxPayload || 1 << 20);
}
/** @param {import('net').Socket} socket @param {number} code @param {string} msg */
function reject(socket, code, msg) {
  socket.end(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${msg}`);
}

module.exports = { accept, reject, WsConn };
