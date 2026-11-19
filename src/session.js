// اتصال یک گوشی به اتاق: نقش میزبان (مرجع حالت) یا مهمان
import { createTransport } from './net.js';
import { HostGame, newState } from './game.js';
import { loadWords } from './words.js';

const LS_ID = 'radpa.id';
const LS_SESSION = 'radpa.session';
const LS_HOST = 'radpa.hostState';

function store(key, val) { try { val == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }

export function myId() {
  // در حالت تست محلی هر زبانه یک بازیکن جداست
  const st = new URLSearchParams(location.search).get('net') === 'local' ? sessionStorage : localStorage;
  let id = null;
  try { id = st.getItem(LS_ID); } catch {}
  if (!id) {
    id = 'p' + Math.random().toString(36).slice(2, 10);
    try { st.setItem(LS_ID, id); } catch {}
  }
  return id;
}

export function savedSession() {
  const s = load(LS_SESSION);
  if (!s || Date.now() - s.at > 3 * 3600 * 1000) return null;
  return s;
}

export class Session {
  constructor(onChange) {
    this.id = myId();
    this.onChange = onChange;
    this.state = null;
    this.offset = 0;
    this.role = null;
    this.status = 'idle';
    this.online = new Set();
  }
  emit() { this.onChange?.(this); }
  serverNow() { return Date.now() - this.offset; }

  // ---------- میزبان ----------
  async host(profile, resume) {
    this.role = 'host';
    this.status = 'connecting';
    this.emit();
    const wordsP = loadWords().catch(() => ({ list: [], from: 'none' }));
    let code = resume?.code;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (!code) code = String(1000 + Math.floor(Math.random() * 9000));
      const tr = createTransport(code, this.id);
      let taken = false;
      tr.onMessage((m) => { if (m.t === 'state' && m.state?.hostId !== this.id) taken = true; });
      await tr.connect();
      if (!resume) {
        tr.send({ t: 'hello', from: this.id });
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (taken && !resume) { tr.close(); code = null; continue; }
      this.tr = tr;
      break;
    }
    if (!this.tr) throw new Error('no-room');
    const st = resume?.state && resume.state.code === code ? resume.state : newState(code, this.id);
    const words = await wordsP;
    this.wordsFrom = words.from;
    this.wordCount = words.list.length;
    this.game = new HostGame(st, words.list);
    this.game.join(this.id, profile);
    this.state = st;
    this.tr.onMessage((m) => this.hostMsg(m));
    this.tr.onPresence((ids) => {
      this.online = ids;
      if (this.game.setOnline(ids)) this.publish();
      else this.emit();
    });
    this.tick = setInterval(() => { if (this.game.tick()) this.publish(); }, 300);
    this.beat = setInterval(() => this.publish(true), 2500);
    this.status = 'ready';
    store(LS_SESSION, { role: 'host', code, at: Date.now(), profile });
    this.publish();
  }

  hostMsg(m) {
    if (m.t === 'hello') this.publish(true);
    else if (m.t === 'act' && m.from) {
      if (this.game.handle(m.from, m.a || {})) this.publish();
      else if (m.a?.type === 'join') this.publish(true);
    }
  }

  publish(quiet = false) {
    if (!this.tr) return;
    this.tr.send({ t: 'state', now: Date.now(), state: this.state });
    if (!quiet) {
      store(LS_HOST, this.state);
      store(LS_SESSION, { ...load(LS_SESSION), at: Date.now() });
    }
    this.emit();
  }

  hostDo(fn) {
    if (this.role !== 'host') return;
    const r = fn(this.game);
    this.publish();
    return r;
  }

  // ---------- مهمان ----------
  async join(code, profile) {
    this.role = 'guest';
    this.status = 'connecting';
    this.profile = profile;
    this.emit();
    const tr = createTransport(code, this.id);
    this.tr = tr;
    tr.onMessage((m) => {
      if (m.t !== 'state' || !m.state || m.state.code !== code) return;
      if (this.state && m.state.v < this.state.v && m.state.hostId === this.state.hostId) return;
      this.offset = Date.now() - m.now;
      this.state = m.state;
      this.lastHostMsg = Date.now();
      if (this.state.players[this.id]) {
        this.joined = true;
      } else if (this.joined) {
        this.status = 'kicked';
        this.leave(true);
      }
      if (this.status === 'connecting' && this.state.players[this.id]) this.status = 'ready';
      this.emit();
    });
    tr.onPresence((ids) => { this.online = ids; this.emit(); });
    await tr.connect();
    const sendJoin = () => tr.send({ t: 'act', from: this.id, a: { type: 'join', ...profile } });
    sendJoin();
    tr.send({ t: 'hello', from: this.id });
    store(LS_SESSION, { role: 'guest', code, at: Date.now(), profile });
    return new Promise((resolve, reject) => {
      let n = 0;
      const iv = setInterval(() => {
        if (this.state?.players[this.id]) { clearInterval(iv); resolve(); return; }
        if (++n > 8) { clearInterval(iv); this.leave(); reject(new Error('not-found')); return; }
        sendJoin();
      }, 1200);
      this.watch = setInterval(() => {
        const lost = this.lastHostMsg && Date.now() - this.lastHostMsg > 9000;
        if (lost !== this.hostLost) { this.hostLost = lost; this.emit(); }
        if (lost) sendJoin();
      }, 1500);
    });
  }

  act(a) {
    if (this.role === 'host') {
      if (this.game.handle(this.id, a)) this.publish();
    } else {
      this.tr?.send({ t: 'act', from: this.id, a });
    }
  }

  leave(keepStatus = false) {
    clearInterval(this.tick); clearInterval(this.beat); clearInterval(this.watch);
    this.tr?.close();
    this.tr = null;
    store(LS_SESSION, null);
    if (this.role === 'host') store(LS_HOST, null);
    if (!keepStatus) this.status = 'idle';
    this.emit();
  }
}

export function hostResumeData() {
  const s = savedSession();
  if (!s || s.role !== 'host') return null;
  return { code: s.code, state: load(LS_HOST) };
}
