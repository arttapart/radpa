import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/900.css';
import './style.css';
import QRCode from 'qrcode';
import { morph } from './morph.js';
import { Session, savedSession, hostResumeData } from './session.js';
import { CATEGORIES } from './words.js';
import { validateClue } from './fa.js';

// ---------- ثابت‌ها و کمکی‌ها ----------
const WEB_URL = 'https://arttapart.github.io/radpa/';
const AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦉', '🐧', '🐢', '🦄', '🐝', '🐳', '🦔', '🐨', '🦩', '🐲'];
const TEAM = ['آبی', 'نارنجی'];
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLatinDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const buzz = (p) => { try { navigator.vibrate?.(p); } catch {} };

const params = new URLSearchParams(location.search);
const ui = {
  name: lsGet('radpa.name', ''),
  avatar: lsGet('radpa.avatar', AVATARS[Math.floor(Math.random() * AVATARS.length)]),
  code: (params.get('room') || '').replace(/\D/g, '').slice(0, 4),
  error: '',
  busy: false,
  clue: '',
  guess: '',
  rules: false,
  toast: '',
  qr: {},
};

const app = document.getElementById('app');
const session = new Session(() => render());
let lastPhaseKey = '';

// ---------- قطعه‌های رابط ----------
const icon = {
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
  crown: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};

const logo = (size = 'lg') => `
  <div class="logo logo-${size}" aria-label="ردپا">
    <span class="steps"><i></i><i></i><i></i></span>
    <span class="logo-word">ردپا</span>
  </div>`;

function avatarOf(p) { return `<span class="av">${esc(p?.avatar || '🙂')}</span>`; }
function nameOf(id) { return esc(session.state?.players[id]?.name || '؟'); }

function timer(deadline, total) {
  if (!deadline) return '';
  return `<div class="timer" data-deadline="${deadline}" data-total="${total * 1000}">
    <div class="timer-bar"><span></span></div>
    <b class="timer-num">${fa(Math.max(0, Math.ceil((deadline - session.serverNow()) / 1000)))}</b>
  </div>`;
}

// ---------- صفحه‌ی خانه ----------
function viewHome() {
  const saved = savedSession();
  return `
  <section class="screen home" data-key="home">
    <header class="home-head">
      ${logo('lg')}
      <p class="tagline">یک کلمه بگو، ردش را بگیر.</p>
    </header>

    <div class="card stack">
      <label class="field">
        <span>اسمت</span>
        <input id="name" data-model="name" maxlength="16" autocomplete="off" placeholder="مثلاً سارا" value="${esc(ui.name)}">
      </label>
      <div class="avatars" role="radiogroup" aria-label="نماد">
        ${AVATARS.map((a) => `<button class="avatar ${a === ui.avatar ? 'on' : ''}" data-act="avatar" data-v="${a}" aria-label="${a}">${a}</button>`).join('')}
      </div>
    </div>

    ${saved ? `<button class="card resume" data-act="resume">
        <span>بازگشت به اتاق <b class="digits">${fa(saved.code)}</b></span>${icon.back}
      </button>` : ''}

    <button class="btn primary big" data-act="create" ${ui.busy ? 'disabled' : ''}>ساختن اتاق</button>

    <div class="or"><span>یا با کد وارد شو</span></div>

    <div class="join-row">
      <input id="code" class="code-input digits" data-model="code" inputmode="numeric" maxlength="4" placeholder="کد ۴ رقمی" value="${esc(fa(ui.code))}">
      <button class="btn" data-act="join" ${ui.busy || ui.code.length !== 4 ? 'disabled' : ''}>ورود</button>
    </div>

    ${ui.error ? `<p class="error shake" data-key="err-${esc(ui.error)}">${esc(ui.error)}</p>` : ''}
    ${ui.busy ? `<p class="muted center pulse">در حال اتصال…</p>` : ''}

    <button class="link" data-act="rules">بازی چطوری است؟</button>
  </section>`;
}

function viewRules() {
  return `
  <div class="overlay" data-act="rules-close" data-key="rules">
    <div class="sheet" data-stop>
      <h2>قانون‌های ردپا</h2>
      <ol class="rules">
        <li>بازیکن‌ها دو تیم می‌شوند. در هر نوبت، یک نفر از یک تیم <b>حدس‌زن</b> است و واژه را نمی‌بیند.</li>
        <li>هم‌تیمی‌هایش واژه را می‌بینند و هر کدام <b>فقط یک کلمه</b> سرنخ می‌نویسند.</li>
        <li>سرنخ‌های تکراری یا خیلی شبیه به هم خودکار <b>خط می‌خورند</b>.</li>
        <li>تیم <b>حریف</b> سرنخ‌ها را می‌بیند و می‌تواند خط بزند؛ سرنخی حذف می‌شود که همه‌ی اعضای حریف خطش بزنند.</li>
        <li>بعد از تأیید حریف، سرنخ‌های باقی‌مانده به حدس‌زن می‌رسد. حدس درست یعنی <b>یک امتیاز</b>.</li>
        <li>اگر حدس نزدیک باشد (مثلاً جمع یا غلط تایپی)، همه رأی می‌دهند که قبول است یا نه.</li>
      </ol>
      <button class="btn primary" data-act="rules-close">فهمیدم</button>
    </div>
  </div>`;
}

// ---------- لابی ----------
function qrFor(code) {
  if (ui.qr[code]) return ui.qr[code];
  ui.qr[code] = '';
  const css = getComputedStyle(document.documentElement);
  QRCode.toDataURL(`${WEB_URL}?room=${code}`, {
    margin: 0, width: 360, errorCorrectionLevel: 'M',
    color: { dark: css.getPropertyValue('--ink').trim() || '#111', light: '#0000' },
  }).then((u) => { ui.qr[code] = u; render(); });
  return '';
}

function playerChip(p, host, canEdit) {
  const s = session.state;
  return `<li class="chip ${p.online ? '' : 'off'} ${p.id === session.id ? 'me' : ''}" data-key="pl-${p.id}">
    <button class="chip-main" ${canEdit ? `data-act="move" data-v="${p.id}"` : 'disabled'}>
      ${avatarOf(p)}<span class="chip-name">${esc(p.name)}</span>
      ${p.id === s.hostId ? `<span class="crown" title="میزبان">${icon.crown}</span>` : ''}
    </button>
    ${canEdit && p.id !== s.hostId ? `<button class="chip-x" data-act="kick" data-v="${p.id}" aria-label="حذف">${icon.x}</button>` : ''}
  </li>`;
}

function stepper(label, key, value, step, unit) {
  return `<div class="stepper">
    <span class="stepper-label">${label}</span>
    <div class="stepper-ctl">
      <button data-act="set" data-k="${key}" data-v="${value + step}" aria-label="بیشتر">+</button>
      <b>${fa(value)}<small>${unit}</small></b>
      <button data-act="set" data-k="${key}" data-v="${value - step}" aria-label="کمتر">−</button>
    </div>
  </div>`;
}

function viewLobby() {
  const s = session.state;
  const isHost = session.role === 'host';
  const players = Object.values(s.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const qr = qrFor(s.code);
  const st = s.settings;
  const cats = st.categories;
  const reason = isHost ? session.game.canStart() : null;
  return `
  <section class="screen lobby" data-key="lobby">
    <div class="topbar">
      <button class="icon-btn" data-act="leave" aria-label="خروج">${icon.back}</button>
      ${logo('sm')}
      <span class="spacer"></span>
    </div>

    <div class="card room">
      <div class="room-code">
        <span class="muted">کد اتاق</span>
        <b class="digits code-big">${[...fa(s.code)].map((d, i) => `<i style="--i:${i}">${d}</i>`).join('')}</b>
        <button class="btn ghost small" data-act="share">${icon.share}<span>دعوت دوستان</span></button>
      </div>
      <div class="qr">${qr ? `<img src="${qr}" alt="QR">` : '<span class="qr-ph"></span>'}</div>
    </div>

    <div class="teams">
      ${[0, 1].map((t) => {
        const list = players.filter((p) => p.team === t);
        return `<div class="team team-${t}">
          <div class="team-head"><span class="dot"></span>تیم ${TEAM[t]}<span class="count">${fa(list.length)}</span></div>
          <ul class="chips">${list.map((p) => playerChip(p, s.hostId, isHost)).join('') || '<li class="empty">هنوز کسی نیست</li>'}</ul>
        </div>`;
      }).join('')}
    </div>
    ${isHost ? `<div class="row">
        <button class="btn ghost small" data-act="shuffle">${icon.shuffle}<span>چیدن تصادفی تیم‌ها</span></button>
        <span class="hint">برای جابه‌جایی، روی اسم بزن</span>
      </div>` : ''}

    <div class="card settings ${isHost ? '' : 'readonly'}">
      <h3>تنظیمات</h3>
      ${isHost ? `
        ${stepper('تعداد دور', 'rounds', st.rounds, 1, '')}
        ${stepper('زمان سرنخ', 'clueTime', st.clueTime, 10, 'ثانیه')}
        ${stepper('زمان حدس', 'guessTime', st.guessTime, 5, 'ثانیه')}
        <div class="cats">
          <button class="tag ${cats.length === 0 ? 'on' : ''}" data-act="cat" data-v="*">همه</button>
          ${Object.entries(CATEGORIES).map(([k, c]) => `<button class="tag ${cats.includes(k) ? 'on' : ''}" data-act="cat" data-v="${k}">${c.title}</button>`).join('')}
        </div>` : `
        <p class="summary">${fa(st.rounds)} دور · سرنخ ${fa(st.clueTime)} ثانیه · حدس ${fa(st.guessTime)} ثانیه</p>
        <p class="summary muted">${cats.length ? cats.map((k) => CATEGORIES[k]?.title).join('، ') : 'همه‌ی دسته‌ها'}</p>`}
    </div>

    <div class="bottom">
      ${isHost
        ? `<button class="btn primary big" data-act="start" ${reason ? 'disabled' : ''}>شروع بازی</button>
           ${reason ? `<p class="hint center">${reason}</p>` : ''}`
        : `<p class="waiting"><span class="dots"><i></i><i></i><i></i></span>منتظر شروع از طرف میزبان</p>`}
    </div>
  </section>`;
}

// ---------- بازی ----------
function scoreboard() {
  const s = session.state;
  const t = s.turn;
  const total = s.settings.rounds;
  const round = Math.min(total, Math.floor(s.turnNo / 2) + 1);
  return `<div class="scoreboard">
    <div class="score team-0 ${t?.team === 0 ? 'active' : ''}"><span>تیم ${TEAM[0]}</span><b data-key="sc0-${s.scores[0]}" class="pop">${fa(s.scores[0])}</b></div>
    <div class="round"><small>دور</small><b>${fa(round)}<span> از ${fa(total)}</span></b></div>
    <div class="score team-1 ${t?.team === 1 ? 'active' : ''}"><span>تیم ${TEAM[1]}</span><b data-key="sc1-${s.scores[1]}" class="pop">${fa(s.scores[1])}</b></div>
  </div>`;
}

function role() {
  const s = session.state;
  const t = s.turn;
  const me = s.players[session.id];
  if (!t || !me) return 'spectator';
  if (t.guesserId === session.id) return 'guesser';
  return me.team === t.team ? 'cluer' : 'opp';
}

function wordCard(word, small = false) {
  return `<div class="word-card ${small ? 'small' : ''}"><span class="muted">واژه‌ی مخفی</span><b data-key="w-${esc(word)}" class="pop">${esc(word)}</b></div>`;
}

function statusRow(ids, doneFn, doneLabel) {
  return `<ul class="status">${ids.map((p) => `<li class="${doneFn(p) ? 'done' : ''}" data-key="st-${p.id}">${avatarOf(p)}<span>${esc(p.name)}</span>${doneFn(p) ? `<i>${icon.check}</i>` : ''}</li>`).join('')}</ul>`;
}

function clueList(t, mode) {
  // mode: view | strike | guesser | reveal
  const s = session.state;
  const opp = Object.values(s.players).filter((p) => p.team !== t.team && p.online);
  let items = t.list;
  if (mode === 'guesser') items = items.filter((c) => !c.removed);
  if (!items.length) {
    return `<p class="empty-clues">${mode === 'guesser' ? 'همه‌ی سرنخ‌ها حذف شدند! فقط می‌شود حدس شانسی زد.' : 'سرنخی نوشته نشد.'}</p>`;
  }
  return `<ul class="clues">${items.map((c, i) => {
    const mine = c.strikes.includes(session.id);
    const cls = [c.dup ? 'dup' : '', c.removed ? 'removed' : '', mine ? 'mine' : ''].join(' ');
    let tag = '';
    if (mode !== 'guesser') {
      if (c.dup) tag = '<em class="t-dup">تکراری</em>';
      else if (c.removed) tag = '<em class="t-rm">حذف حریف</em>';
      else if (c.strikes.length) tag = `<em class="t-part">${fa(c.strikes.length)} از ${fa(opp.length)}</em>`;
    }
    const by = mode === 'reveal' || mode === 'view' ? `<small>${nameOf(c.pid)}</small>` : '';
    const inner = `<span class="clue-text">${esc(c.text)}</span>${tag}${by}`;
    const clickable = mode === 'strike' && !c.dup && !t.confirms.includes(session.id);
    return `<li class="clue ${cls}" style="--i:${i}" data-key="c-${c.id}">
      ${clickable ? `<button data-act="strike" data-v="${c.id}">${inner}</button>` : `<div>${inner}</div>`}
    </li>`;
  }).join('')}</ul>`;
}

function viewClue(t, r) {
  const s = session.state;
  const team = Object.values(s.players).filter((p) => p.team === t.team && p.id !== t.guesserId && p.online);
  const written = (p) => !!t.clues[p.id];
  if (r === 'guesser') {
    return `<div class="center-block">
      <div class="eyes">🙈</div>
      <h2>تو حدس‌زنی!</h2>
      <p class="muted">چشم‌هایت را ببند. هم‌تیمی‌هایت دارند سرنخ می‌نویسند.</p>
      ${statusRow(team, written)}
    </div>`;
  }
  if (r === 'cluer') {
    const mine = t.clues[session.id];
    const err = ui.clue ? validateClue(ui.clue, t.word) : null;
    const need = Math.floor(team.length / 2) + 1;
    const skipped = t.skips.includes(session.id);
    return `
      <p class="role-line">سرنخ بده به <b>${nameOf(t.guesserId)}</b></p>
      ${wordCard(t.word)}
      ${mine
        ? `<div class="card sent" data-key="sent"><span class="muted">سرنخ تو</span><b>${esc(mine.text)}</b><button class="btn ghost small" data-act="unclue">ویرایش</button></div>`
        : `<form class="clue-form" data-form="clue" data-key="clueform">
            <input id="clue" data-model="clue" maxlength="24" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="سرنخ یک‌کلمه‌ای" value="${esc(ui.clue)}">
            <button class="btn primary" ${!ui.clue || err ? 'disabled' : ''}>ثبت</button>
          </form>
          <p class="field-msg ${err ? 'bad' : ''}">${err ? esc(err) : 'فقط یک کلمه. تکراری‌ها خط می‌خورند، پس خلاق باش!'}</p>`}
      ${statusRow(team, written)}
      <button class="btn ghost small skip ${skipped ? 'on' : ''}" data-act="skip">این واژه را نمی‌شناسم ${t.skips.length ? `(${fa(t.skips.length)} از ${fa(need)})` : ''}</button>`;
  }
  return `
    <p class="role-line">تیم ${TEAM[t.team]} سرنخ می‌نویسد؛ آماده‌ی خط زدن باش</p>
    ${wordCard(t.word)}
    ${statusRow(team, written)}
    <p class="muted center">وقتی همه نوشتند، سرنخ‌ها را می‌بینی و می‌توانی آن‌هایی را که زیادی لو می‌دهند خط بزنی.</p>`;
}

function viewFilter(t, r) {
  const s = session.state;
  const opp = Object.values(s.players).filter((p) => p.team !== t.team && p.online);
  if (r === 'guesser') {
    return `<div class="center-block">
      <div class="eyes">✂️</div>
      <h2>حریف دارد سرنخ‌ها را بررسی می‌کند</h2>
      ${statusRow(opp, (p) => t.confirms.includes(p.id))}
    </div>`;
  }
  if (r === 'opp') {
    const confirmed = t.confirms.includes(session.id);
    return `
      <p class="role-line">سرنخ‌هایی را که زیادی لو می‌دهند <b>خط بزن</b></p>
      ${wordCard(t.word, true)}
      <p class="hint center">سرنخی حذف می‌شود که همه‌ی تیمت خطش بزنند.</p>
      ${clueList(t, 'strike')}
      ${statusRow(opp, (p) => t.confirms.includes(p.id))}
      ${confirmed
        ? `<button class="btn ghost big" data-act="unconfirm">منتظر بقیه… (برگرد و تغییر بده)</button>`
        : `<button class="btn primary big" data-act="confirm">تأیید</button>`}`;
  }
  return `
    <p class="role-line">تیم ${TEAM[1 - t.team]} دارد سرنخ‌ها را خط می‌زند</p>
    ${wordCard(t.word, true)}
    ${clueList(t, 'view')}
    ${statusRow(opp, (p) => t.confirms.includes(p.id))}`;
}

function viewGuess(t, r) {
  if (r === 'guesser') {
    return `
      <p class="role-line">سرنخ‌های تیمت رسید. حدست چیست؟</p>
      ${clueList(t, 'guesser')}
      <form class="clue-form" data-form="guess" data-key="guessform">
        <input id="guess" data-model="guess" maxlength="30" autocomplete="off" spellcheck="false" placeholder="حدس تو" value="${esc(ui.guess)}">
        <button class="btn primary" ${ui.guess.trim() ? '' : 'disabled'}>حدس</button>
      </form>
      <button class="btn ghost" data-act="giveup">نمی‌دانم</button>`;
  }
  return `
    <p class="role-line"><b>${nameOf(t.guesserId)}</b> دارد فکر می‌کند…</p>
    ${wordCard(t.word, true)}
    ${clueList(t, 'view')}`;
}

function viewVote(t) {
  const s = session.state;
  const my = t.votes[session.id];
  const online = Object.values(s.players).filter((p) => p.online);
  return `
    <p class="role-line">این حدس قبول است؟</p>
    <div class="vs">
      <div><span class="muted">حدس</span><b>${esc(t.guess)}</b></div>
      <div><span class="muted">واژه</span><b>${esc(t.word)}</b></div>
    </div>
    <div class="vote-row">
      <button class="btn vote ok ${my === true ? 'on' : ''}" data-act="vote" data-v="1">قبول است</button>
      <button class="btn vote no ${my === false ? 'on' : ''}" data-act="vote" data-v="0">قبول نیست</button>
    </div>
    ${statusRow(online, (p) => p.id in t.votes)}`;
}

function viewReveal(t) {
  const isHost = session.role === 'host';
  const s = session.state;
  const last = s.turnNo + 1 >= s.settings.rounds * 2;
  const map = {
    correct: ['درست بود!', `یک امتیاز برای تیم ${TEAM[t.team]}`, 'win'],
    wrong: ['اشتباه بود', 'امتیازی نگرفتید', 'lose'],
    giveup: ['نمی‌دانست', 'امتیازی نگرفتید', 'lose'],
    timeout: ['وقت تمام شد', 'امتیازی نگرفتید', 'lose'],
  };
  const [title, sub, cls] = map[t.verdict] || map.wrong;
  return `
    <div class="result ${cls}" data-key="res-${t.id}">
      ${cls === 'win' ? '<div class="burst"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ''}
      <h2>${title}</h2>
      <p>${sub}</p>
    </div>
    ${wordCard(t.word)}
    ${t.guess ? `<p class="center">حدس ${nameOf(t.guesserId)}: <b>${esc(t.guess)}</b>${t.voteResult ? ` <span class="muted">(رأی: ${fa(t.voteResult.yes)} موافق، ${fa(t.voteResult.no)} مخالف)</span>` : ''}</p>` : ''}
    ${clueList(t, 'reveal')}
    <div class="bottom">
      ${isHost ? `<button class="btn primary big" data-act="next">${last ? 'دیدن نتیجه‌ی نهایی' : 'نوبت بعدی'}</button>`
        : `<p class="waiting"><span class="dots"><i></i><i></i><i></i></span>منتظر میزبان</p>`}
    </div>`;
}

function viewEnd() {
  const s = session.state;
  const [a, b] = s.scores;
  const winner = a === b ? -1 : a > b ? 0 : 1;
  const isHost = session.role === 'host';
  return `
  <section class="screen end" data-key="end">
    <div class="winner ${winner >= 0 ? `team-${winner}` : ''}">
      <div class="trophy">${winner >= 0 ? '🏆' : '🤝'}</div>
      <h1>${winner >= 0 ? `تیم ${TEAM[winner]} برد!` : 'مساوی!'}</h1>
      <p class="final digits">${fa(a)} <span>—</span> ${fa(b)}</p>
    </div>
    ${s.awards?.length ? `<h3 class="awards-title">جایزه‌ها</h3>
    <ul class="awards">${s.awards.map((w, i) => {
      const p = s.players[w.pid];
      return `<li style="--i:${i}" data-key="aw-${w.key}">${avatarOf(p)}<div><b>${w.title}</b><span>${esc(p?.name || '')}</span><small>${w.desc}${typeof w.value === 'string' ? ` · ${fa(w.value)}` : ''}</small></div></li>`;
    }).join('')}</ul>` : ''}
    <div class="bottom">
      ${isHost ? `<button class="btn primary big" data-act="again">دوباره با همین جمع</button>` : `<p class="waiting">میزبان می‌تواند بازی را دوباره شروع کند</p>`}
      <button class="btn ghost" data-act="leave">خروج</button>
    </div>
  </section>`;
}

function viewGame() {
  const s = session.state;
  const t = s.turn;
  const r = role();
  let body = '';
  let deadlineTotal = 0;
  if (s.phase === 'clue') { body = viewClue(t, r); deadlineTotal = s.settings.clueTime; }
  else if (s.phase === 'filter') body = viewFilter(t, r);
  else if (s.phase === 'guess') { body = viewGuess(t, r); deadlineTotal = s.settings.guessTime; }
  else if (s.phase === 'vote') { body = viewVote(t); deadlineTotal = s.settings.voteTime; }
  else if (s.phase === 'reveal') body = viewReveal(t);
  return `
  <section class="screen game team-turn-${t.team}" data-key="game">
    <div class="topbar">
      <button class="icon-btn" data-act="leave" aria-label="خروج">${icon.back}</button>
      ${scoreboard()}
    </div>
    ${timer(t.deadline, deadlineTotal)}
    <div class="phase" data-key="ph-${t.id}-${s.phase}-${t.skipped || 0}">${body}</div>
  </section>`;
}

function view() {
  const s = session.state;
  let main;
  if (session.status === 'kicked') {
    main = `<section class="screen center-block" data-key="kicked"><div class="eyes">👋</div><h2>میزبان تو را از اتاق بیرون کرد</h2><button class="btn primary" data-act="home">باشه</button></section>`;
  } else if (!s || session.status === 'idle' || session.status === 'connecting' && !s) {
    main = viewHome();
  } else if (s.phase === 'lobby') main = viewLobby();
  else if (s.phase === 'end') main = viewEnd();
  else main = viewGame();
  const banner = session.role === 'guest' && session.hostLost && session.status === 'ready'
    ? `<div class="banner" data-key="lost">ارتباط با میزبان قطع شده؛ منتظر برگشتش هستیم…</div>` : '';
  return `${banner}${main}${ui.rules ? viewRules() : ''}${ui.toast ? `<div class="toast" data-key="toast-${esc(ui.toast)}">${esc(ui.toast)}</div>` : ''}`;
}

function render() {
  const s = session.state;
  const key = s ? `${s.phase}-${s.turn?.id || ''}` : 'none';
  if (key !== lastPhaseKey) {
    if (s?.turn && lastPhaseKey) buzz(s.phase === 'reveal' ? [30, 40, 30] : 25);
    if (s?.phase === 'clue') ui.clue = '';
    if (s?.phase === 'guess') ui.guess = '';
    lastPhaseKey = key;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  morph(app, view());
}

function toast(msg) {
  ui.toast = msg;
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast = ''; render(); }, 2200);
}

// ---------- کنش‌ها ----------
function profile() { return { name: ui.name.trim() || 'بی‌نام', avatar: ui.avatar }; }

async function doCreate(resume) {
  if (!ui.name.trim()) { ui.error = 'اول اسمت را بنویس'; render(); document.getElementById('name')?.focus(); return; }
  ui.busy = true; ui.error = ''; render();
  try { await session.host(profile(), resume); }
  catch (e) { console.error(e); session.leave(); ui.error = 'اتصال به سرور برقرار نشد. اینترنت را بررسی کن.'; }
  ui.busy = false; render();
}

async function doJoin(code) {
  if (!ui.name.trim()) { ui.error = 'اول اسمت را بنویس'; render(); document.getElementById('name')?.focus(); return; }
  ui.busy = true; ui.error = ''; render();
  try { await session.join(code, profile()); }
  catch (e) { console.error(e); session.leave(); ui.error = e.message === 'not-found' ? 'اتاقی با این کد پیدا نشد' : 'اتصال به سرور برقرار نشد. اینترنت را بررسی کن.'; }
  ui.busy = false; render();
}

const actions = {
  avatar: (v) => { ui.avatar = v; lsSet('radpa.avatar', v); },
  create: () => doCreate(),
  join: () => doJoin(ui.code),
  resume: () => {
    const sv = savedSession();
    if (!sv) return;
    if (sv.role === 'host') doCreate(hostResumeData());
    else doJoin(sv.code);
  },
  rules: () => { ui.rules = true; },
  'rules-close': () => { ui.rules = false; },
  leave: () => {
    if (session.state && session.state.phase !== 'lobby' && session.state.phase !== 'end' && !confirmLeave()) return;
    session.leave(); session.state = null; session.role = null;
  },
  home: () => { session.status = 'idle'; session.state = null; },
  share: async () => {
    const code = session.state.code;
    const url = `${WEB_URL}?room=${code}`;
    const text = `بیا ردپا بازی کنیم! کد اتاق: ${fa(code)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'ردپا', text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('لینک دعوت کپی شد'); }
    } catch {}
  },
  shuffle: () => session.hostDo((g) => g.shuffleTeams()),
  move: (v) => session.hostDo((g) => g.movePlayer(v)),
  kick: (v) => session.hostDo((g) => g.kick(v)),
  set: (v, el) => session.hostDo((g) => g.updateSettings({ [el.dataset.k]: Number(v) })),
  cat: (v) => session.hostDo((g) => {
    if (v === '*') return g.updateSettings({ categories: [] });
    const cur = new Set(g.s.settings.categories);
    cur.has(v) ? cur.delete(v) : cur.add(v);
    if (cur.size === Object.keys(CATEGORIES).length) cur.clear();
    g.updateSettings({ categories: [...cur] });
  }),
  start: () => session.hostDo((g) => g.start()),
  unclue: () => { ui.clue = session.state.turn.clues[session.id]?.text || ''; session.act({ type: 'unclue' }); },
  skip: () => session.act({ type: 'skip' }),
  strike: (v) => { buzz(10); session.act({ type: 'strike', id: v }); },
  confirm: () => session.act({ type: 'confirm' }),
  unconfirm: () => session.act({ type: 'unconfirm' }),
  giveup: () => session.act({ type: 'giveup' }),
  vote: (v) => session.act({ type: 'vote', ok: v === '1' }),
  next: () => session.hostDo((g) => g.next()),
  again: () => session.hostDo((g) => g.backToLobby()),
};

let leaveArmed = 0;
function confirmLeave() {
  if (Date.now() - leaveArmed < 3000) return true;
  leaveArmed = Date.now();
  toast(session.role === 'host' ? 'با خروج میزبان بازی تمام می‌شود. دوباره بزن تا خارج شوی.' : 'برای خروج دوباره بزن');
  return false;
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  e.preventDefault();
  const fn = actions[el.dataset.act];
  if (fn) { Promise.resolve(fn(el.dataset.v, el)).then(() => render()); render(); }
});

app.addEventListener('input', (e) => {
  const el = e.target;
  const m = el.dataset.model;
  if (!m) return;
  if (m === 'code') {
    const v = toLatinDigits(el.value).replace(/\D/g, '').slice(0, 4);
    ui.code = v;
    el.value = fa(v);
    if (v.length === 4) el.blur();
  } else {
    ui[m] = el.value;
    if (m === 'name') lsSet('radpa.name', el.value.trim());
  }
  ui.error = '';
  render();
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'clue') {
    const t = session.state.turn;
    if (!ui.clue || validateClue(ui.clue, t.word)) return;
    session.act({ type: 'clue', text: ui.clue });
    ui.clue = '';
    buzz(15);
  } else if (f === 'guess') {
    if (!ui.guess.trim()) return;
    session.act({ type: 'guess', text: ui.guess });
    ui.guess = '';
  }
  document.activeElement?.blur();
  render();
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'code' && ui.code.length === 4) doJoin(ui.code);
});

// شمارش معکوس بدون رندر کامل
setInterval(() => {
  for (const el of document.querySelectorAll('[data-deadline]')) {
    const left = Number(el.dataset.deadline) - session.serverNow();
    const total = Number(el.dataset.total) || 1;
    const sec = Math.max(0, Math.ceil(left / 1000));
    const num = el.querySelector('.timer-num');
    const txt = fa(sec);
    if (num.textContent !== txt) {
      num.textContent = txt;
      if (sec <= 5 && sec > 0) buzz(8);
    }
    el.classList.toggle('urgent', sec <= 10);
    el.querySelector('.timer-bar span').style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
  }
}, 200);

render();
