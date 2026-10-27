/* Ciak — editor del copione
 *
 * Il copione è un unico elemento modificabile (#page) che contiene una riga <div class="el">
 * per ogni elemento della sceneggiatura. Così si può selezionare, cancellare, copiare e
 * incollare su più righe come in un normale editor di testo. Il modello (Store.project.blocks)
 * viene aggiornato a ogni modifica; Invio, cancellazioni tra più righe, incolla e taglia sono
 * gestiti qui per avere sempre un risultato prevedibile.
 */
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

  let page, paper, elbar, typeTag, acBox, extBox, mSuggest, hintEl, statsEl, sceneList, charList;
  let curId = null;
  let lastSel = null;
  let renderedFor = null;
  const ac = { items: [], index: -1, forId: null, dismissed: null };

  const blocks = () => Store.project.blocks;
  const idx = (id) => blocks().findIndex((b) => b.id === id);
  const get = (id) => blocks().find((b) => b.id === id);
  const elOf = (id) => (id ? page.querySelector(`.el[data-id="${id}"]`) : null);
  const cur = () => (curId ? get(curId) : null);
  const stripExt = (name) => name.toUpperCase().replace(/\s*\(.*$/, '').replace(/\^$/, '').trim();
  const isFocused = () => document.activeElement === page;

  /* ---------- DOM delle righe ---------- */

  function fill(el, text) {
    if (text) el.textContent = text;
    else el.innerHTML = '<br>';
  }

  function makeEl(b) {
    const el = document.createElement('div');
    el.dataset.id = b.id;
    fill(el, b.text);
    applyType(el, b);
    return el;
  }

  function applyType(el, b) {
    const cls = 'el el-' + b.type + (b.text ? '' : ' is-empty') + (b.id === curId ? ' focused' : '');
    if (el.className !== cls) el.className = cls;
    if (el.dataset.ph !== TYPE[b.type].hint) el.dataset.ph = TYPE[b.type].hint;
  }

  function render() {
    if (!page) return;
    page.textContent = '';
    const frag = document.createDocumentFragment();
    for (const b of blocks()) frag.appendChild(makeEl(b));
    page.appendChild(frag);
    renderedFor = Store.project.id;
    if (!get(curId)) curId = null;
    lastSel = null;
    renumber();
    refreshSide();
    updateStats();
    onSelChange();
  }

  // i numeri di scena sono contatori CSS: qui si attivano/disattivano soltanto
  function renumber() {
    page.classList.toggle('show-numbers', !!Store.project.settings.sceneNumbers);
  }

  function setText(b, text) {
    b.text = text;
    const el = elOf(b.id);
    if (el) {
      if (el.textContent !== text || (!text && !el.querySelector('br'))) fill(el, text);
      applyType(el, b);
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

  function ensureOne() {
    if (blocks().length) return;
    const b = { id: U.uid(), type: 'action', text: '' };
    blocks().push(b);
    page.appendChild(makeEl(b));
  }

  /* ---------- selezione ---------- */

  function lineOf(node) {
    while (node && node !== page) {
      if (node.nodeType === 1 && node.parentNode === page) return node;
      node = node.parentNode;
    }
    return null;
  }

  function pointOf(node, offset) {
    if (node === page) {
      const kids = page.children;
      if (!kids.length) return null;
      if (offset < kids.length) return { id: kids[offset].dataset.id, off: 0 };
      const last = kids[kids.length - 1];
      return { id: last.dataset.id, off: last.textContent.length };
    }
    const el = lineOf(node);
    if (!el) return null;
    const r = document.createRange();
    r.selectNodeContents(el);
    try { r.setEnd(node, offset); } catch (e) { return { id: el.dataset.id, off: 0 }; }
    return { id: el.dataset.id, off: r.toString().length };
  }

  // { startId, startOff, endId, endOff, collapsed } oppure null se il cursore non è nel copione
  function getSel() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (r.startContainer !== page && !page.contains(r.startContainer)) return null;
    const a = pointOf(r.startContainer, r.startOffset);
    const b = pointOf(r.endContainer, r.endOffset);
    if (!a || !b || !a.id || !b.id) return null;
    return { startId: a.id, startOff: a.off, endId: b.id, endOff: b.off, collapsed: r.collapsed };
  }

  function locate(el, off) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, rem = Math.max(0, off), last = null;
    while ((n = walker.nextNode())) {
      if (rem <= n.length) return [n, rem];
      rem -= n.length;
      last = n;
    }
    return last ? [last, last.length] : [el, 0];
  }

  function setSel(id, off, endId, endOff) {
    const el = elOf(id);
    if (!el) return;
    if (!isFocused()) page.focus({ preventScroll: true });
    const range = document.createRange();
    const [n, o] = locate(el, off === 'end' ? el.textContent.length : off);
    range.setStart(n, o);
    if (endId != null && elOf(endId)) {
      const e2 = elOf(endId);
      const [n2, o2] = locate(e2, endOff === 'end' ? e2.textContent.length : endOff);
      range.setEnd(n2, o2);
    } else range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function offsetFromPoint(el, x, y) {
    let node = null, off = 0;
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; off = r.startOffset; }
    } else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; off = p.offset; }
    }
    if (!node || !el.contains(node)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(node, off);
    return pre.toString().length;
  }

  // righe coinvolte dalla selezione (una selezione che finisce all'inizio di una riga non la include)
  function lineRange(s) {
    let si = idx(s.startId), ei = idx(s.endId || s.startId);
    if (si < 0) si = 0;
    if (ei < 0) ei = si;
    if (ei > si && !s.collapsed && s.endOff === 0) ei--;
    return [Math.min(si, ei), Math.max(si, ei)];
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
    if (center) { window.scrollBy({ top: r.top - top - (bottom - top) * 0.25 }); return; }
    if (r.bottom > bottom - 12) window.scrollBy({ top: r.bottom - bottom + 40 });
    else if (r.top < top + 8) window.scrollBy({ top: r.top - top - 40 });
  }

  function focusBlock(id, offset = 'end', opts = {}) {
    const el = elOf(id);
    if (!el) return;
    setSel(id, offset);
    curId = id;
    ensureVisible(el, opts.center);
    onSelChange();
  }

  /* ---------- sincronizzazione DOM → modello ---------- */

  // Rimette in ordine il DOM dopo modifiche fatte dal browser (righe nuove senza id,
  // testo fuori dalle righe, formattazione incollata…) e aggiorna il modello.
  function reconcile() {
    const sel = window.getSelection();
    const raw = sel.rangeCount && page.contains(sel.focusNode) ? { node: sel.focusNode, off: sel.focusOffset } : null;
    let touched = false;

    // testo o elementi sciolti direttamente nel copione → dentro una riga
    let wrap = null;
    for (const child of Array.from(page.childNodes)) {
      if (child.nodeType === 1 && child.nodeName === 'DIV') { wrap = null; continue; }
      if (child.nodeType === 3 && !child.textContent) { child.remove(); continue; }
      if (child.nodeType !== 1 && child.nodeType !== 3) { child.remove(); continue; }
      if (!wrap) { wrap = document.createElement('div'); page.insertBefore(wrap, child); }
      wrap.appendChild(child);
      touched = true;
    }

    let caret = null;
    if (raw && page.contains(raw.node)) {
      const el = lineOf(raw.node);
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        try { r.setEnd(raw.node, raw.off); caret = { el, off: r.toString().length }; } catch (e) { caret = { el, off: 0 }; }
      }
    }

    const old = new Map(blocks().map((b) => [b.id, b]));
    const seen = new Set();
    const next = [];
    for (const el of Array.from(page.children)) {
      let id = el.dataset.id;
      let b = id && !seen.has(id) ? old.get(id) : null;
      if (!b) {
        const m = (el.className || '').match(/\bel-(\w+)/);
        const prev = next[next.length - 1];
        const type = id && old.get(id) ? old.get(id).type : (m && TYPE[m[1]] ? m[1] : (prev ? prev.type : 'action'));
        id = U.uid();
        el.dataset.id = id;
        b = { id, type, text: '' };
      }
      seen.add(id);
      const messy = Array.from(el.childNodes).some((n) => n.nodeType === 1 && n.nodeName !== 'BR') || /\n/.test(el.textContent);
      const text = el.textContent.replace(/\n/g, ' ');
      if (messy) { fill(el, text); touched = true; }
      else if (!text && !el.querySelector('br')) fill(el, '');
      b.text = text;
      applyType(el, b);
      next.push(b);
    }
    Store.project.blocks = next;
    ensureOne();
    if (touched && caret && page.contains(caret.el)) setSel(caret.el.dataset.id, caret.off);
  }

  /* ---------- cronologia (annulla / ripeti) ---------- */

  let hist = [], hi = -1;
  function snapshot() {
    const s = (isFocused() && getSel()) || lastSel;
    return { data: JSON.stringify(blocks()), focus: s ? s.startId : curId, off: s ? s.startOff : 0 };
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
    const b = (s.focus && get(s.focus)) || blocks()[0];
    focusBlock(b.id, Math.min(s.off, b.text.length));
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

  /* ---------- tipo di elemento ---------- */

  function convertText(t, from, to, caret) {
    if (from === 'parenthetical' && to !== 'parenthetical') {
      if (t.startsWith('(')) { t = t.slice(1); caret = Math.max(0, caret - 1); }
      t = t.replace(/\)\s*$/, '');
    }
    if (to === 'parenthetical' && from !== 'parenthetical') {
      if (!t.startsWith('(')) { t = '(' + t; caret++; }
      if (!t.endsWith(')') || t === '(') t += ')';
      caret = Math.min(caret, t.length - 1);
    }
    return [t, Math.min(caret, t.length)];
  }

  // Cambia il tipo delle righe selezionate (o della riga corrente)
  function setType(type, s) {
    s = s || (isFocused() && getSel()) || lastSel;
    if (!s || !TYPE[type]) return;
    const [si, ei] = lineRange(s);
    commitHistory();
    const bl = blocks();
    let caret = s.startOff;
    for (let i = si; i <= ei; i++) {
      const b = bl[i];
      if (b.type === type) continue;
      const [t, c] = convertText(b.text, b.type, type, i === si ? caret : b.text.length);
      if (i === si) caret = c;
      b.type = type;
      setText(b, t);
    }
    if (si === ei) setSel(bl[si].id, caret);
    else setSel(bl[si].id, 0, bl[ei].id, 'end');
    curId = bl[si].id;
    onSelChange();
    changed(true);
  }

  function applyTypeToCurrent(type) {
    let s = (isFocused() && getSel()) || lastSel;
    if (!s || !get(s.startId)) {
      const last = blocks()[blocks().length - 1];
      const b = last && !last.text ? last : insertAt(blocks().length, type, '');
      s = { startId: b.id, startOff: 0, endId: b.id, endOff: 0, collapsed: true };
    }
    setType(type, s);
  }

  /* ---------- modifiche al testo ---------- */

  // Cancella la selezione. Se comprende righe intere le elimina del tutto.
  // Restituisce il punto in cui resta il cursore.
  function deleteSelection(s) {
    commitHistory();
    const bl = blocks();
    let si = idx(s.startId), ei = idx(s.endId);
    let so = s.startOff, eo = s.endOff;
    let withBreak = false;
    if (ei > si && eo === 0) { ei--; eo = bl[ei].text.length; withBreak = true; }
    const first = bl[si], last = bl[ei];
    let point;
    if (so === 0 && eo === last.text.length && (ei > si || withBreak)) {
      bl.slice(si, ei + 1).forEach((b) => removeBlock(b.id));
      ensureOne();
      const nb = blocks()[si];
      point = nb ? { id: nb.id, off: 0 } : { id: blocks()[si - 1].id, off: blocks()[si - 1].text.length };
    } else {
      const text = first.text.slice(0, so) + last.text.slice(eo);
      bl.slice(si + 1, ei + 1).forEach((b) => removeBlock(b.id));
      setText(first, text);
      point = { id: first.id, off: so };
    }
    setSel(point.id, point.off);
    curId = point.id;
    onSelChange();
    changed(true);
    return point;
  }

  function insertTextAt(p, text) {
    const b = get(p.id);
    setText(b, b.text.slice(0, p.off) + text + b.text.slice(p.off));
    setSel(b.id, p.off + text.length);
    changed(false);
    autoDetect(b);
  }

  function handleEnter(s) {
    commitHistory();
    if (!s.collapsed) {
      const p = deleteSelection(s);
      s = { startId: p.id, startOff: p.off, endId: p.id, endOff: p.off, collapsed: true };
    }
    const b = get(s.startId);
    if (!b) return;
    const i = idx(b.id);
    const el = elOf(b.id);
    const text = b.text;
    if (!text.trim()) { setType(EMPTY_ENTER[b.type], s); return; }
    const start = s.startOff;
    if (start === 0) {
      insertAt(i, 'action', '');
      focusBlock(b.id, 0);
      changed(true);
      return;
    }
    let before = text.slice(0, start).replace(/\s+$/, '');
    let after = text.slice(start).replace(/^\s+/, '');
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
    focusBlock(nb.id, 'start');
    changed(true);
  }

  function mergeBackward(id) {
    const b = get(id);
    const i = idx(id);
    if (i <= 0) { if (!b.text && b.type !== 'action') setType('action'); return; }
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
    changed(true);
  }

  function mergeForward(id) {
    const b = get(id);
    const i = idx(id);
    const next = blocks()[i + 1];
    if (!next) return;
    commitHistory();
    const len = b.text.length;
    if (!b.text) { removeBlock(b.id); focusBlock(next.id, 0); changed(true); return; }
    if (next.text) setText(b, b.text + next.text);
    removeBlock(next.id);
    focusBlock(b.id, len);
    changed(true);
  }

  function autoDetect(b) {
    if (b.type === 'action' && /^(int|ext|est)[.\s]|^(int\.?\/e[sx]t\.?|i\/e)[.\s]/i.test(b.text)) {
      const s = getSel();
      setType('scene', s && s.startId === b.id ? s : { startId: b.id, startOff: b.text.length, endId: b.id, endOff: b.text.length, collapsed: true });
      return true;
    }
    if (b.type === 'dialogue' && b.text === '(') {
      setType('parenthetical', { startId: b.id, startOff: 1, endId: b.id, endOff: 1, collapsed: true });
      return true;
    }
    return false;
  }

  function toggleExtension(ext) {
    const b = cur();
    if (!b || b.type !== 'character') return;
    commitHistory();
    const tag = '(' + ext + ')';
    let t = b.text.trim();
    const strip = (str, x) => str.replace(new RegExp('\\s*\\(' + x.replace(/[.']/g, (c) => '\\' + c) + '\\)', 'i'), '');
    if (t.toUpperCase().includes(tag)) t = strip(t, ext);
    else {
      if (EXT_GROUP.includes(ext)) EXT_GROUP.forEach((x) => { t = strip(t, x); });
      if (ext === "CONT'D") t = t + ' ' + tag;
      else {
        const m = t.match(/\s*\(CONT'D\)/i);
        t = m ? t.replace(m[0], '') + ' ' + tag + " (CONT'D)" : t + ' ' + tag;
      }
    }
    setText(b, t.trim());
    focusBlock(b.id, 'end');
    changed(true);
  }

  // testo da mettere negli appunti: formato Fountain se sono più righe (così incollando i tipi si conservano)
  function selectionText(s) {
    const si = idx(s.startId), ei = idx(s.endId);
    if (si === ei) return get(s.startId).text.slice(s.startOff, s.endOff);
    const part = blocks().slice(si, ei + 1).map((b, k, arr) => {
      let t = b.text;
      if (k === arr.length - 1) t = t.slice(0, s.endOff);
      if (k === 0) t = t.slice(s.startOff);
      return { type: b.type, text: t };
    }).filter((b) => b.text.trim());
    return Formats.toFountainBody(part, false);
  }

  function insertBlocks(p, parsed) {
    commitHistory();
    const b = get(p.id);
    let i = idx(b.id);
    const before = b.text.slice(0, p.off), after = b.text.slice(p.off);
    let at;
    if (!b.text.trim()) { removeBlock(b.id); at = i; }
    else if (!after) at = i + 1;
    else if (!before) at = i;
    else { setText(b, before); insertAt(i + 1, b.type, after); at = i + 1; }
    let last = null;
    parsed.forEach((x, k) => { last = insertAt(at + k, x.type, x.text); });
    ensureOne();
    focusBlock(last ? last.id : blocks()[Math.min(at, blocks().length - 1)].id, 'end');
    changed(true);
  }

  /* ---------- azioni su righe e scene ---------- */

  function deleteLines(si, ei, message) {
    commitHistory();
    const removed = blocks().slice(si, ei + 1);
    removed.forEach((b) => removeBlock(b.id));
    ensureOne();
    const bl = blocks();
    const nb = bl[si] || bl[si - 1];
    focusBlock(nb.id, bl[si] ? 0 : 'end');
    changed(true);
    refreshSide();
    U.toast(message || (removed.length > 1 ? `${removed.length} righe eliminate` : 'Riga eliminata'), { action: 'Annulla', onAction: undo });
  }

  function duplicateLines(si, ei) {
    commitHistory();
    const copies = blocks().slice(si, ei + 1).map((b) => ({ type: b.type, text: b.text }));
    let last = null;
    copies.forEach((c, k) => { last = insertAt(ei + 1 + k, c.type, c.text); });
    setSel(blocks()[ei + 1].id, 0, last.id, 'end');
    curId = last.id;
    onSelChange();
    changed(true);
    refreshSide();
  }

  function moveLines(s, dir) {
    const [si, ei] = lineRange(s);
    const bl = blocks();
    if ((dir < 0 && si === 0) || (dir > 0 && ei === bl.length - 1)) return;
    commitHistory();
    const chunk = bl.splice(si, ei - si + 1);
    const els = chunk.map((b) => elOf(b.id));
    if (dir < 0) {
      const ref = elOf(bl[si - 1].id);
      els.forEach((el) => page.insertBefore(el, ref));
      bl.splice(si - 1, 0, ...chunk);
    } else {
      const ref = elOf(bl[si].id);
      ref.after(...els);
      bl.splice(si + 1, 0, ...chunk);
    }
    if (s.collapsed) setSel(s.startId, s.startOff);
    else setSel(s.startId, s.startOff, s.endId, s.endOff);
    ensureVisible(els[dir < 0 ? 0 : els.length - 1]);
    onSelChange();
    changed(true);
    refreshSide();
  }

  function sceneOf(id) {
    const bl = blocks();
    for (let i = idx(id); i >= 0; i--) if (bl[i].type === 'scene') return bl[i].id;
    return null;
  }

  function sceneRange(id) {
    const bl = blocks();
    const a = idx(id);
    let z = a + 1;
    while (z < bl.length && bl[z].type !== 'scene') z++;
    return [a, z - 1];
  }

  function deleteScene(id) {
    const [a, z] = sceneRange(id);
    if (a < 0) return;
    deleteLines(a, z, 'Scena eliminata');
  }

  function duplicateScene(id) {
    const [a, z] = sceneRange(id);
    if (a < 0) return;
    duplicateLines(a, z);
    focusBlock(blocks()[z + 1].id, 'end', { center: true });
    U.toast('Scena duplicata');
  }

  function selectScene(id) {
    const [a, z] = sceneRange(id);
    if (a < 0) return;
    const bl = blocks();
    setSel(bl[a].id, 0, bl[z].id, 'end');
    curId = bl[a].id;
    ensureVisible(elOf(bl[a].id), true);
    onSelChange();
  }

  function moveScene(id, beforeId) {
    commitHistory();
    const bl = blocks();
    const [a, z] = sceneRange(id);
    if (a < 0) return;
    const chunk = bl.splice(a, z - a + 1);
    let at = beforeId ? bl.findIndex((b) => b.id === beforeId) : bl.length;
    if (at < 0) at = bl.length;
    bl.splice(at, 0, ...chunk);
    render();
    changed(true);
  }

  function moveSceneBy(id, dir) {
    const sc = getScenes();
    const k = sc.findIndex((x) => x.id === id);
    if (k < 0) return;
    if (dir < 0 && k > 0) moveScene(id, sc[k - 1].id);
    else if (dir > 0 && k < sc.length - 1) moveScene(id, sc[k + 2] ? sc[k + 2].id : null);
    else return;
    focusBlock(id, 'end', { center: true });
  }

  function sceneItems(id, withGo) {
    const sc = getScenes();
    const k = sc.findIndex((x) => x.id === id);
    if (k < 0) return [];
    const heading = sc[k].text.toUpperCase() || 'Scena senza titolo';
    return [
      { group: `Scena ${sc[k].num} · ${heading.length > 34 ? heading.slice(0, 33) + '…' : heading}` },
      withGo ? { icon: 'file', label: 'Vai alla scena', onClick: () => jumpTo(id) } : null,
      { icon: 'select', label: 'Seleziona tutta la scena', onClick: () => selectScene(id) },
      { icon: 'copy', label: 'Duplica scena', onClick: () => duplicateScene(id) },
      { icon: 'arrowUp', label: 'Sposta scena su', disabled: k === 0, onClick: () => moveSceneBy(id, -1) },
      { icon: 'arrowDown', label: 'Sposta scena giù', disabled: k === sc.length - 1, onClick: () => moveSceneBy(id, 1) },
      { icon: 'trash', label: 'Elimina scena', danger: true, onClick: () => deleteScene(id) }
    ].filter(Boolean);
  }

  function lineItems(s, withTypes) {
    const [si, ei] = lineRange(s);
    const n = ei - si + 1;
    const bl = blocks();
    const items = [];
    if (withTypes) {
      const curType = bl[si].type;
      items.push({ group: 'Tipo di elemento' }, {
        chips: TYPES.map((t, k) => ({ dot: t.id, label: t.label, title: `${t.label} (${t.en}) — ⌥${k + 1}`, checked: t.id === curType, onClick: () => setType(t.id, s) }))
      });
    }
    items.push({ group: n > 1 ? `${n} righe selezionate` : 'Riga' });
    if (n > 1 || !s.collapsed) {
      items.push({ icon: 'scissors', label: 'Taglia', onClick: () => cutSelection(s) });
    }
    items.push(
      { icon: 'trash', label: n > 1 ? 'Elimina righe' : 'Elimina riga', hint: U.isMac ? '⌘⇧⌫' : 'Ctrl⇧⌫', onClick: () => deleteLines(si, ei) },
      { icon: 'copy', label: n > 1 ? 'Duplica righe' : 'Duplica riga', onClick: () => duplicateLines(si, ei) },
      { icon: 'arrowUp', label: 'Sposta su', hint: '⌥↑', disabled: si === 0, onClick: () => moveLines(s, -1) },
      { icon: 'arrowDown', label: 'Sposta giù', hint: '⌥↓', disabled: ei === bl.length - 1, onClick: () => moveLines(s, 1) }
    );
    const sc = sceneOf(bl[si].id);
    if (sc) items.push(...sceneItems(sc, false));
    return items;
  }

  function cutSelection(s) {
    const text = selectionText(s);
    const done = () => { deleteSelection(s); U.toast('Testo tagliato', { action: 'Annulla', onAction: undo }); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
  }

  function openLineMenu(anchor, withTypes) {
    const s = (isFocused() && getSel()) || lastSel || (blocks()[0] && { startId: blocks()[0].id, startOff: 0, endId: blocks()[0].id, endOff: 0, collapsed: true });
    if (!s || !get(s.startId)) return;
    window.Ciak.App.popMenu(anchor, lineItems(s, withTypes), 'Riga e scena', { place: withTypes ? 'right' : 'below' });
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

  function caretInCurrent() {
    if (!isFocused()) return false;
    const s = getSel();
    return !!s && s.collapsed && s.startId === curId;
  }

  function updateSuggestions() {
    const b = cur();
    let items = b && caretInCurrent() ? computeSuggestions(b) : [];
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
    const active = !!b && caretInCurrent();
    // menu a tendina (computer)
    acBox.textContent = '';
    const showAc = !mobile && active && ac.items.length;
    acBox.hidden = !showAc;
    if (showAc) {
      ac.items.forEach((it, i) => {
        acBox.appendChild(h('div', {
          class: 'ac-item' + (i === ac.index ? ' active' : ''),
          onmousedown: noFocusSteal,
          onclick: () => acceptSuggestion(i)
        }, h('span', null, it.label), it.meta ? h('span', { class: 'ac-meta' }, it.meta) : null));
      });
      const pr = paper.getBoundingClientRect();
      const er = elOf(b.id).getBoundingClientRect();
      acBox.style.top = (er.bottom - pr.top + 4) + 'px';
      acBox.style.left = Math.max(8, Math.min(er.left - pr.left, pr.width - 260)) + 'px';
    }
    // estensioni personaggio (computer)
    const isChar = active && b.type === 'character';
    extBox.hidden = mobile || !isChar;
    if (isChar && !mobile) {
      const pr = paper.getBoundingClientRect();
      const er = elOf(b.id).getBoundingClientRect();
      extBox.style.top = (er.top - pr.top) + 'px';
      const up = b.text.toUpperCase();
      U.$$('button', extBox).forEach((btn) => btn.classList.toggle('on', up.includes('(' + btn.dataset.ext + ')')));
    }
    // riga suggerimenti (telefono)
    mSuggest.textContent = '';
    if (mobile && active) {
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
    const lineBtn = (cls) => h('button', {
      class: 'icon-btn ' + cls, type: 'button', 'data-act': 'line-menu', title: 'Azioni: elimina, duplica, sposta righe e scene', 'aria-label': 'Azioni sulla riga e sulla scena',
      onmousedown: noFocusSteal, onclick: (e) => openLineMenu(e.currentTarget, false)
    }, U.icon('more', 18));
    const types = h('div', { class: 'elbar-types' }, TYPES.filter((t) => !t.extra).map(btn), moreWrap, h('span', { class: 'elbar-sep' }), lineBtn('line-btn-desk'));
    const actions = h('div', { class: 'elbar-actions' },
      h('button', { class: 'icon-btn', 'data-act': 'undo', title: 'Annulla', onmousedown: noFocusSteal, onclick: undo }, U.icon('undo')),
      h('button', { class: 'icon-btn', 'data-act': 'redo', title: 'Ripeti', onmousedown: noFocusSteal, onclick: redo }, U.icon('redo')),
      lineBtn('line-btn-mob'));
    elbar.append(mSuggest, h('div', { class: 'elbar-row' }, types, actions));
  }

  function hintFor(b, s) {
    if (!b) return 'Clicca su una riga per scrivere. <kbd>⌥1</kbd>…<kbd>⌥9</kbd> cambiano il tipo di elemento.';
    if (s && !s.collapsed && s.startId !== s.endId) {
      const [si, ei] = lineRange(s);
      return `<span class="hint-cur">${ei - si + 1} righe selezionate</span><span><kbd>⌫</kbd> elimina</span><span><kbd>⌥1</kbd>…<kbd>⌥9</kbd> cambia tipo</span><span><kbd>⌥↑</kbd><kbd>⌥↓</kbd> sposta</span>`;
    }
    const enter = b.text.trim() ? NEXT_ON_ENTER[b.type] : EMPTY_ENTER[b.type];
    return `<span class="hint-cur">${TYPE[b.type].label}</span>` +
      `<span><kbd>↵</kbd> ${TYPE[enter].label}</span>` +
      `<span><kbd>⇥</kbd> ${TYPE[TAB_NEXT[b.type]].label}</span>` +
      `<span><kbd>⇧⇥</kbd> ${TYPE[TAB_PREV[b.type]].label}</span>`;
  }

  let selRaf = 0;
  function onSelChangeSoon() {
    if (selRaf) return;
    selRaf = requestAnimationFrame(() => { selRaf = 0; onSelChange(); });
  }

  function onSelChange() {
    if (!page) return;
    const s = isFocused() ? getSel() : null;
    if (s && get(s.startId)) { curId = s.startId; lastSel = s; }
    const b = cur();
    const focused = isFocused() && !!b;
    U.$$('.el.focused', page).forEach((e) => { if (!focused || e.dataset.id !== b.id) e.classList.remove('focused'); });
    const el = b && elOf(b.id);
    if (el && focused) el.classList.add('focused');
    if (b) page.setAttribute('autocapitalize', UPPER.has(b.type) ? 'characters' : 'sentences');
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
    if (hintEl) hintEl.innerHTML = hintFor(focused ? b : null, s);
    // etichetta del tipo nel margine (computer): cliccandola si apre il menu della riga
    if (el && focused && !U.isMobile()) {
      const pr = paper.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      typeTag.firstChild.textContent = TYPE[b.type].label;
      typeTag.dataset.type = b.type;
      typeTag.style.top = (er.top - pr.top) + 'px';
      typeTag.hidden = false;
    } else if (!typeTag.matches(':hover')) typeTag.hidden = true;
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
        onclick: (e) => { if (e.target.closest('.sc-tools')) return; jumpTo(s.id); }
      },
      h('span', { class: 'sc-num' + (colorOf[s.id] ? ' c-' + colorOf[s.id] : '') }, s.num),
      h('div', { class: 'sc-main' },
        h('div', { class: 'sc-head' }, s.text.toUpperCase() || 'Scena senza titolo'),
        s.synopsis ? h('div', { class: 'sc-syn' }, s.synopsis) : null),
      h('div', { class: 'sc-tools' },
        h('button', {
          class: 'sc-more', type: 'button', title: 'Azioni sulla scena', 'aria-label': 'Azioni sulla scena',
          onclick: (e) => window.Ciak.App.popMenu(e.currentTarget, sceneItems(s.id, true), 'Scena ' + s.num, { place: 'right' })
        }, U.icon('more', 16)),
        h('button', { class: 'grip', type: 'button', title: 'Trascina per spostare la scena', 'aria-label': 'Sposta scena' }, U.icon('grip', 16)))));
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
    const sceneId = curId && get(curId) ? sceneOf(curId) : null;
    U.$$('.scene-item', sceneList).forEach((li) => li.classList.toggle('current', li.dataset.id === sceneId));
  }

  function jumpTo(id) {
    if (U.isMobile()) window.Ciak.App.closeSidebar();
    requestAnimationFrame(() => focusBlock(id, 'end', { center: true }));
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

  /* ---------- eventi ---------- */

  function onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const mod = e.metaKey || e.ctrlKey;
    let s = getSel();
    if (!s) return;
    if (!get(s.startId)) { reconcile(); s = getSel(); if (!s) return; }
    const b = get(s.startId);

    if (ac.items.length && ac.forId === b.id && s.collapsed && !U.isMobile()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); ac.index = (ac.index + 1) % ac.items.length; renderSuggestions(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); ac.index = (ac.index - 1 + ac.items.length) % ac.items.length; renderSuggestions(); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !mod && ac.index >= 0) { e.preventDefault(); acceptSuggestion(); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSuggestions(true); return; }
    }

    if (e.key === 'Enter' && !mod) { e.preventDefault(); handleEnter(s); return; }
    if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); setType((e.shiftKey ? TAB_PREV : TAB_NEXT)[b.type], s); return; }
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && !e.altKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); return; }
    if ((e.altKey || mod) && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); setType(TYPES[+e.code.slice(5) - 1].id, s); return; }
    if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); moveLines(s, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); const [si, ei] = lineRange(s); deleteLines(si, ei); return; }
    if (e.key === 'Escape' && !s.collapsed) { setSel(s.endId, s.endOff); }
  }

  function onBeforeInput(e) {
    const s = getSel();
    if (!s) return;
    const t = e.inputType || '';
    if (t === 'historyUndo') { e.preventDefault(); undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); redo(); return; }
    if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); handleEnter(s); return; }
    if (t.startsWith('format') || t === 'insertFromDrop' || t === 'deleteByDrag') { e.preventDefault(); return; }
    if (!get(s.startId) || !get(s.endId)) return;
    const multi = s.startId !== s.endId;
    if (t.startsWith('delete')) {
      if (multi) { e.preventDefault(); deleteSelection(s); return; }
      if (s.collapsed) {
        const b = get(s.startId);
        if (t.endsWith('Backward') && s.startOff === 0) { e.preventDefault(); mergeBackward(b.id); return; }
        if (t.endsWith('Forward') && s.startOff >= b.text.length) { e.preventDefault(); mergeForward(b.id); return; }
      }
      return;
    }
    if (multi && (t === 'insertText' || t === 'insertReplacementText') && e.data != null) {
      e.preventDefault();
      insertTextAt(deleteSelection(s), e.data);
    }
  }

  function onInput() {
    const sel = window.getSelection();
    const el = sel.rangeCount ? lineOf(sel.focusNode) : null;
    const n = blocks().length;
    const structural = page.childNodes.length !== n || page.children.length !== n || !el || !el.dataset.id || !get(el.dataset.id);
    let b;
    if (structural) {
      reconcile();
      const s = getSel();
      b = s && get(s.startId);
    } else {
      b = get(el.dataset.id);
      const messy = Array.from(el.childNodes).some((x) => x.nodeType === 1 && x.nodeName !== 'BR') || /\n/.test(el.textContent);
      if (messy) {
        const p = pointOf(sel.focusNode, sel.focusOffset);
        fill(el, el.textContent.replace(/\n/g, ' '));
        if (p) setSel(p.id, p.off);
      }
      b.text = el.textContent;
      if (!b.text && !el.querySelector('br')) { fill(el, ''); setSel(b.id, 0); }
      applyType(el, b);
    }
    if (b) { curId = b.id; if (autoDetect(b)) return; }
    changed(structural);
    updateSuggestions();
  }

  function onPaste(e) {
    e.preventDefault();
    let s = getSel();
    if (!s) return;
    const raw = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    const text = raw.replace(/\r\n?/g, '\n');
    if (!text) return;
    const p = s.collapsed ? { id: s.startId, off: s.startOff } : deleteSelection(s);
    if (!text.trim().includes('\n')) { insertTextAt(p, text.replace(/\n/g, ' ')); return; }
    const parsed = Formats.parseFountain(text, { titlePage: false }).blocks;
    if (parsed.length) insertBlocks(p, parsed);
  }

  function onCopy(e, cut) {
    const s = getSel();
    if (!s || s.collapsed) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectionText(s));
    if (cut) deleteSelection(s);
  }

  function init() {
    page = U.$('#page');
    paper = U.$('#paper');
    elbar = U.$('#elbar');
    hintEl = U.$('#hint');
    statsEl = U.$('#stats');
    sceneList = U.$('#scene-list');
    charList = U.$('#char-list');
    page.contentEditable = CE_MODE;
    page.spellcheck = true;
    page.setAttribute('role', 'textbox');
    page.setAttribute('aria-multiline', 'true');
    page.setAttribute('aria-label', 'Copione');
    typeTag = h('button', {
      class: 'type-tag', type: 'button', hidden: true, title: 'Cambia tipo, elimina, duplica o sposta questa riga',
      onmousedown: noFocusSteal, onclick: (e) => openLineMenu(e.currentTarget, true)
    }, h('span'), h('span', { class: 'type-caret' }, '▾'));
    acBox = h('div', { class: 'ac', hidden: true, role: 'listbox' });
    extBox = h('div', { class: 'ext-chips', hidden: true },
      EXTENSIONS.map((x) => h('button', { type: 'button', dataset: { ext: x }, title: 'Estensione ' + x, onmousedown: noFocusSteal, onclick: () => toggleExtension(x) }, x)));
    paper.append(typeTag, acBox, extBox);
    buildBar();

    page.addEventListener('keydown', onKeydown);
    page.addEventListener('beforeinput', onBeforeInput);
    page.addEventListener('input', onInput);
    page.addEventListener('paste', onPaste);
    page.addEventListener('copy', (e) => onCopy(e, false));
    page.addEventListener('cut', (e) => onCopy(e, true));
    page.addEventListener('dragstart', (e) => e.preventDefault());
    page.addEventListener('drop', (e) => e.preventDefault());
    page.addEventListener('focus', onSelChange);
    page.addEventListener('blur', () => {
      setTimeout(() => {
        if (isFocused()) return;
        ac.items = [];
        renderSuggestions();
        if (!typeTag.matches(':hover')) typeTag.hidden = true;
        U.$$('.el.focused', page).forEach((x) => x.classList.remove('focused'));
      }, 0);
    });
    document.addEventListener('selectionchange', () => { if (isFocused()) onSelChangeSoon(); });

    // clic sul margine del foglio: porta il cursore sulla riga più vicina
    paper.addEventListener('mousedown', (e) => {
      if (e.target !== paper) return;
      const kids = page.children;
      if (!kids.length) return;
      e.preventDefault();
      let target = null;
      for (const el of kids) { if (e.clientY < el.getBoundingClientRect().bottom + 6) { target = el; break; } }
      if (!target) target = kids[kids.length - 1];
      const r = target.getBoundingClientRect();
      const off = offsetFromPoint(target, U.clamp(e.clientX, r.left + 1, r.right - 1), U.clamp(e.clientY, r.top + 2, r.bottom - 2));
      focusBlock(target.dataset.id, off == null ? (e.clientX < r.left ? 0 : 'end') : off);
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
    window.addEventListener('resize', () => onSelChange());
  }

  window.Ciak.Editor = {
    TYPES, TYPE, init, render, show, invalidate, focusBlock, getScenes, appendScene, setBlockText,
    undo, redo, characterNames, estimate, fmtPages, renumber, refreshSide, resetHistory,
    blocks, commitHistory, deleteScene, selectScene
  };
})();
