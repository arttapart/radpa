// دیف کوچک DOM: فقط تغییرات را اعمال می‌کند تا انیمیشن‌ها و ورودی‌ها پایدار بمانند.
const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

export function morph(root, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(root, tpl.content);
}

function patchChildren(a, b) {
  const keyed = new Map();
  for (const n of a.childNodes) { const k = keyOf(n); if (k) keyed.set(k, n); }
  const incoming = [...b.childNodes];
  let i = 0;
  for (const nb of incoming) {
    const cur = a.childNodes[i] || null;
    const k = keyOf(nb);
    let match = null;
    if (k) {
      const m = keyed.get(k);
      if (m && m.nodeName === nb.nodeName) { match = m; keyed.delete(k); }
    } else if (cur && !keyOf(cur) && cur.nodeType === nb.nodeType && cur.nodeName === nb.nodeName) {
      match = cur;
    }
    if (match) {
      if (match !== cur) a.insertBefore(match, cur);
      patchNode(match, nb);
    } else {
      a.insertBefore(nb, cur);
    }
    i++;
  }
  while (a.childNodes.length > i) a.removeChild(a.lastChild);
}

function patchNode(x, y) {
  if (x.nodeType === 3 || x.nodeType === 8) {
    if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
    return;
  }
  for (const { name } of [...x.attributes]) if (!y.hasAttribute(name)) x.removeAttribute(name);
  for (const { name, value } of [...y.attributes]) if (x.getAttribute(name) !== value) x.setAttribute(name, value);
  if (x.tagName === 'INPUT') {
    if (x.type === 'checkbox') x.checked = y.hasAttribute('checked');
    else if (document.activeElement !== x) { const v = y.getAttribute('value') || ''; if (x.value !== v) x.value = v; }
    return;
  }
  if (x.tagName === 'CANVAS' || x.hasAttribute('data-static')) return;
  patchChildren(x, y);
}
