/* Ciak — flow chart delle scene */
(function () {
  'use strict';
  const { U, Store, Cards } = window.Ciak;
  const { h } = U;

  const NODE_W = 220;
  const GAP_X = 60, GAP_Y = 70;
  const SVGNS = 'http://www.w3.org/2000/svg';

  let root, canvas, world, svg, gEdges, nodesLayer, labelsLayer, tempSvg, tempPath, selbar, zoomVal, onlyScenes, emptyBox;
  let view = { x: 40, y: 40, k: 1 };
  let sel = null;            // { kind: 'node' | 'edge', id }
  let connectFrom = null;    // modalità "Collega": id della scheda di partenza
  const sizes = new Map();
  const pointers = new Map();
  let gesture = null;
  let lastTap = { id: null, t: 0 };
  let shownFor = null;

  const proj = () => Store.project;
  const visible = () => proj().cards.filter((c) => !onlyScenes.checked || c.type === 'scene');
  const findCard = (id) => proj().cards.find((c) => c.id === id);

  /* ---------- disegno ---------- */

  function nodeEl(c, nums) {
    const num = Cards.sceneNumber(c, nums);
    const isSel = sel && sel.kind === 'node' && sel.id === c.id;
    return h('div', {
      class: 'node t-' + c.type + ' c-' + (c.color || 'none') + (isSel ? ' selected' : '') + (connectFrom === c.id ? ' connecting' : ''),
      dataset: { id: c.id }, style: { left: c.x + 'px', top: c.y + 'px' }
    },
    h('div', { class: 'node-type' }, Cards.TYPE[c.type].label + (num ? ' · Sc. ' + num : (c.type === 'scene' ? ' · da scrivere' : ''))),
    h('div', { class: 'node-title' }, Cards.displayTitle(c)),
    c.text ? h('div', { class: 'node-text' }, c.text) : null,
    h('div', { class: 'node-handle', title: 'Trascina su un\'altra scheda per collegarle' }, h('span')));
  }

  function render() {
    const cards = visible();
    const needsLayout = cards.length && !proj().cards.some((c) => c.x != null);
    placeMissing(cards);
    nodesLayer.textContent = '';
    const nums = Cards.sceneNumbers();
    for (const c of cards) nodesLayer.appendChild(nodeEl(c, nums));
    measure();
    if (needsLayout) {
      layout(false);
      for (const el of nodesLayer.children) {
        const c = findCard(el.dataset.id);
        el.style.left = c.x + 'px';
        el.style.top = c.y + 'px';
      }
      fit();
    }
    renderEdges();
    applyView();
    updateSelbar();
    emptyBox.hidden = proj().cards.length > 0;
  }

  function measure() {
    sizes.clear();
    for (const el of nodesLayer.children) sizes.set(el.dataset.id, { w: el.offsetWidth || NODE_W, h: el.offsetHeight || 90 });
  }

  function placeMissing(cards) {
    const placed = proj().cards.filter((c) => c.x != null);
    if (!placed.length) { cards.forEach((c) => { c.x = 0; c.y = 0; }); return; }
    const maxX = Math.max(...placed.map((c) => c.x));
    const minY = Math.min(...placed.map((c) => c.y));
    let k = 0;
    cards.forEach((c) => {
      if (c.x != null) return;
      c.x = maxX + NODE_W + GAP_X;
      c.y = minY + (k++) * 150;
    });
  }

  function rectOf(c) {
    const s = sizes.get(c.id) || { w: NODE_W, h: 90 };
    return { x: c.x, y: c.y, w: s.w, h: s.h, cx: c.x + s.w / 2, cy: c.y + s.h / 2 };
  }

  function edgeGeom(a, b) {
    const A = rectOf(a), B = rectOf(b);
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    const vGap = dy > 0 ? B.y - (A.y + A.h) : A.y - (B.y + B.h);
    const hGap = dx > 0 ? B.x - (A.x + A.w) : A.x - (B.x + B.w);
    let p0, p3, c1, c2;
    if (vGap > 16 && (vGap >= hGap || hGap < 16)) {
      const s = dy > 0 ? 1 : -1;
      p0 = { x: A.cx, y: s > 0 ? A.y + A.h : A.y };
      p3 = { x: B.cx, y: s > 0 ? B.y : B.y + B.h };
      const k = Math.max(28, Math.abs(p3.y - p0.y) / 2);
      c1 = { x: p0.x, y: p0.y + s * k };
      c2 = { x: p3.x, y: p3.y - s * k };
    } else {
      const s = dx >= 0 ? 1 : -1;
      p0 = { x: s > 0 ? A.x + A.w : A.x, y: A.cy };
      p3 = { x: s > 0 ? B.x : B.x + B.w, y: B.cy };
      const k = Math.max(28, Math.abs(p3.x - p0.x) / 2);
      c1 = { x: p0.x + s * k, y: p0.y };
      c2 = { x: p3.x - s * k, y: p3.y };
    }
    const mid = {
      x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
      y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8
    };
    return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`, mid };
  }

  function renderEdges() {
    const cards = new Map(visible().map((c) => [c.id, c]));
    const edges = proj().edges.filter((e) => cards.has(e.from) && cards.has(e.to));
    let minX = 0, minY = 0, maxX = 1, maxY = 1;
    cards.forEach((c) => {
      const r = rectOf(c);
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    });
    const pad = 200;
    svg.style.left = (minX - pad) + 'px';
    svg.style.top = (minY - pad) + 'px';
    svg.setAttribute('width', maxX - minX + pad * 2);
    svg.setAttribute('height', maxY - minY + pad * 2);
    gEdges.setAttribute('transform', `translate(${pad - minX} ${pad - minY})`);
    let html = '';
    labelsLayer.textContent = '';
    for (const e of edges) {
      const g = edgeGeom(cards.get(e.from), cards.get(e.to));
      const isSel = sel && sel.kind === 'edge' && sel.id === e.id;
      html += `<path class="edge-hit" data-id="${e.id}" d="${g.d}"/>` +
        `<path class="edge${isSel ? ' sel' : ''}" d="${g.d}" marker-end="url(#flow-arrow${isSel ? '-sel' : ''})"/>`;
      if (e.label) {
        labelsLayer.appendChild(h('div', {
          class: 'edge-label' + (isSel ? ' sel' : ''), dataset: { id: e.id },
          style: { left: g.mid.x + 'px', top: g.mid.y + 'px' }
        }, e.label));
      }
    }
    gEdges.innerHTML = html;
  }

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
    canvas.style.backgroundSize = `${24 * view.k}px ${24 * view.k}px`;
    zoomVal.textContent = Math.round(view.k * 100) + '%';
    proj().flowView = { x: view.x, y: view.y, k: view.k };
    Store._saveSoon();
  }

  /* ---------- disposizione automatica ---------- */

  function layout(touch = true) {
    const cards = visible();
    if (!cards.length) return;
    measure();
    const ids = new Set(cards.map((c) => c.id));
    const edges = proj().edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
    const out = new Map(), inc = new Map();
    cards.forEach((c) => { out.set(c.id, []); inc.set(c.id, []); });
    edges.forEach((e) => { out.get(e.from).push(e.to); inc.get(e.to).push(e.from); });
    const nums = Cards.sceneNumbers();
    const order = new Map(cards.map((c, i) => [c.id, nums[c.sceneId] || 1000 + i]));
    const connected = cards.filter((c) => out.get(c.id).length || inc.get(c.id).length)
      .sort((a, b) => order.get(a.id) - order.get(b.id));
    const isolated = cards.filter((c) => !out.get(c.id).length && !inc.get(c.id).length);

    // elimina i cicli (archi all'indietro) con una visita in profondità
    const state = new Map(), back = new Set();
    const dfs = (id) => {
      state.set(id, 1);
      for (const t of out.get(id)) {
        if (state.get(t) === 1) back.add(id + '>' + t);
        else if (!state.get(t)) dfs(t);
      }
      state.set(id, 2);
    };
    connected.filter((c) => !inc.get(c.id).length).forEach((c) => { if (!state.get(c.id)) dfs(c.id); });
    connected.forEach((c) => { if (!state.get(c.id)) dfs(c.id); });

    // livelli = percorso più lungo dalle radici
    const indeg = new Map(connected.map((c) => [c.id, 0]));
    const dag = new Map(connected.map((c) => [c.id, []]));
    edges.forEach((e) => {
      if (back.has(e.from + '>' + e.to)) return;
      dag.get(e.from).push(e.to);
      indeg.set(e.to, indeg.get(e.to) + 1);
    });
    const rank = new Map();
    const queue = connected.filter((c) => indeg.get(c.id) === 0).map((c) => c.id);
    queue.forEach((id) => rank.set(id, 0));
    while (queue.length) {
      const id = queue.shift();
      for (const t of dag.get(id)) {
        rank.set(t, Math.max(rank.get(t) || 0, rank.get(id) + 1));
        indeg.set(t, indeg.get(t) - 1);
        if (indeg.get(t) === 0) queue.push(t);
      }
    }
    const layers = [];
    connected.forEach((c) => { const r = rank.get(c.id) || 0; (layers[r] = layers[r] || []).push(c.id); });

    const xc = new Map();
    let y = 0;
    const step = NODE_W + GAP_X;
    layers.forEach((layer) => {
      if (!layer) return;
      const bary = (id) => {
        const ps = inc.get(id).filter((p) => xc.has(p));
        return ps.length ? ps.reduce((s, p) => s + xc.get(p), 0) / ps.length : Infinity;
      };
      layer.sort((a, b) => {
        const ba = bary(a), bb = bary(b);
        if (ba !== bb) return ba === Infinity ? 1 : bb === Infinity ? -1 : ba - bb;
        return order.get(a) - order.get(b);
      });
      const n = layer.length;
      let maxH = 0;
      layer.forEach((id, i) => {
        xc.set(id, (i - (n - 1) / 2) * step);
        const c = findCard(id);
        c.x = xc.get(id) - NODE_W / 2;
        c.y = y;
        maxH = Math.max(maxH, (sizes.get(id) || { h: 90 }).h);
      });
      y += maxH + GAP_Y;
    });

    // schede isolate: una colonna per tipo, a destra del flusso
    let colX = connected.length ? Math.max(...connected.map((c) => c.x)) + NODE_W + GAP_X * 2 : 0;
    for (const t of Cards.TYPES) {
      const group = isolated.filter((c) => c.type === t.id);
      if (!group.length) continue;
      let cy = 0;
      group.forEach((c) => {
        c.x = colX;
        c.y = cy;
        cy += (sizes.get(c.id) || { h: 90 }).h + 24;
      });
      colX += NODE_W + GAP_X;
    }
    if (touch) Store.touch();
  }

  function fit() {
    const cards = visible();
    const r = canvas.getBoundingClientRect();
    if (!cards.length || !r.width) { view = { x: 40, y: 40, k: 1 }; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach((c) => {
      const b = rectOf(c);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    });
    const pad = U.isMobile() ? 20 : 48;
    const k = U.clamp(Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2 - 60) / (maxY - minY)), U.isMobile() ? 0.5 : 0.3, 1.1);
    view.k = k;
    const w = (maxX - minX) * k;
    view.x = (w <= r.width - pad * 2 ? (r.width - w) / 2 : pad) - minX * k;
    view.y = pad - minY * k;
    applyView();
  }

  function zoomAt(k, sx, sy) {
    const nk = U.clamp(k, 0.2, 2.5);
    view.x = sx - (sx - view.x) * nk / view.k;
    view.y = sy - (sy - view.y) * nk / view.k;
    view.k = nk;
    applyView();
  }

  function zoomBy(f) {
    const r = canvas.getBoundingClientRect();
    zoomAt(view.k * f, r.width / 2, r.height / 2);
  }

  /* ---------- selezione e azioni ---------- */

  function select(s) {
    sel = s;
    connectFrom = null;
    U.$$('.node', nodesLayer).forEach((n) => {
      n.classList.toggle('selected', !!s && s.kind === 'node' && n.dataset.id === s.id);
      n.classList.remove('connecting');
    });
    renderEdges();
    updateSelbar();
  }

  function updateSelbar() {
    selbar.textContent = '';
    selbar.hidden = true;
    if (connectFrom) {
      const c = findCard(connectFrom);
      U.append(selbar,
        h('span', { class: 'selbar-msg' }, 'Tocca la scheda da collegare dopo «', h('b', null, c ? Cards.displayTitle(c) : ''), '»'),
        h('button', { class: 'btn', type: 'button', onclick: () => { connectFrom = null; render(); } }, 'Annulla'));
      selbar.hidden = false;
      return;
    }
    if (!sel) return;
    if (sel.kind === 'node') {
      const c = findCard(sel.id);
      if (!c) { sel = null; return; }
      U.append(selbar,
        h('button', { class: 'btn', type: 'button', onclick: () => editCard(c.id) }, U.icon('edit', 16), 'Modifica'),
        h('button', { class: 'btn', type: 'button', onclick: () => { connectFrom = c.id; render(); } }, U.icon('link', 16), 'Collega'),
        h('button', { class: 'btn', type: 'button', onclick: () => { const d = Cards.duplicate(c.id); sel = d ? { kind: 'node', id: d.id } : null; render(); } }, U.icon('copy', 16), 'Duplica'),
        c.type === 'scene'
          ? (c.sceneId && proj().blocks.some((b) => b.id === c.sceneId)
            ? h('button', { class: 'btn', type: 'button', onclick: () => Cards.openInScript(c) }, U.icon('file', 16), 'Apri nel copione')
            : h('button', { class: 'btn', type: 'button', onclick: () => Cards.writeInScript(c) }, U.icon('pen', 16), 'Scrivi'))
          : null,
        h('button', { class: 'btn danger-text', type: 'button', onclick: () => deleteSelection() }, U.icon('trash', 16), 'Elimina'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Chiudi', onclick: () => select(null) }, U.icon('x', 16)));
    } else {
      const e = proj().edges.find((x) => x.id === sel.id);
      if (!e) { sel = null; return; }
      const input = h('input', { class: 'input', type: 'text', value: e.label, placeholder: 'Etichetta (es. "se scende")', 'aria-label': 'Etichetta collegamento' });
      input.addEventListener('input', () => { e.label = input.value; Store.touch(); renderEdges(); });
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === 'Escape') { input.blur(); select(null); } });
      U.append(selbar, input,
        h('button', { class: 'btn', type: 'button', title: 'Inverti direzione', onclick: () => { [e.from, e.to] = [e.to, e.from]; Store.touch(); renderEdges(); } }, U.icon('swap', 16), 'Inverti'),
        h('button', { class: 'btn danger-text', type: 'button', onclick: () => deleteSelection() }, U.icon('trash', 16), 'Elimina'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Chiudi', onclick: () => select(null) }, U.icon('x', 16)));
    }
    selbar.hidden = false;
  }

  function deleteSelection() {
    if (!sel) return;
    if (sel.kind === 'node') Cards.remove(sel.id);
    else Cards.unlink(sel.id, { undo: true });
    sel = null;
    render();
  }

  function editCard(id) {
    Cards.edit(id, { onChange: render });
  }

  function addCard(type) {
    const r = canvas.getBoundingClientRect();
    const c = Cards.create(type, {
      x: Math.round((r.width / 2 - view.x) / view.k - NODE_W / 2),
      y: Math.round((r.height / 2 - view.y) / view.k - 50)
    });
    render();
    select({ kind: 'node', id: c.id });
    Cards.edit(c.id, { isNew: true, onChange: render });
  }

  function importScenes() {
    const r = Cards.importScenes();
    if (!r.total) { U.toast('Il copione non ha ancora scene da importare.'); return; }
    if (!r.created.length) { U.toast('Tutte le scene del copione sono già nel flow chart.'); return; }
    if (!r.hadPositions) { render(); return; }
    // posiziona le nuove schede sotto la scena precedente
    render();
    measure();
    r.ordered.forEach((c, i) => {
      if (!r.created.includes(c)) return;
      const prev = r.ordered[i - 1];
      if (prev) {
        const pr = rectOf(prev);
        c.x = prev.x;
        c.y = pr.y + pr.h + GAP_Y;
      }
    });
    render();
    U.toast(`Aggiunte ${r.created.length} scen${r.created.length === 1 ? 'a' : 'e'} al flow chart.`);
  }

  /* ---------- puntatore: trascina, collega, sposta, zoom ---------- */

  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    if (e.target.closest('.flow-zoom')) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...view } };
      return;
    }
    if (pointers.size > 2) return;
    const p = local(e);
    const handle = e.target.closest('.node-handle');
    const node = e.target.closest('.node');
    const edgeHit = e.target.closest('.edge-hit, .edge-label');
    if (handle && node) {
      gesture = { type: 'connect', from: node.dataset.id, start: p };
      e.preventDefault();
    } else if (node && e.button === 0) {
      const c = findCard(node.dataset.id);
      gesture = { type: 'node', id: c.id, el: node, start: p, orig: { x: c.x, y: c.y }, moved: false };
    } else if (edgeHit) {
      gesture = { type: 'edge', id: edgeHit.dataset.id };
    } else {
      gesture = { type: 'pan', start: p, orig: { x: view.x, y: view.y }, moved: false };
    }
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = gesture;
      const k = U.clamp(g.view.k * dist / g.dist, 0.2, 2.5);
      const wx = (g.mid.x - g.view.x) / g.view.k, wy = (g.mid.y - g.view.y) / g.view.k;
      view = { k, x: mid.x - wx * k, y: mid.y - wy * k };
      applyView();
    } else if (gesture.type === 'pan') {
      const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) gesture.moved = true;
      view.x = gesture.orig.x + dx;
      view.y = gesture.orig.y + dy;
      applyView();
      canvas.classList.toggle('panning', gesture.moved);
    } else if (gesture.type === 'node') {
      const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      gesture.moved = true;
      const c = findCard(gesture.id);
      c.x = Math.round(gesture.orig.x + dx / view.k);
      c.y = Math.round(gesture.orig.y + dy / view.k);
      gesture.el.style.left = c.x + 'px';
      gesture.el.style.top = c.y + 'px';
      gesture.el.classList.add('dragging');
      renderEdges();
    } else if (gesture.type === 'connect') {
      const from = findCard(gesture.from);
      const r = rectOf(from);
      const sx = (r.cx) * view.k + view.x, sy = (r.y + r.h) * view.k + view.y;
      const k = Math.max(30, Math.abs(p.y - sy) / 2);
      tempPath.setAttribute('d', `M${sx},${sy} C${sx},${sy + k} ${p.x},${p.y - k} ${p.x},${p.y}`);
      tempSvg.hidden = false;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const target = over && over.closest('.node');
      U.$$('.node.drop-target', nodesLayer).forEach((n) => { if (n !== target) n.classList.remove('drop-target'); });
      if (target && target.dataset.id !== gesture.from) target.classList.add('drop-target');
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    if (!g) return;
    if (g.type === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    gesture = null;
    canvas.classList.remove('panning');
    if (e.type === 'pointercancel') { tempSvg.hidden = true; return; }
    if (g.type === 'node') {
      g.el.classList.remove('dragging');
      if (g.moved) { Store.touch(); return; }
      const now = Date.now();
      if (connectFrom && connectFrom !== g.id) {
        const from = connectFrom;
        connectFrom = null;
        const edge = Cards.link(from, g.id);
        sel = edge ? { kind: 'edge', id: edge.id } : null;
        render();
        return;
      }
      if (lastTap.id === g.id && now - lastTap.t < 400) { lastTap = { id: null, t: 0 }; editCard(g.id); return; }
      lastTap = { id: g.id, t: now };
      select({ kind: 'node', id: g.id });
    } else if (g.type === 'edge') {
      select({ kind: 'edge', id: g.id });
    } else if (g.type === 'pan') {
      if (!g.moved) { if (connectFrom) { connectFrom = null; render(); } else if (sel) select(null); }
    } else if (g.type === 'connect') {
      tempSvg.hidden = true;
      U.$$('.node.drop-target', nodesLayer).forEach((n) => n.classList.remove('drop-target'));
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const target = over && over.closest('.node');
      if (target && target.dataset.id !== g.from) {
        const edge = Cards.link(g.from, target.dataset.id);
        sel = edge ? { kind: 'edge', id: edge.id } : null;
        render();
      } else if (Math.hypot(local(e).x - g.start.x, local(e).y - g.start.y) < 6) {
        // tocco sul pallino senza trascinare: modalità collega
        connectFrom = g.from;
        sel = { kind: 'node', id: g.from };
        render();
      }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const p = local(e);
    if (e.ctrlKey || e.metaKey) zoomAt(view.k * Math.exp(-e.deltaY * 0.01), p.x, p.y);
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }

  /* ---------- inizializzazione ---------- */

  function init() {
    root = U.$('#view-flow');
    canvas = U.$('#flow-canvas');
    world = U.$('#flow-world');
    nodesLayer = U.$('#flow-nodes');
    labelsLayer = U.$('#flow-labels');
    selbar = U.$('#flow-selbar');
    zoomVal = U.$('#flow-zoom-val');
    onlyScenes = U.$('#flow-only-scenes');
    emptyBox = U.$('#flow-empty');

    svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'flow-edges');
    svg.innerHTML = '<defs>' +
      '<marker id="flow-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="arrow-head" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<marker id="flow-arrow-sel" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="arrow-head sel" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '</defs><g></g>';
    gEdges = svg.querySelector('g');
    world.insertBefore(svg, world.firstChild);

    tempSvg = document.createElementNS(SVGNS, 'svg');
    tempSvg.setAttribute('class', 'flow-temp');
    tempSvg.innerHTML = '<path class="edge temp"/>';
    tempPath = tempSvg.querySelector('path');
    tempSvg.hidden = true;
    canvas.appendChild(tempSvg);

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    // il canvas si sposta solo con la vista: annulla eventuali scroll del browser (es. al focus)
    canvas.addEventListener('scroll', () => { canvas.scrollLeft = 0; canvas.scrollTop = 0; });
    canvas.addEventListener('dblclick', (e) => { const n = e.target.closest('.node'); if (n) e.preventDefault(); });
    // Safari su Mac: pizzico sul trackpad
    let gStart = 1;
    canvas.addEventListener('gesturestart', (e) => { e.preventDefault(); gStart = view.k; });
    canvas.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (pointers.size) return;
      const p = local(e);
      zoomAt(gStart * e.scale, p.x, p.y);
    });

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-flow]');
      if (!btn) return;
      switch (btn.dataset.flow) {
        case 'add-scene': addCard('scene'); break;
        case 'add-idea': addCard('idea'); break;
        case 'import': importScenes(); break;
        case 'layout': layout(); render(); fit(); break;
        case 'zoom-in': zoomBy(1.2); break;
        case 'zoom-out': zoomBy(1 / 1.2); break;
        case 'fit': fit(); break;
        default:
      }
    });
    onlyScenes.addEventListener('change', () => { sel = null; render(); });

    document.addEventListener('keydown', (e) => {
      if (root.hidden || e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.sheet-backdrop')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSelection(); }
      if (e.key === 'Escape') { connectFrom = null; select(null); }
    });
  }

  function show() {
    if (shownFor !== proj().id) {
      shownFor = proj().id;
      sel = null;
      connectFrom = null;
      const saved = proj().flowView;
      view = saved ? { ...saved } : { x: 40, y: 40, k: 1 };
      render();
      if (!saved) fit();
    } else render();
  }

  function invalidate() { shownFor = null; }

  window.Ciak.Flow = { init, show, render, invalidate };
})();
