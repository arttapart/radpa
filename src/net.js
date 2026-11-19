// لایه‌ی شبکه — قابل‌تعویض. هر ترنسپورت باید این رابط را داشته باشد:
//   connect(): Promise<void>
//   send(msg)                      پخش پیام به همه‌ی اعضای اتاق
//   onMessage(fn)                  دریافت پیام‌ها
//   onPresence(fn(Set<id>))        فهرست آنلاین‌ها
//   close()
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://mbqexxlmrtfwdcwupsxg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3OpKX6F8OvvuCly7La8Zcw_xOhvsMAY';

let client = null;
function sb() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 30 } },
    });
  }
  return client;
}

class SupabaseTransport {
  constructor(room, myId) {
    this.room = room;
    this.myId = myId;
    this.msgFns = [];
    this.presFns = [];
    this.statusFns = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ch = sb().channel(`radpa-${this.room}`, {
        config: { broadcast: { self: false, ack: false }, presence: { key: this.myId } },
      });
      this.ch = ch;
      ch.on('broadcast', { event: 'm' }, ({ payload }) => this.msgFns.forEach((f) => f(payload)));
      ch.on('presence', { event: 'sync' }, () => {
        const ids = new Set(Object.keys(ch.presenceState()));
        this.presFns.forEach((f) => f(ids));
      });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, 12000);
      ch.subscribe(async (status) => {
        this.statusFns.forEach((f) => f(status));
        if (status === 'SUBSCRIBED') {
          await ch.track({ at: Date.now() });
          if (!done) { done = true; clearTimeout(timer); resolve(); }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !done) {
          done = true; clearTimeout(timer); reject(new Error(status));
        }
      });
    });
  }
  send(msg) { this.ch?.send({ type: 'broadcast', event: 'm', payload: msg }); }
  onMessage(f) { this.msgFns.push(f); }
  onPresence(f) { this.presFns.push(f); }
  onStatus(f) { this.statusFns.push(f); }
  close() { if (this.ch) sb().removeChannel(this.ch); this.ch = null; }
}

// ترنسپورت محلی برای تست روی یک مرورگر (چند زبانه): ?net=local
class LocalTransport {
  constructor(room, myId) {
    this.room = room;
    this.myId = myId;
    this.msgFns = [];
    this.presFns = [];
    this.seen = new Map();
  }
  connect() {
    this.bc = new BroadcastChannel(`radpa-${this.room}`);
    this.bc.onmessage = (e) => {
      const d = e.data;
      if (d.__hb) { this.seen.set(d.__hb, Date.now()); return; }
      this.msgFns.forEach((f) => f(d));
    };
    const beat = () => {
      this.bc?.postMessage({ __hb: this.myId });
      this.seen.set(this.myId, Date.now());
      const ids = new Set([...this.seen].filter(([, t]) => Date.now() - t < 3500).map(([id]) => id));
      const key = [...ids].sort().join(',');
      if (key !== this.lastKey) { this.lastKey = key; this.presFns.forEach((f) => f(ids)); }
    };
    this.hb = setInterval(beat, 700);
    beat();
    return new Promise((r) => setTimeout(r, 150));
  }
  send(msg) { this.bc?.postMessage(JSON.parse(JSON.stringify(msg))); }
  onMessage(f) { this.msgFns.push(f); }
  onPresence(f) { this.presFns.push(f); }
  onStatus() {}
  close() { clearInterval(this.hb); this.bc?.close(); this.bc = null; }
}

export function createTransport(room, myId) {
  const mode = new URLSearchParams(location.search).get('net');
  return mode === 'local' ? new LocalTransport(room, myId) : new SupabaseTransport(room, myId);
}
