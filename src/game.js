// موتور بازی ردپا — فقط روی گوشی میزبان اجرا می‌شود و حالت کامل را پخش می‌کند.
import { clean, validateClue, nearSame, judgeGuess } from './fa.js';
import { pickThree } from './words.js';

export const BOT_NAMES = ['رباتک', 'آهنی', 'پیچ‌ومهره', 'جرقه', 'بیپ', 'مداربسته'];

export const DEFAULT_SETTINGS = {
  rounds: 4,          // هر دور = یک نوبت برای هر تیم
  clueTime: 60,       // ثانیه
  guessTime: 45,
  voteTime: 25,
};

const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 9);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newState(code, hostId) {
  return {
    v: 0,
    code,
    hostId,
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS },
    players: {},          // id -> {id,name,avatar,team,online,joinedAt}
    scores: [0, 0],
    turnNo: 0,            // شماره‌ی نوبت از 0
    nextGuesser: [0, 0],  // اندیس چرخشی حدس‌زن در هر تیم
    usedWords: [],
    turn: null,
    log: [],              // خلاصه‌ی نوبت‌ها برای جوایز
    stats: {},
  };
}

export class HostGame {
  constructor(state, words = []) {
    this.s = state;
    this.words = words;   // [{w, g, c}] — فقط روی گوشی میزبان
  }
  humans(team) { return this.teamMembers(team).filter((p) => !p.bot); }

  // ---------- کمکی‌ها ----------
  get turn() { return this.s.turn; }
  teamMembers(team, onlineOnly = false) {
    return Object.values(this.s.players)
      .filter((p) => p.team === team && (!onlineOnly || p.online))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }
  stat(pid) {
    return (this.s.stats[pid] ||= { clues: 0, survived: 0, dups: 0, struck: 0, strikes: 0, correct: 0, fastest: null, helped: 0 });
  }
  cluers() {
    const t = this.turn;
    return this.teamMembers(t.team, true).filter((p) => p.id !== t.guesserId);
  }
  pickers() {
    return this.cluers().filter((p) => !p.bot);
  }
  opponents() {
    // ربات‌ها خط نمی‌زنند، پس فقط آدم‌ها حساب می‌شوند
    return this.teamMembers(1 - this.turn.team, true).filter((p) => !p.bot);
  }
  bump() { this.s.v++; }

  // ---------- لابی ----------
  join(pid, { name, avatar }) {
    const s = this.s;
    const existing = s.players[pid];
    const nm = clean(name).slice(0, 16) || 'بی‌نام';
    if (existing) {
      existing.name = nm;
      existing.avatar = avatar || existing.avatar;
      existing.online = true;
    } else {
      const counts = [0, 1].map((t) => this.teamMembers(t).length);
      const team = counts[0] <= counts[1] ? 0 : 1;
      s.players[pid] = { id: pid, name: nm, avatar: avatar || '🙂', team, online: true, joinedAt: now() };
    }
    this.bump();
    return true;
  }

  setOnline(onlineIds) {
    let changed = false;
    for (const p of Object.values(this.s.players)) {
      const on = p.bot || p.id === this.s.hostId || onlineIds.has(p.id);
      if (p.online !== on) { p.online = on; changed = true; }
    }
    if (changed) {
      this.bump();
      this.checkProgress();
    }
    return changed;
  }

  shuffleTeams() {
    const ids = shuffle(Object.keys(this.s.players));
    ids.forEach((id, i) => { this.s.players[id].team = i % 2; });
    this.bump();
  }

  addBot(team) {
    const s = this.s;
    const used = new Set(Object.values(s.players).filter((p) => p.bot).map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `ربات ${Object.keys(s.players).length}`;
    const id = 'bot' + rid();
    s.players[id] = { id, name, avatar: '🤖', team, online: true, bot: true, joinedAt: now() };
    this.bump();
  }

  movePlayer(pid) {
    const p = this.s.players[pid];
    if (!p) return;
    p.team = 1 - p.team;
    this.bump();
  }

  kick(pid) {
    if (pid === this.s.hostId) return;
    delete this.s.players[pid];
    this.bump();
  }

  updateSettings(patch) {
    const st = this.s.settings;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || a)));
    if ('rounds' in patch) st.rounds = clamp(patch.rounds, 1, 12);
    if ('clueTime' in patch) st.clueTime = clamp(patch.clueTime, 20, 240);
    if ('guessTime' in patch) st.guessTime = clamp(patch.guessTime, 15, 180);
    this.bump();
  }

  canStart() {
    for (const t of [0, 1]) {
      if (this.teamMembers(t).length < 2) return 'هر تیم دست‌کم ۲ عضو لازم دارد (آدم یا ربات)';
      if (this.humans(t).length < 1) return 'هر تیم دست‌کم یک آدم لازم دارد تا حدس بزند';
    }
    if (!this.words.length) return 'بانک واژه هنوز بارگیری نشده';
    return null;
  }

  start() {
    if (this.canStart()) return false;
    const s = this.s;
    s.scores = [0, 0];
    s.turnNo = 0;
    s.nextGuesser = [0, 0];
    s.log = [];
    s.stats = {};
    s.startedAt = now();
    this.startTurn();
    return true;
  }

  // ---------- نوبت ----------
  startTurn() {
    const s = this.s;
    const team = s.turnNo % 2;
    const members = this.humans(team);
    const online = members.filter((p) => p.online);
    const list = online.length ? online : members;
    const idx = s.nextGuesser[team] % list.length;
    s.nextGuesser[team] = idx + 1;
    const hasBot = this.teamMembers(team).some((p) => p.bot);
    const options = pickThree(this.words, s.usedWords, hasBot);
    options.forEach((o) => s.usedWords.push(o.w));
    if (s.usedWords.length > this.words.length - 6) s.usedWords = [];
    s.turn = {
      id: rid(),
      team,
      guesserId: list[idx].id,
      options: options.map((o) => o.w),
      picks: {},           // pid -> index
      pickDone: [],
      word: null,
      clues: {},           // pid -> {text, at}
      list: [],            // پس از پایان سرنخ‌ها: [{id, pid, text, dup, strikes:[], removed}]
      confirms: [],
      guess: null,
      verdict: null,       // correct | wrong | giveup | timeout
      votes: {},
      startedAt: now(),
      deadline: null,
    };
    s.phase = 'pick';
    if (this.pickers().length === 0) this.resolvePick();
    this.bump();
  }

  resolvePick() {
    const t = this.turn;
    const counts = [0, 0, 0];
    for (const i of Object.values(t.picks)) counts[i]++;
    const max = Math.max(...counts);
    const top = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
    const idx = top[Math.floor(Math.random() * top.length)];
    t.word = t.options[idx];
    t.pickIndex = idx;
    this.startClues();
  }

  startClues() {
    const t = this.turn;
    const s = this.s;
    s.phase = 'clue';
    t.deadline = now() + s.settings.clueTime * 1000;
    // زمان‌بندی سرنخ ربات‌ها
    const bots = this.cluers().filter((p) => p.bot);
    const span = Math.min(14, s.settings.clueTime * 0.4);
    t.botPlan = Object.fromEntries(bots.map((b) => [b.id, now() + (3 + Math.random() * span) * 1000]));
    this.bump();
  }

  botClue(botId) {
    const t = this.turn;
    const pool = (this.words.find((x) => x.w === t.word)?.c || []).filter((c) => !validateClue(c, t.word));
    const taken = new Set(Object.values(t.clues).map((c) => c.text));
    const fresh = pool.filter((c) => !taken.has(c));
    const list = fresh.length ? fresh : pool;
    const text = list.length ? list[Math.floor(Math.random() * list.length)] : '؟';
    t.clues[botId] = { text, at: now(), bot: true };
    delete t.botPlan[botId];
  }

  // ---------- کنش‌های بازیکن ----------
  handle(pid, a) {
    const s = this.s;
    const t = s.turn;
    const p = s.players[pid];
    if (a.type === 'join') return this.join(pid, a);
    if (!p) return false;
    switch (a.type) {
      case 'pick': {
        if (s.phase !== 'pick' || pid === t.guesserId || p.team !== t.team) return false;
        if (t.pickDone.includes(pid)) return false;
        const i = Number(a.index);
        if (!(i >= 0 && i < t.options.length)) return false;
        t.picks[pid] = i;
        this.bump();
        return true;
      }
      case 'pickok': {
        if (s.phase !== 'pick' || !(pid in t.picks)) return false;
        if (!t.pickDone.includes(pid)) t.pickDone.push(pid);
        this.bump();
        this.checkProgress();
        return true;
      }
      case 'pickundo': {
        if (s.phase !== 'pick') return false;
        t.pickDone = t.pickDone.filter((x) => x !== pid);
        this.bump();
        return true;
      }
      case 'clue': {
        if (s.phase !== 'clue' || pid === t.guesserId || p.team !== t.team) return false;
        if (validateClue(a.text, t.word)) return false;
        t.clues[pid] = { text: clean(a.text), at: now() };
        this.bump();
        this.checkProgress();
        return true;
      }
      case 'unclue': {
        if (s.phase !== 'clue' || !t.clues[pid]) return false;
        delete t.clues[pid];
        this.bump();
        return true;
      }
      case 'strike': {
        if (s.phase !== 'filter' || p.team === t.team || t.confirms.includes(pid)) return false;
        const c = t.list.find((x) => x.id === a.id);
        if (!c || c.dup) return false;
        const i = c.strikes.indexOf(pid);
        if (i >= 0) c.strikes.splice(i, 1); else c.strikes.push(pid);
        this.refreshRemoved();
        this.bump();
        return true;
      }
      case 'confirm': {
        if (s.phase !== 'filter' || p.team === t.team) return false;
        if (!t.confirms.includes(pid)) t.confirms.push(pid);
        this.bump();
        this.checkProgress();
        return true;
      }
      case 'unconfirm': {
        if (s.phase !== 'filter') return false;
        t.confirms = t.confirms.filter((x) => x !== pid);
        this.bump();
        return true;
      }
      case 'guess': {
        if (s.phase !== 'guess' || pid !== t.guesserId) return false;
        const g = clean(a.text);
        if (!g) return false;
        t.guess = g;
        t.guessMs = now() - t.guessStartedAt;
        const j = judgeGuess(g, t.word);
        if (j === 'exact') this.finishTurn('correct');
        else if (j === 'maybe') this.startVote();
        else this.finishTurn('wrong');
        return true;
      }
      case 'giveup': {
        if (s.phase !== 'guess' || pid !== t.guesserId) return false;
        this.finishTurn('giveup');
        return true;
      }
      case 'vote': {
        if (s.phase !== 'vote' || p.bot) return false;
        t.votes[pid] = !!a.ok;
        this.bump();
        this.checkProgress();
        return true;
      }
      default:
        return false;
    }
  }

  refreshRemoved() {
    const t = this.turn;
    const opp = this.opponents().map((p) => p.id);
    for (const c of t.list) {
      if (c.dup) { c.removed = true; continue; }
      c.removed = opp.length > 0 && opp.every((id) => c.strikes.includes(id));
    }
  }

  closeClues() {
    const t = this.turn;
    const entries = Object.entries(t.clues).map(([pid, c]) => ({ id: rid(), pid, text: c.text, dup: false, strikes: [], removed: false }));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (nearSame(entries[i].text, entries[j].text)) { entries[i].dup = true; entries[j].dup = true; }
      }
    }
    for (const e of entries) {
      if (e.dup) e.removed = true;
      const st = this.stat(e.pid);
      st.clues++;
      if (e.dup) st.dups++;
    }
    t.list = shuffle(entries);
    if (this.opponents().length === 0) return this.startGuess();
    this.s.phase = 'filter';
    t.deadline = null;
    this.bump();
  }

  startGuess() {
    const t = this.turn;
    this.refreshRemoved();
    this.s.phase = 'guess';
    t.guessStartedAt = now();
    t.deadline = now() + this.s.settings.guessTime * 1000;
    this.bump();
  }

  startVote() {
    const t = this.turn;
    this.s.phase = 'vote';
    t.votes = {};
    t.deadline = now() + this.s.settings.voteTime * 1000;
    this.bump();
  }

  finishTurn(verdict) {
    const s = this.s;
    const t = s.turn;
    t.verdict = verdict;
    t.deadline = null;
    if (verdict === 'correct') s.scores[t.team]++;
    // آمار
    for (const c of t.list) {
      const st = this.stat(c.pid);
      if (!c.removed) {
        st.survived++;
        if (verdict === 'correct') st.helped++;
      } else if (!c.dup) {
        st.struck++;
      }
      for (const by of c.strikes) if (c.removed && !c.dup) this.stat(by).strikes++;
    }
    if (verdict === 'correct') {
      const st = this.stat(t.guesserId);
      st.correct++;
      if (st.fastest == null || t.guessMs < st.fastest) st.fastest = t.guessMs;
    }
    s.log.push({ team: t.team, word: t.word, guesserId: t.guesserId, verdict, guess: t.guess, guessMs: t.guessMs });
    s.phase = 'reveal';
    this.bump();
  }

  next() {
    const s = this.s;
    if (s.phase !== 'reveal') return false;
    s.turnNo++;
    if (s.turnNo >= s.settings.rounds * 2) {
      s.phase = 'end';
      s.awards = this.awards();
      s.turn = null;
      this.bump();
      return true;
    }
    this.startTurn();
    return true;
  }

  backToLobby() {
    const s = this.s;
    s.phase = 'lobby';
    s.turn = null;
    s.scores = [0, 0];
    s.awards = null;
    this.bump();
  }

  // ---------- پیشروی خودکار ----------
  checkProgress() {
    const s = this.s;
    const t = s.turn;
    if (!t) return;
    if (s.phase === 'pick') {
      const pk = this.pickers();
      if (pk.every((p) => t.pickDone.includes(p.id))) this.resolvePick();
    } else if (s.phase === 'clue') {
      const cl = this.cluers();
      if (cl.length && cl.every((p) => t.clues[p.id])) this.closeClues();
    } else if (s.phase === 'filter') {
      this.refreshRemoved();
      const opp = this.opponents();
      if (opp.length === 0 || opp.every((p) => t.confirms.includes(p.id))) this.startGuess();
    } else if (s.phase === 'vote') {
      const online = Object.values(s.players).filter((p) => p.online && !p.bot);
      if (online.every((p) => p.id in t.votes)) this.resolveVote();
    } else if (s.phase === 'guess') {
      if (!s.players[t.guesserId]?.online && Object.keys(s.players).length) {
        // اگر حدس‌زن رفت، صبر می‌کنیم تا زمان تمام شود
      }
    }
  }

  resolveVote() {
    const t = this.turn;
    const vals = Object.values(t.votes);
    const yes = vals.filter(Boolean).length;
    const no = vals.length - yes;
    t.voteResult = { yes, no };
    this.finishTurn(yes > no ? 'correct' : 'wrong');
  }

  tick() {
    const s = this.s;
    const t = s.turn;
    if (s.phase === 'clue' && t?.botPlan) {
      const due = Object.entries(t.botPlan).filter(([, at]) => now() >= at);
      if (due.length) {
        due.forEach(([id]) => this.botClue(id));
        this.bump();
        this.checkProgress();
        return true;
      }
    }
    if (!t || !t.deadline || now() < t.deadline) return false;
    if (s.phase === 'clue') {
      Object.keys(t.botPlan || {}).forEach((id) => this.botClue(id));
      this.closeClues();
    } else if (s.phase === 'guess') this.finishTurn('timeout');
    else if (s.phase === 'vote') this.resolveVote();
    else return false;
    return true;
  }

  // ---------- جوایز ----------
  awards() {
    const s = this.s;
    const out = [];
    const ids = Object.keys(s.players);
    const best = (fn, min = 1) => {
      let top = null, val = -Infinity;
      for (const id of ids) {
        const v = fn(this.stat(id));
        if (v != null && v >= min && v > val) { val = v; top = id; }
      }
      return top ? { pid: top, value: val } : null;
    };
    const add = (key, title, desc, r, fmt = (v) => v) => r && out.push({ key, title, desc, pid: r.pid, value: fmt(r.value) });
    add('golden', 'سرنخ طلایی', 'بیشترین سرنخی که به حدس درست رسید', best((x) => x.helped));
    add('sniper', 'حدس‌زن تیزبین', 'بیشترین حدس درست', best((x) => x.correct));
    add('flash', 'برق‌آسا', 'سریع‌ترین حدس درست', best((x) => (x.fastest == null ? null : 1e7 - x.fastest), 0), (v) => `${((1e7 - v) / 1000).toFixed(1)} ثانیه`);
    add('twin', 'هم‌فکر', 'بیشترین سرنخ تکراری با هم‌تیمی‌ها', best((x) => x.dups));
    add('scissors', 'قیچی طلایی', 'بیشترین سرنخ خط‌خورده‌ی حریف', best((x) => x.strikes));
    add('bold', 'بی‌پروا', 'سرنخ‌هایش بیشتر از همه خط خورد', best((x) => x.struck));
    return out;
  }
}
