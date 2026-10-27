/* Ciak — trascinamento per riordinare (mouse e touch) */
(function () {
  'use strict';
  const { U } = window.Ciak;

  // opts: { item, handle, list (selettore dei contenitori, opzionale), scrollX, scrollY, onDrop(id, listEl, beforeId) }
  window.Ciak.Sortable = function (root, opts) {
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const hd = e.target.closest(opts.handle);
      if (!hd || !root.contains(hd)) return;
      const it = hd.closest(opts.item);
      if (!it) return;
      e.preventDefault();
      e.stopPropagation();
      start(it, e);
    });

    function start(it, e) {
      const rect = it.getBoundingClientRect();
      const ghost = it.cloneNode(true);
      ghost.classList.add('drag-ghost');
      Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px' });
      document.body.appendChild(ghost);
      document.body.classList.add('is-dragging');
      it.classList.add('drag-placeholder');
      const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      let x = e.clientX, y = e.clientY;
      const lists = () => (opts.list ? U.$$(opts.list, root) : [root]);

      const reposition = () => {
        let target = null;
        for (const l of lists()) {
          const r = l.getBoundingClientRect();
          if (x >= r.left && x <= r.right) { target = l; break; }
        }
        if (!target) return;
        const items = Array.from(target.children).filter((c) => c !== it && c.matches(opts.item));
        let before = null;
        for (const c of items) {
          const r = c.getBoundingClientRect();
          if (y < r.top + r.height / 2) { before = c; break; }
        }
        if (before) {
          if (it.nextElementSibling !== before || it.parentNode !== target) target.insertBefore(it, before);
        } else if (items.length) {
          const last = items[items.length - 1];
          if (last.nextElementSibling !== it) last.after(it);
        } else if (it.parentNode !== target) {
          target.prepend(it);
        }
      };

      const move = (ev) => {
        x = ev.clientX; y = ev.clientY;
        ghost.style.left = (x - dx) + 'px';
        ghost.style.top = (y - dy) + 'px';
        reposition();
      };

      let raf = 0;
      const edge = 56, step = 14;
      const loop = () => {
        if (opts.scrollY) {
          const r = opts.scrollY.getBoundingClientRect();
          if (y < r.top + edge) opts.scrollY.scrollTop -= step;
          else if (y > r.bottom - edge) opts.scrollY.scrollTop += step;
        } else {
          if (y < edge + 60) window.scrollBy(0, -step);
          else if (y > window.innerHeight - edge) window.scrollBy(0, step);
        }
        if (opts.scrollX) {
          const r = opts.scrollX.getBoundingClientRect();
          if (x < r.left + edge) opts.scrollX.scrollLeft -= step;
          else if (x > r.right - edge) opts.scrollX.scrollLeft += step;
        }
        reposition();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const end = (ev) => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        ghost.remove();
        document.body.classList.remove('is-dragging');
        it.classList.remove('drag-placeholder');
        if (ev.type === 'pointercancel') return opts.onDrop(null);
        let next = it.nextElementSibling;
        while (next && !next.matches(opts.item)) next = next.nextElementSibling;
        opts.onDrop(it.dataset.id, it.parentNode, next ? next.dataset.id : null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }
  };
})();
