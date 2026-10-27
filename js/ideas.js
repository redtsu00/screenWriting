/* Ciak — bacheca Idee & Scene */
(function () {
  'use strict';
  const { U, Store, Cards } = window.Ciak;
  const { h } = U;

  let board, search;
  const ADD_LABEL = { idea: 'Nuova idea', scene: 'Nuova scena', character: 'Nuovo personaggio', note: 'Nuova nota' };

  function cardEl(c, nums) {
    const num = Cards.sceneNumber(c, nums);
    const links = Store.project.edges.filter((e) => e.from === c.id || e.to === c.id).length;
    let badge = null;
    if (c.type === 'scene') badge = num ? h('span', { class: 'badge' }, 'Sc. ' + num) : h('span', { class: 'badge muted' }, 'Da scrivere');
    return h('article', {
      class: 'card c-' + (c.color || 'none'), dataset: { id: c.id }, tabindex: '0',
      onclick: (e) => { if (!e.target.closest('.grip')) Cards.edit(c.id, { onChange: render }); },
      onkeydown: (e) => { if (e.key === 'Enter') Cards.edit(c.id, { onChange: render }); }
    },
    h('button', { class: 'grip', type: 'button', title: 'Trascina per spostare', 'aria-label': 'Sposta' }, U.icon('grip', 16)),
    badge ? h('div', { class: 'card-top' }, badge) : null,
    h('div', { class: 'card-title' }, Cards.displayTitle(c)),
    c.text ? h('div', { class: 'card-text' }, c.text) : null,
    links ? h('div', { class: 'card-foot' }, U.icon('link', 13), `${links} collegament${links === 1 ? 'o' : 'i'}`) : null);
  }

  function addCard(type) {
    const c = Cards.create(type);
    render();
    Cards.edit(c.id, { isNew: true, onChange: render });
  }

  function render() {
    if (!board) return;
    const scrollLeft = board.scrollLeft;
    const q = search.value.trim().toLowerCase();
    const nums = Cards.sceneNumbers();
    board.textContent = '';
    for (const t of Cards.TYPES) {
      const all = Store.project.cards.filter((c) => c.type === t.id);
      const shown = q ? all.filter((c) => (Cards.displayTitle(c) + ' ' + c.text).toLowerCase().includes(q)) : all;
      const list = h('div', { class: 'col-list', dataset: { type: t.id } }, shown.map((c) => cardEl(c, nums)));
      if (!shown.length) list.appendChild(h('div', { class: 'col-empty' }, q ? 'Nessun risultato' : t.empty));
      board.appendChild(h('section', { class: 'col col-' + t.id },
        h('header', { class: 'col-head' },
          h('span', { class: 'col-dot' }),
          h('h2', null, t.plural),
          h('span', { class: 'col-count' }, all.length),
          h('button', { class: 'icon-btn small', type: 'button', title: 'Aggiungi ' + t.label.toLowerCase(), onclick: () => addCard(t.id) }, U.icon('plus', 16))),
        list,
        h('button', { class: 'col-add', type: 'button', onclick: () => addCard(t.id) }, U.icon('plus', 15), ADD_LABEL[t.id])));
    }
    board.scrollLeft = scrollLeft;
  }

  function onDrop(id, listEl, beforeId) {
    const cards = Store.project.cards;
    const c = cards.find((x) => x.id === id);
    if (!c || !listEl) return render();
    const type = listEl.dataset.type;
    cards.splice(cards.indexOf(c), 1);
    if (c.type !== type) {
      c.type = type;
      if (type !== 'scene') delete c.sceneId;
    }
    let at = beforeId ? cards.findIndex((x) => x.id === beforeId) : -1;
    if (at < 0) {
      let last = -1;
      cards.forEach((x, i) => { if (x.type === type) last = i; });
      at = last >= 0 ? last + 1 : cards.length;
    }
    cards.splice(at, 0, c);
    Store.touch();
    render();
  }

  function importScenes() {
    const r = Cards.importScenes();
    render();
    if (!r.total) U.toast('Il copione non ha ancora scene da importare.');
    else U.toast(r.created.length ? `Importate ${r.created.length} scen${r.created.length === 1 ? 'a' : 'e'} dal copione.` : 'Tutte le scene del copione hanno già una scheda.');
  }

  function init() {
    board = U.$('#board');
    search = U.$('#ideas-search');
    search.addEventListener('input', U.debounce(render, 150));
    U.$('#ideas-import').addEventListener('click', importScenes);
    U.$('#ideas-add').addEventListener('click', () => addCard('idea'));
    window.Ciak.Sortable(board, { item: '.card', handle: '.grip', list: '.col-list', scrollX: board, onDrop });
  }

  window.Ciak.Ideas = { init, show: render, render };
})();
