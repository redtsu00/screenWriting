/* Ciak — editor del copione */
(function () {
  'use strict';
  const { U, Store, Formats } = window.Ciak;
  const { h } = U;

  const TYPES = [
    { id: 'scene', label: 'Scena', en: 'Scene Heading', hint: 'INT. LUOGO - GIORNO' },
    { id: 'action', label: 'Azione', en: 'Action', hint: 'Descrivi cosa vediamo…' },
    { id: 'character', label: 'Personaggio', en: 'Character', hint: 'NOME' },
    { id: 'parenthetical', label: 'Parentetica', en: 'Parenthetical', hint: '(come lo dice)' },
    { id: 'dialogue', label: 'Dialogo', en: 'Dialogue', hint: 'Battuta…' },
    { id: 'transition', label: 'Transizione', en: 'Transition', hint: 'CUT TO:' },
    { id: 'shot', label: 'Inquadratura', en: 'Shot', hint: 'POV DI…', extra: true },
    { id: 'subheader', label: 'Sotto-scena', en: 'Subheader', hint: 'CORRIDOIO', extra: true },
    { id: 'intercut', label: 'Intercut', en: 'Intercut', hint: 'INTERCUT CONVERSAZIONE TELEFONICA', extra: true }
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const UPPER = new Set(['scene', 'character', 'transition', 'shot', 'subheader', 'intercut']);

  // Cosa succede premendo Invio / Tab in base all'elemento corrente
  const NEXT_ON_ENTER = { scene: 'action', action: 'action', character: 'dialogue', parenthetical: 'dialogue', dialogue: 'action', transition: 'scene', shot: 'action', subheader: 'action', intercut: 'action' };
  const EMPTY_ENTER = { scene: 'action', action: 'character', character: 'action', parenthetical: 'dialogue', dialogue: 'action', transition: 'scene', shot: 'action', subheader: 'action', intercut: 'action' };
  const TAB_NEXT = { scene: 'action', action: 'character', character: 'transition', transition: 'scene', dialogue: 'parenthetical', parenthetical: 'dialogue', shot: 'action', subheader: 'action', intercut: 'action' };
  const TAB_PREV = { scene: 'transition', action: 'scene', character: 'action', transition: 'character', dialogue: 'character', parenthetical: 'dialogue', shot: 'action', subheader: 'action', intercut: 'action' };

  const SCENE_PREFIXES = ['INT. ', 'EST. ', 'EXT. ', 'INT./EST. ', 'INT./EXT. '];
  const PREFIX_RE = /^(INT\.?\s*\/\s*E[XS]T\.?|INT\.|EXT\.|EST\.|I\/E\.?|INT\s|EXT\s|EST\s)\s*/;
  const TIMES = ['GIORNO', 'NOTTE', 'MATTINA', 'POMERIGGIO', 'SERA', 'ALBA', 'TRAMONTO', 'CONTINUO', 'PIÙ TARDI', 'DAY', 'NIGHT', 'MORNING', 'EVENING', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'];
  const TRANSITIONS = ['CUT TO:', 'STACCO SU:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'DISSOLVE TO:', 'DISSOLVENZA SU:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:'];
  const SHOTS = ['POV DI ', 'PRIMO PIANO SU ', 'DETTAGLIO DI ', 'CAMPO LUNGO', 'CLOSE ON ', 'ANGLE ON ', 'INSERT - ', 'WIDE SHOT', 'BACK TO SCENE', 'AL RALLENTATORE'];
  const INTERCUTS = ['INTERCUT CONVERSAZIONE TELEFONICA', 'INTERCUT - ', 'FINE INTERCUT', 'INTERCUT PHONE CONVERSATION', 'END INTERCUT'];
  const EXTENSIONS = ['V.O.', 'O.S.', 'O.C.', "CONT'D"];
  const EXT_GROUP = ['V.O.', 'O.S.', 'O.C.'];

  const CE_MODE = (() => {
    const d = document.createElement('div');
    try { d.contentEditable = 'plaintext-only'; } catch (e) { return 'true'; }
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  let page, paper, elbar, typeTag, acBox, extBox, mSuggest, hintEl, statsEl, sidebar, sceneList, charList;
  let curId = null;
  let renderedFor = null;
  const ac = { items: [], index: -1, forId: null, dismissed: null };

  const blocks = () => Store.project.blocks;
  const idx = (id) => blocks().findIndex((b) => b.id === id);
  const get = (id) => blocks().find((b) => b.id === id);
  const elOf = (id) => page.querySelector(`.el[data-id="${id}"]`);
  const txOf = (id) => { const e = elOf(id); return e ? e.firstChild : null; };
  const cur = () => (curId ? get(curId) : null);
  const stripExt = (name) => name.toUpperCase().replace(/\s*\(.*$/, '').replace(/\^$/, '').trim();

  /* ---------- DOM dei blocchi ---------- */

  function makeEl(b) {
    const tx = h('div', { class: 'tx', spellcheck: 'true' });
    tx.contentEditable = CE_MODE;
    tx.textContent = b.text;
    const el = h('div', { class: 'el', dataset: { id: b.id } }, tx);
    applyType(el, b);
    return el;
  }

  function applyType(el, b) {
    el.className = 'el el-' + b.type + (b.text ? '' : ' is-empty') + (b.id === curId ? ' focused' : '');
    const tx = el.firstChild;
    tx.dataset.ph = TYPE[b.type].hint;
    const upper = UPPER.has(b.type);
    tx.setAttribute('autocapitalize', upper ? 'characters' : 'sentences');
    tx.setAttribute('autocorrect', upper ? 'off' : 'on');
    tx.setAttribute('aria-label', TYPE[b.type].label);
  }

  function render() {
    if (!page) return;
    page.textContent = '';
    const frag = document.createDocumentFragment();
    for (const b of blocks()) frag.appendChild(makeEl(b));
    page.appendChild(frag);
    renderedFor = Store.project.id;
    if (!get(curId)) curId = null;
    renumber();
    refreshSide();
    updateStats();
    onFocusChange();
  }

  function renumber() {
    let n = 0;
    for (const el of page.children) {
      if (el.classList.contains('el-scene')) el.dataset.num = ++n;
      else if (el.dataset.num) delete el.dataset.num;
    }
    page.classList.toggle('show-numbers', !!Store.project.settings.sceneNumbers);
  }

  function setText(b, text) {
    b.text = text;
    const el = elOf(b.id);
    if (el) {
      if (el.firstChild.textContent !== text) el.firstChild.textContent = text;
      el.classList.toggle('is-empty', !text);
    }
  }

  function insertAt(index, type, text) {
    const b = { id: U.uid(), type, text: text || '' };
    const ref = page.children[index] || null;
    blocks().splice(index, 0, b);
    page.insertBefore(makeEl(b), ref);
    return b;
  }

  function removeBlock(id) {
    const i = idx(id);
    if (i < 0) return;
    blocks().splice(i, 1);
    const el = elOf(id);
    if (el) el.remove();
  }

  /* ---------- cursore ---------- */

  function getOffsets(tx) {
    const sel = window.getSelection();
    const len = tx.textContent.length;
    if (!sel.rangeCount || !tx.contains(sel.anchorNode)) return { start: len, end: len };
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(tx);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    pre.setEnd(r.endContainer, r.endOffset);
    return { start, end: pre.toString().length };
  }

  function setCaret(tx, offset) {
    if (document.activeElement !== tx) tx.focus({ preventScroll: true });
    const range = document.createRange();
    const walker = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
    let node, rem = Math.max(0, offset), placed = false;
    while ((node = walker.nextNode())) {
      if (rem <= node.length) { range.setStart(node, rem); placed = true; break; }
      rem -= node.length;
    }
    if (!placed) range.setStart(tx, tx.childNodes.length);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function offsetFromPoint(tx, x, y) {
    let node = null, off = 0;
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; off = r.startOffset; }
    } else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; off = p.offset; }
    }
    if (!node || !tx.contains(node)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(tx);
    pre.setEnd(node, off);
    return pre.toString().length;
  }

  function caretRect() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    const rects = r.getClientRects();
    if (rects.length) return rects[0];
    const br = r.getBoundingClientRect();
    return br && (br.top || br.height) ? br : null;
  }

  function lineInfo(tx) {
    if (!tx.textContent) return { first: true, last: true, rect: null };
    const rect = caretRect();
    const o = getOffsets(tx);
    if (!rect) return { first: o.start === 0, last: o.start === tx.textContent.length, rect: null };
    const er = tx.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(tx).lineHeight) || 20;
    return { first: rect.top - er.top < lh * 0.7, last: er.bottom - rect.bottom < lh * 0.7, rect };
  }

  function insets() {
    const header = document.querySelector('.app-header');
    const top = (header ? header.offsetHeight : 0) + (U.isMobile() ? 0 : elbar.offsetHeight);
    const vv = window.visualViewport;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const status = document.getElementById('statusbar');
    const bottomBar = U.isMobile() ? elbar.offsetHeight : (status ? status.offsetHeight : 0);
    return { top, bottom: viewBottom - bottomBar };
  }

  function ensureVisible(el, center) {
    const r = el.getBoundingClientRect();
    const { top, bottom } = insets();
    if (center) {
      window.scrollBy({ top: r.top - top - (bottom - top) * 0.25 });
      return;
    }
    if (r.bottom > bottom - 12) window.scrollBy({ top: r.bottom - bottom + 40 });
    else if (r.top < top + 8) window.scrollBy({ top: r.top - top - 40 });
  }

  function focusBlock(id, offset = 'end', opts = {}) {
    const el = elOf(id);
    if (!el) return;
    const tx = el.firstChild;
    const off = offset === 'end' ? tx.textContent.length : offset === 'start' ? 0 : offset;
    setCaret(tx, off);
    curId = id;
    ensureVisible(el, opts.center);
    onFocusChange();
  }

  /* ---------- cronologia (annulla / ripeti) ---------- */

  let hist = [], hi = -1;
  function snapshot() {
    let off = 0;
    const tx = curId && txOf(curId);
    if (tx && document.activeElement === tx) off = getOffsets(tx).start;
    else if (tx) off = tx.textContent.length;
    return { data: JSON.stringify(blocks()), focus: curId, off };
  }
  function resetHistory() { hist = [snapshot()]; hi = 0; updateUndoButtons(); }
  function commitHistory() {
    scheduleHistory.cancel();
    if (!Store.project) return;
    const s = snapshot();
    if (hist[hi] && hist[hi].data === s.data) { hist[hi].focus = s.focus; hist[hi].off = s.off; return; }
    hist = hist.slice(0, hi + 1);
    hist.push(s);
    if (hist.length > 300) hist.shift();
    hi = hist.length - 1;
    updateUndoButtons();
  }
  const scheduleHistory = U.debounce(commitHistory, 700);
  function restore(s) {
    Store.project.blocks = JSON.parse(s.data);
    curId = s.focus;
    render();
    const b = s.focus && get(s.focus);
    if (b) focusBlock(b.id, Math.min(s.off, b.text.length));
    Store.touch();
    updateUndoButtons();
  }
  function undo() {
    commitHistory();
    if (hi <= 0) return;
    hi--;
    restore(hist[hi]);
  }
  function redo() {
    commitHistory();
    if (hi >= hist.length - 1) return;
    hi++;
    restore(hist[hi]);
  }
  function updateUndoButtons() {
    U.$$('[data-act="undo"]').forEach((b) => { b.disabled = hi <= 0 && !scheduleHistory.pending(); });
    U.$$('[data-act="redo"]').forEach((b) => { b.disabled = hi >= hist.length - 1; });
  }

  function changed(structure) {
    Store.touch();
    if (structure) commitHistory();
    else { scheduleHistory(); updateUndoButtons(); }
    refreshSideSoon();
    updateStatsSoon();
  }

  /* ---------- operazioni ---------- */

  function setType(id, type) {
    const b = get(id);
    if (!b || !TYPE[type]) return;
    const el = elOf(id);
    const tx = el.firstChild;
    const focused = document.activeElement === tx;
    if (b.type === type) { if (!focused) focusBlock(id); return; }
    commitHistory();
    let start = focused ? getOffsets(tx).start : b.text.length;
    const old = b.type;
    let t = b.text;
    if (old === 'parenthetical') {
      if (t.startsWith('(')) { t = t.slice(1); start = Math.max(0, start - 1); }
      t = t.replace(/\)\s*$/, '');
    }
    if (type === 'parenthetical') {
      if (!t.startsWith('(')) { t = '(' + t; start++; }
      if (!t.endsWith(')') || t === '(') t += ')';
      start = Math.min(start, t.length - 1);
    }
    b.type = type;
    setText(b, t);
    applyType(el, b);
    if (old === 'scene' || type === 'scene') renumber();
    setCaret(tx, Math.min(start, t.length));
    curId = id;
    onFocusChange();
    changed(true);
  }

  function handleEnter(tx) {
    const el = tx.parentNode;
    const b = get(el.dataset.id);
    if (!b) return;
    const i = idx(b.id);
    commitHistory();
    const text = tx.textContent;
    if (!text.trim()) { setType(b.id, EMPTY_ENTER[b.type]); return; }
    const { start, end } = getOffsets(tx);
    if (start === 0 && end === 0) {
      insertAt(i, 'action', '');
      focusBlock(b.id, 0);
      changed(true);
      return;
    }
    let before = text.slice(0, start).replace(/\s+$/, '');
    let after = text.slice(end).replace(/^\s+/, '');
    if (b.type === 'parenthetical') {
      if (after.trim() === ')') after = '';
      if (before && !before.startsWith('(')) before = '(' + before;
      if (before && !before.endsWith(')')) before += ')';
    }
    if (b.type === 'action' && !after && /^[A-ZÀ-Ý0-9 .'’-]+ (TO|SU):$/.test(before.trim())) {
      b.type = 'transition';
      applyType(el, b);
    }
    setText(b, before);
    const nt = after ? b.type : NEXT_ON_ENTER[b.type];
    const nb = insertAt(i + 1, nt, after);
    if (b.type === 'scene' || nt === 'scene') renumber();
    focusBlock(nb.id, 'start');
    changed(true);
  }

  function mergeBackward(tx) {
    const b = get(tx.parentNode.dataset.id);
    const i = idx(b.id);
    if (i <= 0) { if (!b.text && b.type !== 'action') setType(b.id, 'action'); return; }
    commitHistory();
    const prev = blocks()[i - 1];
    if (!b.text) { removeBlock(b.id); focusBlock(prev.id, 'end'); }
    else if (!prev.text) { removeBlock(prev.id); focusBlock(b.id, 0); }
    else {
      const len = prev.text.length;
      setText(prev, prev.text + b.text);
      removeBlock(b.id);
      focusBlock(prev.id, len);
    }
    renumber();
    changed(true);
  }

  function mergeForward(tx) {
    const b = get(tx.parentNode.dataset.id);
    const i = idx(b.id);
    const next = blocks()[i + 1];
    if (!next) return;
    commitHistory();
    const len = b.text.length;
    if (next.text) setText(b, b.text + next.text);
    removeBlock(next.id);
    focusBlock(b.id, len);
    renumber();
    changed(true);
  }

  function moveVert(dir, tx, rect) {
    const i = idx(tx.parentNode.dataset.id) + dir;
    const target = blocks()[i];
    if (!target) return false;
    const tel = elOf(target.id);
    ensureVisible(tel);
    let off = null;
    if (rect) {
      const ttx = tel.firstChild;
      const tr = ttx.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(ttx).lineHeight) || 20;
      const y = dir < 0 ? tr.bottom - lh / 2 : tr.top + lh / 2;
      const x = U.clamp(rect.left, tr.left + 1, tr.right - 1);
      off = offsetFromPoint(ttx, x, y);
    }
    focusBlock(target.id, off == null ? (dir < 0 ? 'end' : 'start') : off);
    return true;
  }

  function toggleExtension(ext) {
    const b = cur();
    if (!b || b.type !== 'character') return;
    commitHistory();
    const tag = '(' + ext + ')';
    let t = b.text.trim();
    const has = t.toUpperCase().includes(tag);
    const strip = (s, x) => s.replace(new RegExp('\\s*\\(' + x.replace(/[.']/g, (c) => '\\' + c) + '\\)', 'i'), '');
    if (has) t = strip(t, ext);
    else {
      if (EXT_GROUP.includes(ext)) EXT_GROUP.forEach((x) => { t = strip(t, x); });
      if (ext === "CONT'D") t = t + ' ' + tag;
      else {
        const m = t.match(/\s*\(CONT'D\)/i);
        t = m ? t.replace(m[0], '') + ' ' + tag + ' (CONT\'D)' : t + ' ' + tag;
      }
    }
    setText(b, t.trim());
    focusBlock(b.id, 'end');
    changed(true);
  }

  // Applica un tipo all'elemento attivo (barra elementi)
  function applyTypeToCurrent(type) {
    let b = cur();
    if (!b) {
      const last = blocks()[blocks().length - 1];
      b = last && !last.text ? last : insertAt(blocks().length, type, '');
      curId = b.id;
    }
    setType(b.id, type);
    focusBlock(b.id, document.activeElement === txOf(b.id) ? getOffsets(txOf(b.id)).start : 'end');
  }

  /* ---------- suggerimenti (autocompletamento) ---------- */

  function characterNames() {
    const counts = new Map();
    for (const b of blocks()) {
      if (b.type !== 'character') continue;
      const n = stripExt(b.text);
      if (n) counts.set(n, (counts.get(n) || 0) + 1);
    }
    for (const c of Store.project.cards) {
      if (c.type !== 'character') continue;
      const n = stripExt(c.title || '');
      if (n && !counts.has(n)) counts.set(n, 0);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function sceneParts() {
    const locs = new Map(), times = new Map();
    for (const b of blocks()) {
      if (b.type !== 'scene' || b.id === curId) continue;
      const up = b.text.toUpperCase().trim();
      const m = up.match(PREFIX_RE);
      if (!m) continue;
      const rest = up.slice(m[0].length);
      const d = rest.lastIndexOf(' - ');
      const loc = (d >= 0 ? rest.slice(0, d) : rest).trim();
      if (loc) locs.set(loc, (locs.get(loc) || 0) + 1);
      if (d >= 0) { const t = rest.slice(d + 3).trim(); if (t) times.set(t, (times.get(t) || 0) + 1); }
    }
    const sort = (m) => Array.from(m).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return { locs: sort(locs), times: sort(times) };
  }

  function computeSuggestions(b) {
    const up = b.text.toUpperCase();
    const pick = (list, q, map) => list.filter((x) => x.trim().startsWith(q) && x.trim() !== q.trim()).slice(0, 6).map(map || ((x) => ({ label: x.trim(), value: x })));
    switch (b.type) {
      case 'character': {
        if (/\(/.test(up)) return [];
        const q = up.trim();
        let names = characterNames();
        if (!q) {
          // alternanza: suggerisci prima chi ha parlato prima dell'ultimo personaggio della scena
          const speakers = [];
          for (let i = idx(b.id) - 1; i >= 0; i--) {
            const x = blocks()[i];
            if (x.type === 'scene') break;
            if (x.type === 'character') { const n = stripExt(x.text); if (n && !speakers.includes(n)) speakers.push(n); }
            if (speakers.length >= 2) break;
          }
          const order = [speakers[1], speakers[0]].filter(Boolean);
          names = order.map((n) => ({ name: n, count: (names.find((x) => x.name === n) || {}).count || 0 }))
            .concat(names.filter((x) => !order.includes(x.name)));
        }
        return names.filter((n) => n.name.startsWith(q) && n.name !== q).slice(0, 6)
          .map((n) => ({ label: n.name, value: n.name, meta: n.count ? n.count + (n.count === 1 ? ' volta' : ' volte') : 'scheda' }));
      }
      case 'scene': {
        const m = up.match(PREFIX_RE);
        if (!m) return pick(SCENE_PREFIXES, up, (x) => ({ label: x.trim(), value: x, keepOpen: true }));
        const prefix = m[0].trim() + ' ';
        const rest = up.slice(m[0].length);
        const d = rest.lastIndexOf(' - ');
        const { locs, times } = sceneParts();
        if (d < 0) {
          const q = rest.trim();
          return locs.filter((l) => l.startsWith(q) && l !== q).slice(0, 6)
            .map((l) => ({ label: l, value: prefix + l + ' - ', keepOpen: true, meta: 'luogo' }));
        }
        const q = rest.slice(d + 3).trim();
        const head = prefix + rest.slice(0, d).trim() + ' - ';
        const all = times.concat(TIMES.filter((t) => !times.includes(t)));
        return all.filter((t) => t.startsWith(q) && t !== q).slice(0, 6).map((t) => ({ label: t, value: head + t }));
      }
      case 'transition': return pick(TRANSITIONS, up.trim());
      case 'shot': return pick(SHOTS, up.trim());
      case 'intercut': return pick(INTERCUTS, up.trim());
      default: return [];
    }
  }

  function updateSuggestions() {
    const b = cur();
    const focused = b && document.activeElement === txOf(b.id);
    let items = focused ? computeSuggestions(b) : [];
    if (ac.dismissed && b && ac.dismissed.id === b.id && ac.dismissed.text === b.text) items = [];
    ac.items = items;
    ac.forId = b ? b.id : null;
    ac.index = items.length ? 0 : -1;
    renderSuggestions();
  }

  function acceptSuggestion(i) {
    const item = ac.items[i == null ? ac.index : i];
    const b = cur();
    if (!item || !b) return;
    setText(b, item.value);
    focusBlock(b.id, 'end');
    changed(false);
    if (item.keepOpen) updateSuggestions();
    else { ac.items = []; ac.index = -1; renderSuggestions(); }
  }

  function closeSuggestions(dismiss) {
    const b = cur();
    if (dismiss && b) ac.dismissed = { id: b.id, text: b.text };
    ac.items = [];
    ac.index = -1;
    renderSuggestions();
  }

  const noFocusSteal = (e) => e.preventDefault();

  function renderSuggestions() {
    const b = cur();
    const mobile = U.isMobile();
    // menu a tendina (computer)
    acBox.textContent = '';
    const showAc = !mobile && ac.items.length && b;
    acBox.hidden = !showAc;
    if (showAc) {
      ac.items.forEach((it, i) => {
        acBox.appendChild(h('div', {
          class: 'ac-item' + (i === ac.index ? ' active' : ''),
          onmousedown: noFocusSteal,
          onclick: () => acceptSuggestion(i)
        }, h('span', null, it.label), it.meta ? h('span', { class: 'ac-meta' }, it.meta) : null));
      });
      const el = elOf(b.id);
      const pr = paper.getBoundingClientRect();
      const er = el.firstChild.getBoundingClientRect();
      acBox.style.top = (er.bottom - pr.top + 4) + 'px';
      acBox.style.left = Math.max(8, Math.min(er.left - pr.left, pr.width - 260)) + 'px';
    }
    // estensioni personaggio (computer)
    const isChar = b && b.type === 'character' && document.activeElement === txOf(b.id);
    extBox.hidden = mobile || !isChar;
    if (isChar && !mobile) {
      const el = elOf(b.id);
      const pr = paper.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      extBox.style.top = (er.top - pr.top) + 'px';
      const up = b.text.toUpperCase();
      U.$$('button', extBox).forEach((btn) => btn.classList.toggle('on', up.includes('(' + btn.dataset.ext + ')')));
    }
    // riga suggerimenti (telefono)
    mSuggest.textContent = '';
    if (mobile && b && document.activeElement === txOf(b.id)) {
      ac.items.forEach((it, i) => mSuggest.appendChild(h('button', { class: 'chip', onmousedown: noFocusSteal, onclick: () => acceptSuggestion(i) }, it.label)));
      if (b.type === 'character') {
        const up = b.text.toUpperCase();
        if (ac.items.length) mSuggest.appendChild(h('span', { class: 'chip-sep' }));
        EXTENSIONS.forEach((x) => mSuggest.appendChild(h('button', {
          class: 'chip ext' + (up.includes('(' + x + ')') ? ' on' : ''), onmousedown: noFocusSteal, onclick: () => toggleExtension(x)
        }, x)));
      }
    }
    mSuggest.hidden = !mSuggest.children.length;
    placeBar();
  }

  /* ---------- barra elementi, suggerimenti tasti, etichetta tipo ---------- */

  function buildBar() {
    elbar.textContent = '';
    mSuggest = h('div', { class: 'elbar-suggest', hidden: true });
    const btn = (t) => h('button', {
      class: 'tbtn' + (t.extra ? ' extra' : ''), type: 'button', dataset: { type: t.id },
      title: `${t.label} (${t.en}) — ⌥${TYPES.indexOf(t) + 1}`,
      onmousedown: noFocusSteal,
      onclick: () => { moreWrap.classList.remove('open'); applyTypeToCurrent(t.id); }
    }, h('span', { class: 'tdot' }), t.label);
    const moreBtn = h('button', {
      class: 'tbtn more', type: 'button', onmousedown: noFocusSteal,
      onclick: (e) => { e.stopPropagation(); moreWrap.classList.toggle('open'); }
    }, h('span', { class: 'more-label' }, 'Altro'), ' ▾');
    const moreWrap = h('div', { class: 'tmore' }, moreBtn, h('div', { class: 'tmore-pop' }, TYPES.filter((t) => t.extra).map(btn)));
    document.addEventListener('click', () => moreWrap.classList.remove('open'));
    const types = h('div', { class: 'elbar-types' }, TYPES.filter((t) => !t.extra).map(btn), moreWrap);
    const actions = h('div', { class: 'elbar-actions' },
      h('button', { class: 'icon-btn', 'data-act': 'undo', title: 'Annulla', onmousedown: noFocusSteal, onclick: undo }, U.icon('undo')),
      h('button', { class: 'icon-btn', 'data-act': 'redo', title: 'Ripeti', onmousedown: noFocusSteal, onclick: redo }, U.icon('redo'))
    );
    elbar.append(mSuggest, h('div', { class: 'elbar-row' }, types, actions));
  }

  function hintFor(b) {
    if (!b) return 'Clicca su una riga per scrivere. <kbd>⌥1</kbd>…<kbd>⌥9</kbd> cambiano il tipo di elemento.';
    const enter = b.text.trim() ? NEXT_ON_ENTER[b.type] : EMPTY_ENTER[b.type];
    return `<span class="hint-cur">${TYPE[b.type].label}</span>` +
      `<span><kbd>↵</kbd> ${TYPE[enter].label}</span>` +
      `<span><kbd>⇥</kbd> ${TYPE[TAB_NEXT[b.type]].label}</span>` +
      `<span><kbd>⇧⇥</kbd> ${TYPE[TAB_PREV[b.type]].label}</span>`;
  }

  function onFocusChange() {
    const b = cur();
    U.$$('.el.focused', page).forEach((e) => { if (!b || e.dataset.id !== b.id) e.classList.remove('focused'); });
    const el = b && elOf(b.id);
    if (el) el.classList.add('focused');
    // barra elementi
    U.$$('.tbtn[data-type]', elbar).forEach((x) => x.classList.toggle('on', !!b && x.dataset.type === b.type));
    const more = U.$('.tbtn.more', elbar);
    if (more) {
      const extra = b && TYPE[b.type].extra;
      more.classList.toggle('on', !!extra);
      U.$('.more-label', more).textContent = extra ? TYPE[b.type].label : 'Altro';
    }
    if (b && U.isMobile()) {
      const on = U.$('.tbtn.on', elbar);
      const strip = U.$('.elbar-types', elbar);
      if (on && strip) {
        const r = on.getBoundingClientRect(), sr = strip.getBoundingClientRect();
        if (r.left < sr.left + 8 || r.right > sr.right - 8) strip.scrollLeft += r.left - sr.left - (sr.width - r.width) / 2;
      }
    }
    if (hintEl) hintEl.innerHTML = hintFor(b);
    // etichetta del tipo nel margine (computer)
    if (el && !U.isMobile()) {
      const pr = paper.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      typeTag.textContent = TYPE[b.type].label;
      typeTag.dataset.type = b.type;
      typeTag.style.top = (er.top - pr.top) + 'px';
      typeTag.hidden = false;
    } else typeTag.hidden = true;
    highlightCurrentScene();
    updateSuggestions();
  }

  function placeBar() {
    if (!elbar) return;
    const vv = window.visualViewport;
    if (!U.isMobile() || !vv) { elbar.style.transform = ''; return; }
    const offset = window.innerHeight - vv.height - vv.offsetTop;
    elbar.style.transform = offset > 1 ? `translateY(${-offset}px)` : '';
  }

  /* ---------- statistiche ---------- */

  const WIDTH = { scene: 60, action: 60, character: 38, parenthetical: 25, dialogue: 35, transition: 60, shot: 60, subheader: 60, intercut: 60 };
  function wrapCount(text, w) {
    if (!text) return 1;
    let lines = 1, col = 0;
    for (const word of text.split(/\s+/)) {
      const l = word.length;
      if (col === 0) col = l;
      else if (col + 1 + l <= w) col += 1 + l;
      else { lines++; col = l; }
      while (col > w) { lines++; col -= w; }
    }
    return lines;
  }
  function estimate() {
    let lines = 0, prev = null, words = 0, scenes = 0;
    for (const b of blocks()) {
      const tight = (b.type === 'dialogue' || b.type === 'parenthetical') && prev && ['character', 'parenthetical', 'dialogue'].includes(prev.type);
      if (prev && !tight) lines += b.type === 'scene' ? 2 : 1;
      lines += wrapCount(b.text, WIDTH[b.type] || 60);
      if (b.text.trim()) words += b.text.trim().split(/\s+/).length;
      if (b.type === 'scene') scenes++;
      prev = b;
    }
    return { pages: lines / 54, words, scenes };
  }
  function fmtPages(p) {
    if (p < 1) return 'meno di 1 pagina';
    const v = p.toFixed(1).replace('.', ',').replace(',0', '');
    return `≈ ${v} pagin${v === '1' ? 'a' : 'e'}`;
  }
  function updateStats() {
    if (!Store.project) return;
    const s = estimate();
    const txt = `${s.scenes} scen${s.scenes === 1 ? 'a' : 'e'} · ${fmtPages(s.pages)} · ~${Math.max(1, Math.round(s.pages))} min · ${s.words} parole`;
    if (statsEl) statsEl.textContent = txt;
    const sf = U.$('#side-stats');
    if (sf) sf.textContent = txt;
  }
  const updateStatsSoon = U.debounce(updateStats, 400);

  /* ---------- barra laterale: scene e personaggi ---------- */

  function getScenes() {
    const out = [];
    const bl = blocks();
    let n = 0;
    bl.forEach((b, i) => {
      if (b.type !== 'scene') return;
      n++;
      let syn = '';
      for (let j = i + 1; j < bl.length && bl[j].type !== 'scene'; j++) {
        if (bl[j].type === 'action' && bl[j].text.trim()) { syn = bl[j].text.trim(); break; }
      }
      out.push({ id: b.id, num: n, text: b.text.trim(), synopsis: syn, index: i });
    });
    return out;
  }

  function refreshSide() {
    if (!sceneList) return;
    const scenes = getScenes();
    const colorOf = {};
    Store.project.cards.forEach((c) => { if (c.sceneId && c.color) colorOf[c.sceneId] = c.color; });
    sceneList.textContent = '';
    if (!scenes.length) {
      sceneList.appendChild(h('li', { class: 'side-empty' }, 'Nessuna scena. Scrivi un\'intestazione (es. "INT. CASA - GIORNO") per vederla qui.'));
    }
    scenes.forEach((s) => {
      sceneList.appendChild(h('li', {
        class: 'scene-item', dataset: { id: s.id },
        onclick: (e) => { if (e.target.closest('.grip')) return; jumpTo(s.id); }
      },
      h('span', { class: 'sc-num' + (colorOf[s.id] ? ' c-' + colorOf[s.id] : '') }, s.num),
      h('div', { class: 'sc-main' },
        h('div', { class: 'sc-head' }, s.text.toUpperCase() || 'Scena senza titolo'),
        s.synopsis ? h('div', { class: 'sc-syn' }, s.synopsis) : null),
      h('button', { class: 'grip', title: 'Trascina per spostare la scena', 'aria-label': 'Sposta scena' }, U.icon('grip', 16))));
    });
    highlightCurrentScene();
    // personaggi
    const lines = new Map();
    const firsts = new Map();
    blocks().forEach((b) => {
      if (b.type !== 'character') return;
      const n = stripExt(b.text);
      if (!n) return;
      lines.set(n, (lines.get(n) || 0) + 1);
      if (!firsts.has(n)) firsts.set(n, []);
      firsts.get(n).push(b.id);
    });
    charList.textContent = '';
    const chars = Array.from(lines).sort((a, b) => b[1] - a[1]);
    if (!chars.length) charList.appendChild(h('li', { class: 'side-empty' }, 'I personaggi che scrivi compariranno qui.'));
    chars.forEach(([name, count]) => {
      let k = 0;
      charList.appendChild(h('li', {
        class: 'char-item', title: 'Clicca per scorrere le battute',
        onclick: () => { const ids = firsts.get(name); jumpTo(ids[k % ids.length]); k++; }
      }, h('span', { class: 'char-name' }, name), h('span', { class: 'char-count' }, count + (count === 1 ? ' battuta' : ' battute'))));
    });
    updateStats();
  }
  const refreshSideSoon = U.debounce(refreshSide, 400);

  function highlightCurrentScene() {
    if (!sceneList) return;
    let sceneId = null;
    const i = curId ? idx(curId) : -1;
    for (let j = i; j >= 0; j--) if (blocks()[j].type === 'scene') { sceneId = blocks()[j].id; break; }
    U.$$('.scene-item', sceneList).forEach((li) => li.classList.toggle('current', li.dataset.id === sceneId));
  }

  function jumpTo(id) {
    if (U.isMobile()) window.Ciak.App.closeSidebar();
    requestAnimationFrame(() => focusBlock(id, 'end', { center: true }));
  }

  function moveScene(id, beforeId) {
    commitHistory();
    const bl = blocks();
    const starts = [];
    bl.forEach((b, i) => { if (b.type === 'scene') starts.push(i); });
    const k = starts.findIndex((s) => bl[s].id === id);
    if (k < 0) return;
    const start = starts[k], end = k + 1 < starts.length ? starts[k + 1] : bl.length;
    const chunk = bl.splice(start, end - start);
    let at = beforeId ? bl.findIndex((b) => b.id === beforeId) : bl.length;
    if (at < 0) at = bl.length;
    bl.splice(at, 0, ...chunk);
    render();
    changed(true);
  }

  /* ---------- API per le altre viste ---------- */

  function appendScene(text) {
    const bl = blocks();
    const last = bl[bl.length - 1];
    let b;
    if (last && !last.text.trim() && (last.type === 'scene' || last.type === 'action')) {
      last.type = 'scene';
      last.text = text;
      b = last;
    } else {
      b = { id: U.uid(), type: 'scene', text };
      bl.push(b);
    }
    bl.push({ id: U.uid(), type: 'action', text: '' });
    if (renderedFor === Store.project.id) render();
    changed(true);
    return b.id;
  }

  function setBlockText(id, text) {
    const b = get(id);
    if (!b) return;
    setText(b, text);
    refreshSideSoon();
    Store.touch();
  }

  function invalidate() { renderedFor = null; }

  function show() {
    if (renderedFor !== Store.project.id) { render(); resetHistory(); }
    else { refreshSide(); updateStats(); }
    placeBar();
  }

  /* ---------- inizializzazione ---------- */

  function init() {
    page = U.$('#page');
    paper = U.$('#paper');
    elbar = U.$('#elbar');
    hintEl = U.$('#hint');
    statsEl = U.$('#stats');
    sidebar = U.$('#sidebar');
    sceneList = U.$('#scene-list');
    charList = U.$('#char-list');
    typeTag = h('div', { class: 'type-tag', hidden: true });
    acBox = h('div', { class: 'ac', hidden: true, role: 'listbox' });
    extBox = h('div', { class: 'ext-chips', hidden: true },
      EXTENSIONS.map((x) => h('button', { type: 'button', dataset: { ext: x }, title: 'Estensione ' + x, onmousedown: noFocusSteal, onclick: () => toggleExtension(x) }, x)));
    paper.append(typeTag, acBox, extBox);
    buildBar();

    page.addEventListener('focusin', (e) => {
      const tx = e.target.closest('.tx');
      if (!tx) return;
      curId = tx.parentNode.dataset.id;
      onFocusChange();
    });
    page.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!page.contains(document.activeElement)) { ac.items = []; renderSuggestions(); typeTag.hidden = true; U.$$('.el.focused', page).forEach((e) => e.classList.remove('focused')); }
      }, 0);
    });

    page.addEventListener('keydown', (e) => {
      const tx = e.target.closest && e.target.closest('.tx');
      if (!tx || e.isComposing || e.keyCode === 229) return;
      const mod = e.metaKey || e.ctrlKey;
      const b = get(tx.parentNode.dataset.id);
      if (!b) return;

      if (ac.items.length && ac.forId === b.id && !U.isMobile()) {
        if (e.key === 'ArrowDown') { e.preventDefault(); ac.index = (ac.index + 1) % ac.items.length; renderSuggestions(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); ac.index = (ac.index - 1 + ac.items.length) % ac.items.length; renderSuggestions(); return; }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !mod && ac.index >= 0) { e.preventDefault(); acceptSuggestion(); return; }
        if (e.key === 'Escape') { e.preventDefault(); closeSuggestions(true); return; }
      }

      if (e.key === 'Enter' && !mod) { e.preventDefault(); handleEnter(tx); return; }
      if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); setType(b.id, (e.shiftKey ? TAB_PREV : TAB_NEXT)[b.type]); return; }
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if ((e.altKey || mod) && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); setType(b.id, TYPES[+e.code.slice(5) - 1].id); return; }
      if (e.key === 'Backspace' && !mod && !e.altKey) {
        const o = getOffsets(tx);
        if (o.start === 0 && o.end === 0) { e.preventDefault(); mergeBackward(tx); }
        return;
      }
      if (e.key === 'Delete' && !mod) {
        const o = getOffsets(tx);
        if (o.start === o.end && o.end === tx.textContent.length) { e.preventDefault(); mergeForward(tx); }
        return;
      }
      if (e.shiftKey || mod || e.altKey) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const li = lineInfo(tx);
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if ((dir < 0 && li.first) || (dir > 0 && li.last)) { if (moveVert(dir, tx, li.rect)) e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const o = getOffsets(tx);
        if (o.start !== o.end) return;
        const i = idx(b.id);
        if (e.key === 'ArrowLeft' && o.start === 0 && i > 0) { e.preventDefault(); focusBlock(blocks()[i - 1].id, 'end'); }
        if (e.key === 'ArrowRight' && o.start === tx.textContent.length && i < blocks().length - 1) { e.preventDefault(); focusBlock(blocks()[i + 1].id, 'start'); }
      }
    });

    page.addEventListener('beforeinput', (e) => {
      const tx = e.target.closest && e.target.closest('.tx');
      if (!tx) return;
      switch (e.inputType) {
        case 'insertParagraph':
        case 'insertLineBreak':
          e.preventDefault();
          handleEnter(tx);
          break;
        case 'historyUndo': e.preventDefault(); undo(); break;
        case 'historyRedo': e.preventDefault(); redo(); break;
        case 'deleteContentBackward': {
          const o = getOffsets(tx);
          if (o.start === 0 && o.end === 0) { e.preventDefault(); mergeBackward(tx); }
          break;
        }
        default:
      }
    });

    page.addEventListener('input', (e) => {
      const tx = e.target.closest && e.target.closest('.tx');
      if (!tx) return;
      const el = tx.parentNode;
      const b = get(el.dataset.id);
      if (!b) return;
      const hasElements = Array.from(tx.childNodes).some((n) => n.nodeType === 1 && n.nodeName !== 'BR');
      let text = tx.textContent;
      if (hasElements || /\n/.test(text)) {
        const o = getOffsets(tx);
        text = text.replace(/\n/g, ' ');
        tx.textContent = text;
        setCaret(tx, o.start);
      }
      if (!text && tx.firstChild) tx.textContent = '';
      b.text = text;
      el.classList.toggle('is-empty', !text);
      // riconoscimento automatico
      if (b.type === 'action' && /^(int|ext|est)[.\s]|^(int\.?\/e[sx]t\.?|i\/e)[.\s]/i.test(text)) { setType(b.id, 'scene'); return; }
      if (b.type === 'dialogue' && text === '(') { setType(b.id, 'parenthetical'); return; }
      changed(false);
      updateSuggestions();
    });

    page.addEventListener('paste', (e) => {
      const tx = e.target.closest && e.target.closest('.tx');
      if (!tx) return;
      e.preventDefault();
      const raw = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      const text = raw.replace(/\r\n?/g, '\n');
      if (!text) return;
      if (!text.trim().includes('\n')) { document.execCommand('insertText', false, text.replace(/\n/g, ' ')); return; }
      const parsed = Formats.parseFountain(text, { titlePage: false }).blocks;
      if (!parsed.length) return;
      commitHistory();
      const b = get(tx.parentNode.dataset.id);
      let i = idx(b.id);
      if (!b.text.trim()) { removeBlock(b.id); i--; }
      let last = null;
      parsed.forEach((p, k) => { last = insertAt(i + 1 + k, p.type, p.text); });
      renumber();
      focusBlock(last.id, 'end');
      changed(true);
      refreshSide();
    });

    // clic nello spazio vuoto del foglio: vai all'ultima riga
    paper.addEventListener('mousedown', (e) => {
      if (e.target !== paper && e.target !== page) return;
      const bl = blocks();
      if (!bl.length) return;
      const lastEl = page.lastElementChild;
      if (lastEl && e.clientY > lastEl.getBoundingClientRect().bottom) {
        e.preventDefault();
        focusBlock(bl[bl.length - 1].id, 'end');
      }
    });

    // tab barra laterale
    U.$$('.side-tabs button').forEach((btn) => btn.addEventListener('click', () => {
      U.$$('.side-tabs button').forEach((x) => x.classList.toggle('on', x === btn));
      sceneList.hidden = btn.dataset.tab !== 'scenes';
      charList.hidden = btn.dataset.tab !== 'chars';
    }));

    window.Ciak.Sortable(sceneList, {
      item: '.scene-item',
      handle: '.grip',
      scrollY: U.$('.side-body'),
      onDrop: (id, list, beforeId) => { if (id) moveScene(id, beforeId); else refreshSide(); }
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', placeBar);
      window.visualViewport.addEventListener('scroll', placeBar);
    }
    window.addEventListener('resize', () => { renderSuggestions(); onFocusChange(); });
  }

  window.Ciak.Editor = {
    TYPES, TYPE, init, render, show, invalidate, focusBlock, getScenes, appendScene, setBlockText,
    undo, redo, characterNames, estimate, fmtPages, renumber, refreshSide, resetHistory,
    blocks, commitHistory
  };
})();
