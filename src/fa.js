// ابزارهای متن فارسی: یکسان‌سازی، ریشه‌یابی ساده و سنجش شباهت

const CHAR_MAP = {
  'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه',
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ؤ': 'و',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** یکسان‌سازی کامل برای مقایسه: حروف عربی، اعراب، نیم‌فاصله، فاصله، کشیده */
export function normalize(s) {
  if (!s) return '';
  let out = '';
  for (const ch of String(s).toLowerCase()) {
    const code = ch.charCodeAt(0);
    if (code >= 0x064b && code <= 0x065f) continue; // اعراب
    if (code === 0x0670 || ch === 'ـ') continue;
    if (ch === '‌' || ch === '‍' || ch === '‏' || ch === '‎') continue;
    if (/\s/.test(ch)) continue;
    if (/[.,،؛;:!?؟"'«»()\-_]/.test(ch)) continue;
    out += CHAR_MAP[ch] || ch;
  }
  return out;
}

/** تمیزکاری نمایشی: فاصله‌های اضافه و حروف عربی */
export function clean(s) {
  return String(s || '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ').trim();
}

const SUFFIXES = ['هایی', 'های', 'ها', 'ترین', 'تر', 'ان', 'ات', 'ای', 'ی'];

/** ریشه‌یابی ساده: حذف پسوندهای جمع و رایج */
export function stem(n) {
  let w = n;
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 2) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** آیا متن تنها یک کلمه است؟ (نیم‌فاصله مجاز است) */
export function isSingleWord(text) {
  const t = clean(text);
  if (!t) return false;
  if (/\s/.test(t)) return false;
  return normalize(t).length > 0;
}

/** دو سرنخ تقریباً یکسان‌اند؟ */
export function nearSame(a, b) {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const sx = stem(x), sy = stem(y);
  if (sx === sy) return true;
  const len = Math.min(x.length, y.length);
  if (len >= 4 && levenshtein(x, y) <= 1) return true;
  return false;
}

/** سرنخ همان واژه‌ی مخفی یا شکلی از آن است؟ */
export function isVariantOf(clue, secret) {
  const c = normalize(clue), s = normalize(secret);
  if (!c || !s) return false;
  if (c === s) return true;
  if (stem(c) === stem(s)) return true;
  if (s.length >= 3 && c.includes(s)) return true;
  if (c.length >= 3 && s.includes(c)) return true;
  if (Math.min(c.length, s.length) >= 4 && levenshtein(c, s) <= 1) return true;
  return false;
}

/** بررسی سرنخ؛ خروجی: پیام خطا یا null */
export function validateClue(text, secret) {
  const t = clean(text);
  if (!t) return 'سرنخ خالی است';
  if (!isSingleWord(t)) return 'فقط یک کلمه بنویس، بدون فاصله';
  if (t.length > 24) return 'سرنخ خیلی بلند است';
  if (isVariantOf(t, secret)) return 'نمی‌شود خود واژه یا شکلی از آن را نوشت';
  return null;
}

/** داوری حدس: exact | maybe | wrong */
export function judgeGuess(guess, secret) {
  const g = normalize(guess), s = normalize(secret);
  if (!g) return 'wrong';
  if (g === s) return 'exact';
  if (stem(g) === stem(s)) return 'maybe';
  const len = Math.max(g.length, s.length);
  const allowed = len <= 3 ? 1 : Math.max(1, Math.floor(len / 4));
  if (levenshtein(g, s) <= allowed) return 'maybe';
  if (Math.min(g.length, s.length) >= 3 && (g.includes(s) || s.includes(g))) return 'maybe';
  return 'wrong';
}
