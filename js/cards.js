/* Ciak — schede (idee, scene, personaggi, note) e collegamenti */
(function () {
  'use strict';
  const { U, Store } = window.Ciak;
  const { h } = U;

  const TYPES = [
    { id: 'idea', label: 'Idea', plural: 'Idee', ph: 'La tua idea…', empty: 'Annota qui spunti, temi, "e se…?".' },
    { id: 'scene', label: 'Scena', plural: 'Scene', ph: 'Titolo della scena (es. INT. CUCINA - NOTTE)', empty: 'Pianifica le scene prima di scriverle, o importale dal copione.' },
    { id: 'character', label: 'Personaggio', plural: 'Personaggi', ph: 'Nome del personaggio', empty: 'I personaggi che crei qui vengono suggeriti mentre scrivi.' },
    { id: 'note', label: 'Nota', plural: 'Note', ph: 'Titolo della nota', empty: 'Ricerche, riferimenti, cose da ricordare.' }
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const COLORS = [
    { id: '', name: 'Nessuno' }, { id: 'red', name: 'Rosso' }, { id: 'orange', name: 'Arancione' },
    { id: 'yellow', name: 'Giallo' }, { id: 'green', name: 'Verde' }, { id: 'blue', name: 'Blu' },
    { id: 'purple', name: 'Viola' }, { id: 'pink', name: 'Rosa' }
  ];

  const p = () => Store.project;
  const find = (id) => p().cards.find((c) => c.id === id);
  const blockOf = (c) => c.sceneId ? p().blocks.find((b) => b.id === c.sceneId && b.type === 'scene') : null;

  function displayTitle(c) {
    const b = blockOf(c);
    if (b) {
      const t = b.text.trim().toUpperCase();
      if (t) c.title = t;
      return t || 'Scena senza titolo';
    }
    return c.title || (c.sceneId ? 'Scena rimossa dal copione' : 'Senza titolo');
  }

  function sceneNumbers() {
    const map = {};
    let n = 0;
    p().blocks.forEach((b) => { if (b.type === 'scene') map[b.id] = ++n; });
    return map;
  }
  function sceneNumber(c, map) {
    if (!c.sceneId) return 0;
    return (map || sceneNumbers())[c.sceneId] || 0;
  }

  function create(type, props) {
    const c = Object.assign({ id: U.uid(), type, title: '', text: '', color: type === 'idea' ? 'yellow' : '' }, props || {});
    p().cards.push(c);
    Store.touch();
    return c;
  }

  function remove(id) {
    p().cards = p().cards.filter((c) => c.id !== id);
    p().edges = p().edges.filter((e) => e.from !== id && e.to !== id);
    Store.touch();
  }

  function link(from, to, label) {
    if (!from || !to || from === to) return null;
    const ex = p().edges.find((e) => e.from === from && e.to === to);
    if (ex) return ex;
    const e = { id: U.uid(), from, to, label: label || '' };
    p().edges.push(e);
    Store.touch();
    return e;
  }

  function unlink(edgeId) {
    p().edges = p().edges.filter((e) => e.id !== edgeId);
    Store.touch();
  }

  // Crea una scheda per ogni scena del copione che non ne ha ancora una
  function importScenes() {
    const scenes = window.Ciak.Editor.getScenes();
    const cards = p().cards;
    const bySceneId = new Map(cards.filter((c) => c.sceneId).map((c) => [c.sceneId, c]));
    const hadPositions = cards.some((c) => c.x != null);
    const created = [];
    const ordered = scenes.filter((s) => s.text || bySceneId.has(s.id)).map((s) => {
      let c = bySceneId.get(s.id);
      if (!c) {
        const syn = s.synopsis.length > 180 ? s.synopsis.slice(0, 177).trim() + '…' : s.synopsis;
        c = { id: U.uid(), type: 'scene', title: s.text.toUpperCase(), text: syn, color: 'blue', sceneId: s.id };
        cards.push(c);
        created.push(c);
      }
      return c;
    });
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1], b = ordered[i];
      if (!created.includes(a) && !created.includes(b)) continue;
      const exists = p().edges.some((e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id));
      if (!exists) p().edges.push({ id: U.uid(), from: a.id, to: b.id, label: '' });
    }
    if (created.length) Store.touch();
    return { created, ordered, hadPositions, total: ordered.length };
  }

  function openInScript(c) {
    const App = window.Ciak.App;
    App.show('script');
    requestAnimationFrame(() => window.Ciak.Editor.focusBlock(c.sceneId, 'end', { center: true }));
  }

  // Aggiunge la scena in fondo al copione. Se il titolo della scheda non è già
  // un'intestazione (INT./EST.…) lo sposta nella descrizione e lascia da completare "INT. "
  function writeInScript(c) {
    const Editor = window.Ciak.Editor;
    const title = (c.title || '').trim();
    const isHeading = window.Ciak.Formats.SCENE_RE.test(title);
    if (!isHeading && title && !c.text.startsWith(title)) c.text = title + (c.text ? '\n' + c.text : '');
    c.sceneId = Editor.appendScene(isHeading ? title.toUpperCase() : 'INT. ');
    Store.touch();
    window.Ciak.App.show('script');
    requestAnimationFrame(() => {
      const bl = Editor.blocks();
      const next = bl[bl.findIndex((b) => b.id === c.sceneId) + 1];
      if (isHeading && next) Editor.focusBlock(next.id, 'end', { center: true });
      else {
        Editor.focusBlock(c.sceneId, 'end', { center: true });
        U.toast('Scena aggiunta in fondo al copione: completa luogo e momento.');
      }
    });
  }

  /* ---------- finestra di modifica scheda ---------- */

  function edit(id, opts = {}) {
    const c = find(id);
    if (!c) return;
    const App = window.Ciak.App;
    const onChange = () => { Store.touch(); if (opts.onChange) opts.onChange(); };

    const titleIn = h('input', { class: 'input input-title', type: 'text', value: displayTitle(c), placeholder: TYPE[c.type].ph, 'aria-label': 'Titolo' });
    const textIn = h('textarea', { class: 'input', rows: '5', placeholder: 'Descrizione, appunti, cosa succede…', 'aria-label': 'Descrizione' });
    textIn.value = c.text || '';

    titleIn.addEventListener('input', () => {
      const b = blockOf(c);
      if (b) window.Ciak.Editor.setBlockText(b.id, titleIn.value);
      c.title = titleIn.value;
      onChange();
    });
    textIn.addEventListener('input', () => { c.text = textIn.value; autoGrow(); onChange(); });
    const autoGrow = () => { textIn.style.height = 'auto'; textIn.style.height = Math.min(textIn.scrollHeight + 2, 320) + 'px'; };

    const typeSeg = h('div', { class: 'seg' }, TYPES.map((t) => h('button', {
      type: 'button', class: c.type === t.id ? 'on' : '', dataset: { type: t.id },
      onclick: () => {
        c.type = t.id;
        if (t.id !== 'scene') delete c.sceneId;
        U.$$('button', typeSeg).forEach((b) => b.classList.toggle('on', b.dataset.type === t.id));
        titleIn.placeholder = t.ph;
        renderScene();
        onChange();
      }
    }, t.label)));

    const swatches = h('div', { class: 'swatches' }, COLORS.map((col) => h('button', {
      type: 'button', class: 'swatch c-' + (col.id || 'none') + (c.color === col.id || (!c.color && !col.id) ? ' on' : ''),
      title: col.name, 'aria-label': col.name, dataset: { color: col.id },
      onclick: () => {
        c.color = col.id;
        U.$$('.swatch', swatches).forEach((s) => s.classList.toggle('on', s.dataset.color === col.id));
        onChange();
      }
    })));

    // collegamento al copione (solo scene)
    const sceneBox = h('div', { class: 'field' });
    function renderScene() {
      sceneBox.textContent = '';
      sceneBox.hidden = c.type !== 'scene';
      if (c.type !== 'scene') return;
      const scenes = window.Ciak.Editor.getScenes();
      const used = new Set(p().cards.filter((x) => x.sceneId && x.id !== c.id).map((x) => x.sceneId));
      const sel = h('select', { class: 'input', 'aria-label': 'Scena del copione' },
        h('option', { value: '' }, '— Non ancora nel copione —'),
        scenes.map((s) => h('option', { value: s.id, selected: s.id === c.sceneId, disabled: used.has(s.id) && s.id !== c.sceneId },
          `${s.num}. ${(s.text || 'Scena senza titolo').toUpperCase()}`)));
      sel.addEventListener('change', () => {
        if (sel.value) c.sceneId = sel.value; else delete c.sceneId;
        titleIn.value = displayTitle(c);
        renderScene();
        onChange();
      });
      const linked = !!blockOf(c);
      U.append(sceneBox,
        h('label', { class: 'label' }, 'Nel copione'),
        h('div', { class: 'row' }, sel,
          linked
            ? h('button', { class: 'btn', type: 'button', onclick: () => { sheet.close(); openInScript(c); } }, U.icon('file', 16), 'Apri')
            : h('button', { class: 'btn primary', type: 'button', onclick: () => { sheet.close(); writeInScript(c); } }, U.icon('pen', 16), 'Scrivi nel copione')),
        linked ? h('div', { class: 'help' }, 'Il titolo è l\'intestazione della scena: se lo modifichi qui cambia anche nel copione.') : null
      );
    }
    renderScene();

    // collegamenti nel flow chart
    const linksBox = h('div', { class: 'field' });
    function renderLinks() {
      linksBox.textContent = '';
      const outs = p().edges.filter((e) => e.from === c.id);
      const ins = p().edges.filter((e) => e.to === c.id);
      const row = (e, dir) => {
        const other = find(dir === 'out' ? e.to : e.from);
        if (!other) return null;
        return h('li', { class: 'link-row' },
          h('span', { class: 'link-dir' }, dir === 'out' ? '→' : '←'),
          h('span', { class: 'link-title' }, displayTitle(other)),
          e.label ? h('span', { class: 'link-label' }, e.label) : null,
          h('button', { class: 'icon-btn small', type: 'button', title: 'Rimuovi collegamento', onclick: () => { unlink(e.id); renderLinks(); onChange(); } }, U.icon('x', 14)));
      };
      const others = p().cards.filter((x) => x.id !== c.id && !outs.some((e) => e.to === x.id));
      const add = h('select', { class: 'input', 'aria-label': 'Collega a' },
        h('option', { value: '' }, '+ Collega a…'),
        TYPES.map((t) => {
          const group = others.filter((x) => x.type === t.id);
          return group.length ? h('optgroup', { label: t.plural }, group.map((x) => h('option', { value: x.id }, displayTitle(x)))) : null;
        }));
      add.addEventListener('change', () => { if (add.value) { link(c.id, add.value); renderLinks(); onChange(); } });
      U.append(linksBox,
        h('label', { class: 'label' }, 'Collegamenti nel flow chart'),
        outs.length || ins.length ? h('ul', { class: 'link-list' }, outs.map((e) => row(e, 'out')), ins.map((e) => row(e, 'in'))) : h('div', { class: 'help' }, 'Nessun collegamento. Indica quale scena o idea viene dopo questa.'),
        add
      );
    }
    renderLinks();

    const body = h('div', { class: 'card-editor' },
      h('div', { class: 'field' }, typeSeg),
      h('div', { class: 'field' }, titleIn),
      h('div', { class: 'field' }, textIn),
      h('div', { class: 'field' }, h('label', { class: 'label' }, 'Colore'), swatches),
      sceneBox,
      linksBox
    );

    const sheet = App.sheet({
      title: opts.isNew ? 'Nuova scheda' : 'Modifica scheda',
      body,
      actions: [
        { label: 'Elimina', kind: 'danger-text', left: true, onClick: async (close) => {
          if ((c.title.trim() || c.text.trim()) && !(await App.confirm({ title: 'Eliminare la scheda?', message: `«${displayTitle(c)}» e i suoi collegamenti verranno eliminati.`, ok: 'Elimina', danger: true }))) return;
          remove(c.id);
          close();
        } },
        { label: 'Fatto', kind: 'primary', onClick: (close) => close() }
      ],
      onClose: () => {
        if (find(c.id) && opts.isNew && !c.title.trim() && !c.text.trim() && !c.sceneId) remove(c.id);
        if (opts.onChange) opts.onChange();
      }
    });
    requestAnimationFrame(() => { autoGrow(); if (opts.isNew || !U.isTouch()) titleIn.focus(); });
  }

  window.Ciak.Cards = { TYPES, TYPE, COLORS, find, create, remove, link, unlink, displayTitle, sceneNumber, sceneNumbers, importScenes, edit, openInScript, writeInScript };
})();
