// بانک واژه: از سرور خوانده می‌شود تا بدون نصب دوباره قابل تغییر باشد.
import { nearSame, normalize } from './fa.js';

const REPO = 'arttapart/radpa';
const PATH = 'public/words.txt';
const SOURCES = [
  () => `https://raw.githubusercontent.com/${REPO}/main/${PATH}?t=${Date.now()}`,
  () => `https://cdn.jsdelivr.net/gh/${REPO}@main/${PATH}`,
  () => `https://arttapart.github.io/radpa/words.txt?t=${Date.now()}`,
];
const LS_KEY = 'radpa.words';

/** فرمت فایل: هر خط یک واژه، اختیاری «واژه: سرنخ، سرنخ»، خطوط # = گروه */
export function parseWords(text) {
  const out = [];
  const seen = new Set();
  let group = 'g0';
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) { group = line.slice(1).trim() || group; continue; }
    const [w, rest] = line.split(/[:：]/);
    const word = (w || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').trim();
    const key = normalize(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const clues = (rest || '').split(/[،,]/).map((c) => c.trim()).filter((c) => c && !/\s/.test(c));
    out.push({ w: word, g: group, c: clues });
  }
  return out;
}

async function fetchText(url, ms = 5000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return await r.text();
  } finally { clearTimeout(t); }
}

/** آخرین فهرست را از سرور می‌گیرد؛ اگر نشد، نسخه‌ی ذخیره‌شده یا همراه برنامه */
export async function loadWords() {
  for (const src of SOURCES) {
    try {
      const txt = await fetchText(src());
      const list = parseWords(txt);
      if (list.length >= 30) {
        try { localStorage.setItem(LS_KEY, txt); } catch {}
        return { list, from: 'server' };
      }
    } catch {}
  }
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) return { list: parseWords(cached), from: 'cache' };
  } catch {}
  const txt = await fetchText('./words.txt');
  return { list: parseWords(txt), from: 'bundled' };
}

/** سه واژه‌ی متنوع: از سه گروه متفاوت، بدون شباهت ظاهری، ترجیحاً با حرف اول متفاوت */
export function pickThree(list, used = [], needClues = false) {
  const usedSet = new Set(used);
  let pool = list.filter((x) => !usedSet.has(x.w) && (!needClues || x.c.length >= 2));
  if (pool.length < 3) pool = list.filter((x) => !needClues || x.c.length >= 2);
  if (pool.length < 3) pool = list;
  const chosen = [];
  for (let attempt = 0; attempt < 400 && chosen.length < 3; attempt++) {
    const cand = pool[Math.floor(Math.random() * pool.length)];
    const strict = attempt < 250;
    if (chosen.some((c) => c.w === cand.w)) continue;
    if (strict && chosen.some((c) => c.g === cand.g)) continue;
    if (strict && chosen.some((c) => c.w[0] === cand.w[0])) continue;
    if (chosen.some((c) => nearSame(c.w, cand.w))) continue;
    chosen.push(cand);
  }
  return chosen;
}
