// Scam Guardian — tiny persistent store (JSON file, atomic writes).
// Only redacted text and verdict metadata are stored. Audio is never stored.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_HISTORY = 500, MAX_FEEDBACK = 2000;

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'store.json');
  let db = { history: [], feedback: [] };
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { /* first run */ }
  let timer = null;
  function flush() {
    timer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }
  const save = () => { if (!timer) timer = setTimeout(flush, 150); };
  const id = () => crypto.randomBytes(8).toString('hex');

  return {
    file,
    add(entry) {
      const e = Object.assign({ id: id(), at: new Date().toISOString() }, entry);
      db.history.unshift(e);
      if (db.history.length > MAX_HISTORY) db.history.length = MAX_HISTORY;
      save();
      return e;
    },
    list(limit = 100) { return db.history.slice(0, limit); },
    get(i) { return db.history.find(e => e.id === i) || null; },
    remove(i) { const n = db.history.length; db.history = db.history.filter(e => e.id !== i); save(); return n !== db.history.length; },
    clear() { db.history = []; save(); },
    feedback(f) {
      const e = Object.assign({ id: id(), at: new Date().toISOString() }, f);
      db.feedback = db.feedback.filter(x => x.entryId !== f.entryId);
      db.feedback.unshift(e);
      if (db.feedback.length > MAX_FEEDBACK) db.feedback.length = MAX_FEEDBACK;
      const h = db.history.find(x => x.id === f.entryId);
      if (h) h.feedback = f.verdict;
      save();
      return e;
    },
    stats() {
      const h = db.history, fb = db.feedback;
      const by = k => h.reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
      return {
        total: h.length, byLevel: by('level'), byKind: by('kind'),
        feedback: { total: fb.length, correct: fb.filter(f => f.verdict === 'correct').length, wrong: fb.filter(f => f.verdict === 'wrong').length }
      };
    },
    flushNow() { if (timer) { clearTimeout(timer); flush(); } }
  };
}

module.exports = { createStore };
