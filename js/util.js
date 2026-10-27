/* Ciak — utility condivise */
(function () {
  'use strict';

  const U = {};

  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // h('div', { class: 'x', onclick: fn, dataset: { id: 1 } }, 'testo', figlio, [altri])
  U.h = function (tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return el;
  };

  // come Element.append, ma ignora null/false (utile per figli condizionali)
  U.append = function (el, ...children) {
    children.flat(Infinity).forEach((c) => {
      if (c != null && c !== false) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  };

  U.debounce = function (fn, ms) {
    let t = null;
    const d = function (...args) {
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(this, args); }, ms);
    };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    d.cancel = function () { clearTimeout(t); t = null; };
    d.pending = () => t !== null;
    return d;
  };

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  U.isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  U.isTouch = () => window.matchMedia('(pointer: coarse)').matches;
  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  U.fmtDate = function (ts) {
    try {
      return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
    }
  };

  U.today = () => new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  U.slug = (s) => (s || 'copione').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'copione';

  let toastTimer = null;
  // U.toast('Testo') oppure U.toast('Testo', { action: 'Annulla', onAction: fn })
  U.toast = function (msg, opts) {
    const o = typeof opts === 'number' ? { ms: opts } : (opts || {});
    let t = document.getElementById('toast');
    if (!t) {
      t = U.h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(t);
    }
    t.textContent = '';
    t.appendChild(U.h('span', null, msg));
    t.classList.toggle('has-action', !!o.action);
    if (o.action) {
      t.appendChild(U.h('button', {
        class: 'toast-btn', type: 'button',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { t.classList.remove('show'); clearTimeout(toastTimer); o.onAction(); }
      }, o.action));
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), o.ms || (o.action ? 6000 : 2600));
  };

  // Salva un file: su telefono apre il foglio di condivisione (→ "Salva su File" / iCloud Drive),
  // sul computer scarica direttamente.
  U.saveFile = async function (name, content, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
    if (U.isTouch() && navigator.canShare) {
      try {
        const file = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return true;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = U.h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return true;
  };

  U.pickFile = function (accept) {
    return new Promise((resolve) => {
      const input = U.h('input', { type: 'file', accept, style: { display: 'none' } });
      input.addEventListener('change', () => {
        resolve(input.files && input.files[0] ? input.files[0] : null);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });
  };

  U.readFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

  // Icone SVG in linea (stile Lucide, tratto 2px)
  const ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
    title: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M10 16h4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    layout: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M6.5 10v4a2 2 0 0 0 2 2H14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    minus: '<path d="M5 12h14"/>',
    import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14M17 20l4-4-4-4"/><path d="M21 16H7"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    select: '<path d="M5 4h2M11 4h2M17 4h2M5 20h2M11 20h2M17 20h2M4 9v2M4 15v1M20 9v2M20 15v1"/><path d="M9 9h6M9 12h6M9 15h4"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'
  };
  U.icon = function (name, size = 18) {
    const span = document.createElement('span');
    span.className = 'ic';
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return span;
  };

  window.Ciak = window.Ciak || {};
  window.Ciak.U = U;
})();
