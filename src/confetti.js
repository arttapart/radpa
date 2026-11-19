// کاغذرنگی سبک روی بوم
export function confetti({ count = 120, colors } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const css = getComputedStyle(document.documentElement);
  const cols = colors || ['--a', '--b', '--ok', '--c1', '--c3'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    c: cols[Math.floor(Math.random() * cols.length)],
  }));
  const start = performance.now();
  (function frame(t) {
    const el = t - start;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.globalAlpha = Math.max(0, 1 - el / 2600);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      g.restore();
    }
    if (el < 2600) requestAnimationFrame(frame); else cv.remove();
  })(start);
}
