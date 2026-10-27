/* Ciak — app: navigazione, menu, progetti, esportazione */
(function () {
  'use strict';
  const { U, Store, Formats, Editor, Ideas, Flow } = window.Ciak;
  const { h } = U;

  let view = null;
  const scrollPos = {};

  /* ---------- finestre (sheet) ---------- */

  const stack = [];
  function sheet({ title, body, actions = [], onClose, className }) {
    const backdrop = h('div', { class: 'sheet-backdrop' });
    const mkBtn = (a) => h('button', { class: 'btn ' + (a.kind || ''), type: 'button', onclick: () => a.onClick(close) }, a.label);
    const el = h('div', { class: 'sheet ' + (className || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chiudi', onclick: () => close() }, U.icon('x'))),
      h('div', { class: 'sheet-body' }, body),
      actions.length ? h('div', { class: 'sheet-foot' },
        h('div', { class: 'left' }, actions.filter((a) => a.left).map(mkBtn)),
        h('div', { class: 'right' }, actions.filter((a) => !a.left).map(mkBtn))) : null);
    backdrop.appendChild(el);
    document.body.appendChild(backdrop);
    document.body.classList.add('has-sheet');
    requestAnimationFrame(() => backdrop.classList.add('open'));
    let downOnBackdrop = false;
    backdrop.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === backdrop; });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && downOnBackdrop) close(); });
    const onKey = (e) => { if (e.key === 'Escape' && stack[stack.length - 1] === api) { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(api), 1);
      backdrop.classList.remove('open');
      setTimeout(() => {
        backdrop.remove();
        if (!stack.length) document.body.classList.remove('has-sheet');
      }, 180);
      if (onClose) onClose();
    }
    const api = { el, close };
    stack.push(api);
    return api;
  }

  function confirmBox({ title, message, ok = 'Conferma', danger }) {
    return new Promise((resolve) => {
      let result = false;
      sheet({
        title, className: 'small', body: h('p', { class: 'sheet-text' }, message),
        actions: [
          { label: 'Annulla', onClick: (c) => c() },
          { label: ok, kind: danger ? 'danger' : 'primary', onClick: (c) => { result = true; c(); } }
        ],
        onClose: () => resolve(result)
      });
    });
  }

  function promptBox({ title, label, value = '', ok = 'OK', placeholder = '' }) {
    return new Promise((resolve) => {
      let result = null;
      const input = h('input', { class: 'input', type: 'text', value, placeholder, 'aria-label': label });
      const s = sheet({
        title, className: 'small',
        body: h('div', { class: 'field' }, label ? h('label', { class: 'label' }, label) : null, input),
        actions: [
          { label: 'Annulla', onClick: (c) => c() },
          { label: ok, kind: 'primary', onClick: (c) => { result = input.value.trim(); c(); } }
        ],
        onClose: () => resolve(result)
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { result = input.value.trim(); s.close(); } });
      requestAnimationFrame(() => { input.focus(); input.select(); });
    });
  }

  function chooseBox({ title, message, options }) {
    return new Promise((resolve) => {
      let result = null;
      sheet({
        title, className: 'small', body: h('p', { class: 'sheet-text' }, message),
        actions: [{ label: 'Annulla', left: true, onClick: (c) => c() }].concat(options.map((o) => ({
          label: o.label, kind: o.kind, onClick: (c) => { result = o.id; c(); }
        }))),
        onClose: () => resolve(result)
      });
    });
  }

  /* ---------- viste ---------- */

  function show(v) {
    if (!['script', 'ideas', 'flow'].includes(v)) v = 'script';
    if (view === 'script') scrollPos.script = window.scrollY;
    if (view === 'ideas') scrollPos.ideas = window.scrollY;
    view = v;
    document.body.dataset.view = v;
    U.$$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
    U.$$('.tabs [data-view]').forEach((b) => {
      b.classList.toggle('on', b.dataset.view === v);
      b.setAttribute('aria-selected', b.dataset.view === v ? 'true' : 'false');
    });
    Store.setPref('view', v);
    closeSidebar();
    if (v === 'script') Editor.show();
    else if (v === 'ideas') Ideas.show();
    else Flow.show();
    window.scrollTo(0, scrollPos[v] || 0);
  }

  function updateTitle() {
    const t = Store.project.titlePage.title || 'Senza titolo';
    U.$('#proj-title').textContent = t;
    U.$('#side-title').textContent = t;
    document.title = t + ' — Ciak';
  }

  function toggleSidebar() {
    if (U.isMobile()) {
      document.body.classList.toggle('sidebar-open');
    } else {
      const hidden = document.body.classList.toggle('sidebar-hidden');
      Store.setPref('sidebar', !hidden);
    }
  }
  function closeSidebar() { document.body.classList.remove('sidebar-open'); }

  /* ---------- tema ---------- */

  function applyTheme() {
    const t = Store.prefs.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    const dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = U.$('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1c1b1f' : '#faf9f7');
  }

  /* ---------- progetti ---------- */

  function projectsSheet() {
    const list = h('div', { class: 'proj-list' });
    const renderList = () => {
      list.textContent = '';
      Store.list().forEach((item) => {
        const isCur = item.id === Store.project.id;
        list.appendChild(h('div', { class: 'proj-row' + (isCur ? ' current' : '') },
          h('button', { class: 'proj-open', type: 'button', onclick: () => { if (!isCur) Store.open(item.id); s.close(); } },
            h('span', { class: 'proj-icon' }, U.icon('file', 18)),
            h('span', { class: 'proj-text' },
              h('span', { class: 'proj-name' }, item.title || 'Senza titolo'),
              h('span', { class: 'proj-meta' }, (isCur ? 'Aperto ora · ' : '') + 'modificato ' + U.fmtDate(item.updatedAt)))),
          h('button', { class: 'icon-btn', type: 'button', title: 'Duplica', 'aria-label': 'Duplica', onclick: () => { Store.duplicate(item.id); renderList(); U.toast('Copia creata'); } }, U.icon('copy', 17)),
          h('button', { class: 'icon-btn', type: 'button', title: 'Elimina', 'aria-label': 'Elimina', onclick: async () => {
            const ok = await confirmBox({ title: 'Eliminare il copione?', message: `«${item.title}» verrà eliminato da questo dispositivo. L'operazione non si può annullare.`, ok: 'Elimina', danger: true });
            if (ok) { Store.remove(item.id); renderList(); }
          } }, U.icon('trash', 17))));
      });
    };
    renderList();
    const s = sheet({
      title: 'I tuoi copioni',
      body: list,
      actions: [
        { label: 'Importa file…', left: true, onClick: (c) => { c(); importFile(); } },
        { label: 'Nuovo copione', kind: 'primary', onClick: async (c) => {
          c();
          const title = await promptBox({ title: 'Nuovo copione', label: 'Titolo', placeholder: 'Il mio film', ok: 'Crea' });
          if (title !== null) { Store.create(title || 'Senza titolo'); show('script'); titlePageSheet(); }
        } }
      ]
    });
  }

  function titlePageSheet() {
    const tp = Store.project.titlePage;
    const field = (key, label, ph, multi) => {
      const input = multi
        ? h('textarea', { class: 'input', rows: '3', placeholder: ph })
        : h('input', { class: 'input', type: 'text', placeholder: ph });
      input.value = tp[key] || '';
      input.addEventListener('input', () => { tp[key] = input.value; Store.touch(); if (key === 'title') updateTitle(); });
      return h('div', { class: 'field' }, h('label', { class: 'label' }, label), input);
    };
    sheet({
      title: 'Frontespizio',
      body: h('div', null,
        h('p', { class: 'help' }, 'La prima pagina del PDF. Il titolo è anche il nome del progetto.'),
        field('title', 'Titolo', 'Il mio film'),
        h('div', { class: 'grid2' }, field('credit', 'Credito', 'Scritto da'), field('author', 'Autore/i', 'Nome Cognome')),
        field('source', 'Basato su (facoltativo)', 'Dal romanzo di…'),
        field('draftDate', 'Data / versione', U.today()),
        field('contact', 'Contatti', 'email, telefono, agente…', true)),
      actions: [{ label: 'Fatto', kind: 'primary', onClick: (c) => c() }]
    });
  }

  /* ---------- esportazione / importazione ---------- */

  function fileBase() { return U.slug(Store.project.titlePage.title); }

  function printPDF() {
    Store.saveNow();
    const p = Store.project;
    const tp = p.titlePage;
    const root = U.$('#print-root');
    root.textContent = '';
    if (tp.title) {
      root.appendChild(h('section', { class: 'pr-title' },
        h('div', { class: 'pr-main' },
          h('div', { class: 'pr-t' }, tp.title.toUpperCase()),
          tp.credit ? h('div', { class: 'pr-c' }, tp.credit) : null,
          tp.author ? h('div', { class: 'pr-a' }, tp.author) : null,
          tp.source ? h('div', { class: 'pr-s' }, tp.source) : null),
        h('div', { class: 'pr-foot' },
          h('div', { class: 'pr-contact' }, tp.contact || ''),
          h('div', { class: 'pr-date' }, tp.draftDate || ''))));
    }
    const script = h('section', { class: 'pr-script' + (p.settings.sceneNumbers ? ' show-numbers' : '') });
    let n = 0;
    p.blocks.forEach((b) => {
      if (!b.text.trim()) return;
      const el = h('div', { class: 'el el-' + b.type }, b.type === 'parenthetical' ? Formats.parenWrap(b.text) : b.text);
      if (b.type === 'scene') el.dataset.num = ++n;
      script.appendChild(el);
    });
    root.appendChild(script);
    U.$('#page-size-style').textContent = `@page { size: ${Store.prefs.pageSize === 'Letter' ? 'letter' : 'A4'}; }`;
    const oldTitle = document.title;
    document.title = tp.title || 'Copione';
    const done = () => { document.title = oldTitle; root.textContent = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 60);
  }

  async function exportFountain() {
    await U.saveFile(fileBase() + '.fountain', Formats.toFountain(Store.project), 'text/plain');
  }
  async function exportFDX() {
    await U.saveFile(fileBase() + '.fdx', Formats.toFDX(Store.project), 'application/xml');
  }
  async function exportBackup() {
    Store.saveNow();
    const data = JSON.stringify({ app: 'ciak', version: 1, exportedAt: new Date().toISOString(), project: Store.project }, null, 1);
    const ok = await U.saveFile(fileBase() + '.ciak.json', data, 'application/json');
    if (ok) U.toast('Backup creato. Aprilo con "Importa file…" sull\'altro dispositivo.');
  }

  async function importFile() {
    const f = await U.pickFile('.json,.fountain,.txt,.fdx,.spmd,application/json,text/plain');
    if (!f) return;
    try {
      const text = await U.readFile(f);
      const name = f.name.replace(/\.[^.]+$/, '').replace(/\.ciak$/, '');
      if (/\.json$/i.test(f.name) || /^\s*\{/.test(text)) {
        const data = JSON.parse(text);
        const proj = data.project || data;
        if (!proj || !Array.isArray(proj.blocks)) throw new Error('il file non è un backup di Ciak');
        let mode = 'replace';
        if (proj.id && Store.exists(proj.id)) {
          mode = await chooseBox({
            title: 'Copione già presente',
            message: `Su questo dispositivo c'è già «${(proj.titlePage && proj.titlePage.title) || name}». Vuoi sostituirlo con la versione del file (salvata ${U.fmtDate(proj.updatedAt)}) o tenerli entrambi?`,
            options: [{ id: 'copy', label: 'Tieni entrambi' }, { id: 'replace', label: 'Sostituisci', kind: 'primary' }]
          });
          if (!mode) return;
        }
        Store.importProject(proj, mode);
      } else if (/\.fdx$/i.test(f.name) || text.includes('<FinalDraft')) {
        const r = Formats.parseFDX(text);
        Store.createFromBlocks(r.titlePage.title || name, r.blocks, r.titlePage);
      } else {
        const r = Formats.parseFountain(text);
        Store.createFromBlocks(r.titlePage.title || name, r.blocks, r.titlePage);
      }
      show('script');
      U.toast('Importato: ' + Store.project.titlePage.title);
    } catch (err) {
      U.toast('Impossibile importare il file: ' + (err.message || err));
    }
  }

  /* ---------- menu, impostazioni, guida ---------- */

  const menuItem = (icon, label, sub, onClick) => h('button', { class: 'menu-item', type: 'button', onclick: onClick },
    U.icon(icon, 20), h('span', { class: 'mi-text' }, h('span', { class: 'mi-label' }, label), sub ? h('span', { class: 'mi-sub' }, sub) : null));

  function menuSheet(only) {
    let s;
    const go = (fn) => () => { s.close(); fn(); };
    const exportItems = [
      h('div', { class: 'menu-group' }, 'Esporta'),
      menuItem('printer', 'PDF / Stampa', 'Formato sceneggiatura standard, con frontespizio', go(printPDF)),
      menuItem('file', 'Fountain (.fountain)', 'Testo standard: Highland, WriterDuet, Slugline, Fade In…', go(exportFountain)),
      menuItem('file', 'Final Draft (.fdx)', 'Da aprire in Final Draft', go(exportFDX)),
      menuItem('download', 'Backup del progetto (.json)', 'Copione + idee + flow chart, per spostarlo su un altro dispositivo', go(exportBackup)),
      menuItem('upload', 'Importa file…', 'Backup .json, Fountain, Final Draft o testo', go(importFile))
    ];
    const body = only === 'export' ? h('div', { class: 'menu' }, exportItems) : h('div', { class: 'menu' },
      h('div', { class: 'menu-group' }, 'Progetto'),
      menuItem('folder', 'I tuoi copioni', 'Apri, crea, duplica o elimina', go(projectsSheet)),
      menuItem('title', 'Frontespizio', 'Titolo, autore, contatti', go(titlePageSheet)),
      exportItems,
      h('div', { class: 'menu-group' }, 'App'),
      menuItem('settings', 'Impostazioni', 'Tema, numeri di scena, formato pagina', go(settingsSheet)),
      menuItem('help', 'Guida e scorciatoie', 'Gli elementi della sceneggiatura e i tasti rapidi', go(helpSheet)),
      menuItem('phone', 'Installa su iPhone e Mac', 'Usala come un\'app, anche offline', go(installSheet)));
    s = sheet({ title: only === 'export' ? 'Esporta' : 'Menu', body, className: 'menu-sheet' });
  }

  function seg(options, value, onChange) {
    const el = h('div', { class: 'seg' }, options.map(([v, label]) => h('button', {
      type: 'button', class: v === value ? 'on' : '', dataset: { v },
      onclick: () => { U.$$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); onChange(v); }
    }, label)));
    return el;
  }

  function settingsSheet() {
    const p = Store.project;
    const numbers = h('input', { type: 'checkbox', class: 'switch', checked: !!p.settings.sceneNumbers });
    numbers.addEventListener('change', () => { p.settings.sceneNumbers = numbers.checked; Store.touch(); Editor.renumber(); });
    let usage = '';
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('ciak.')) bytes += (localStorage.getItem(k) || '').length * 2; }
      usage = (bytes / 1024).toFixed(0) + ' KB usati';
    } catch (e) { /* ignorato */ }
    sheet({
      title: 'Impostazioni',
      body: h('div', null,
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Tema'),
          seg([['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']], Store.prefs.theme, (v) => { Store.setPref('theme', v); applyTheme(); })),
        h('label', { class: 'field switch-row' },
          h('span', null, h('span', { class: 'label-strong' }, 'Numeri di scena'), h('span', { class: 'help' }, 'Mostrali a sinistra e a destra di ogni intestazione (shooting script). Vale per questo copione.')),
          numbers),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Formato pagina del PDF'),
          seg([['A4', 'A4 (Europa)'], ['Letter', 'US Letter (Hollywood)']], Store.prefs.pageSize, (v) => Store.setPref('pageSize', v))),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Dati'),
          h('p', { class: 'help' }, `I copioni sono salvati automaticamente solo su questo dispositivo (${usage}). Per portarli su un altro dispositivo usa Menu → Backup del progetto, poi "Importa file…" dall'altra parte.`))),
      actions: [{ label: 'Fatto', kind: 'primary', onClick: (c) => c() }]
    });
  }

  function helpSheet() {
    const mod = U.isMac ? '⌘' : 'Ctrl';
    const els = [
      ['Scena', 'Scene Heading', 'Una riga con luogo e momento: INT. CUCINA - NOTTE. Scrivi "int." o "est." su una riga e diventa automaticamente un\'intestazione.'],
      ['Azione', 'Action', 'Cosa vediamo e sentiamo, al presente.'],
      ['Personaggio', 'Character', 'Il nome di chi parla, in maiuscolo. Ti vengono suggeriti i nomi già usati.'],
      ['Estensione', 'Extension', 'Dove si trova chi parla quando non lo vediamo: (V.O.) voce fuori campo, (O.S.) fuori scena, (CONT\'D). Usa i pulsanti accanto al nome.'],
      ['Parentetica', 'Parenthetical', 'Come va detta la battuta: (al telefono). In un dialogo, digita "(" per crearla.'],
      ['Dialogo', 'Dialogue', 'Le battute del personaggio.'],
      ['Transizione', 'Transition', 'Indicazioni di montaggio: CUT TO:, FADE IN:, DISSOLVE TO:. Allineate a destra.'],
      ['Inquadratura', 'Shot', 'Un angolo o movimento di macchina: POV DI FILIPPO, PRIMO PIANO SU…'],
      ['Sotto-scena', 'Subheader', 'Piccolo cambio di luogo dentro la stessa scena: CORRIDOIO.'],
      ['Intercut', 'Intercut', 'Quando si alternano più luoghi: INTERCUT CONVERSAZIONE TELEFONICA.'],
      ['Numero di scena', 'Scene number', 'Si attiva nelle impostazioni (di solito solo nello shooting script).']
    ];
    const keys = [
      ['↵ Invio', 'Nuovo elemento: dopo Personaggio viene Dialogo, dopo Scena viene Azione…'],
      ['↵ su riga vuota', 'Cambia tipo (es. Azione → Personaggio)'],
      ['⇥ Tab / ⇧⇥', 'Cambia il tipo della riga corrente'],
      ['⌥1 … ⌥9', 'Scena, Azione, Personaggio, Parentetica, Dialogo, Transizione, Inquadratura, Sotto-scena, Intercut'],
      [`${mod}Z / ⇧${mod}Z`, 'Annulla / Ripeti'],
      [`${mod}P`, 'Esporta PDF'],
      ['↑ ↓ / Esc', 'Scegli un suggerimento / chiudi i suggerimenti']
    ];
    sheet({
      title: 'Guida',
      className: 'wide',
      body: h('div', { class: 'help-body' },
        h('h3', null, 'Gli elementi della sceneggiatura'),
        h('dl', { class: 'help-els' }, els.map(([it, en, d]) => [h('dt', null, it, h('span', null, en)), h('dd', null, d)])),
        h('h3', null, 'Tasti rapidi'),
        h('dl', { class: 'help-keys' }, keys.map(([k, d]) => [h('dt', null, h('kbd', null, k)), h('dd', null, d)])),
        h('h3', null, 'Idee & Scene e Flow chart'),
        h('p', null, 'Nella scheda Idee annoti idee, scene da scrivere, personaggi e note. Trascina le schede con la maniglia ⠿ per riordinarle o spostarle in un\'altra colonna.'),
        h('p', null, 'Nel Flow chart le stesse schede diventano un diagramma: trascina il pallino sotto una scheda fino a un\'altra per collegarle (oppure seleziona la scheda e tocca "Collega"). Tocca una freccia per darle un\'etichetta. "Importa dal copione" crea una scheda per ogni scena già scritta; "Scrivi" su una scheda scena la aggiunge in fondo al copione.')),
      actions: [{ label: 'Chiudi', kind: 'primary', onClick: (c) => c() }]
    });
  }

  function installSheet() {
    sheet({
      title: 'Installa Ciak',
      body: h('div', { class: 'help-body' },
        h('h3', null, 'Su iPhone o iPad'),
        h('ol', null,
          h('li', null, 'Apri questa pagina con Safari.'),
          h('li', null, 'Tocca il pulsante Condividi (il quadrato con la freccia).'),
          h('li', null, 'Scegli "Aggiungi alla schermata Home".')),
        h('h3', null, 'Su Mac'),
        h('ol', null,
          h('li', null, 'Safari (macOS Sonoma o successivo): menu File → "Aggiungi al Dock".'),
          h('li', null, 'Chrome o Edge: clicca l\'icona "Installa" a destra nella barra degli indirizzi.')),
        h('p', null, 'Una volta installata si apre in una finestra sua e funziona anche senza connessione.'),
        h('h3', null, 'Spostare un copione tra Mac e iPhone'),
        h('p', null, 'Ogni dispositivo salva i propri copioni. Per portarne uno dall\'altra parte: Menu → "Backup del progetto" e salvalo su iCloud Drive; sull\'altro dispositivo Menu → "Importa file…" e scegli "Sostituisci" per aggiornare la versione esistente.')),
      actions: [{ label: 'Chiudi', kind: 'primary', onClick: (c) => c() }]
    });
  }

  /* ---------- avvio ---------- */

  function init() {
    applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    if (!Store.prefs.sidebar) document.body.classList.add('sidebar-hidden');

    Editor.init();
    Ideas.init();
    Flow.init();

    Store.on('open', () => {
      Editor.invalidate();
      Flow.invalidate();
      updateTitle();
      if (view) show(view);
    });
    const saveState = U.$('#save-state');
    Store.on('dirty', () => { saveState.textContent = 'Salvataggio…'; saveState.classList.add('saving'); });
    Store.on('saved', () => { saveState.textContent = 'Salvato'; saveState.classList.remove('saving'); });

    U.$$('.tabs [data-view]').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
    U.$('#btn-sidebar').addEventListener('click', toggleSidebar);
    U.$('#sidebar-backdrop').addEventListener('click', closeSidebar);
    U.$('#btn-projects').addEventListener('click', projectsSheet);
    U.$('#side-title').addEventListener('click', titlePageSheet);
    U.$('#btn-menu').addEventListener('click', () => menuSheet());
    U.$('#btn-export').addEventListener('click', () => menuSheet('export'));
    U.$$('.app-header [data-act="undo"]').forEach((b) => b.addEventListener('click', () => Editor.undo()));
    U.$$('.app-header [data-act="redo"]').forEach((b) => b.addEventListener('click', () => Editor.redo()));
    U.$('#btn-help').addEventListener('click', helpSheet);
    U.$$('[data-open="install"]').forEach((b) => b.addEventListener('click', installSheet));

    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); printPDF(); }
      if (mod && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); Store.saveNow(); U.toast('Salvato. Il salvataggio è automatico.'); }
    });

    Store.init();
    updateTitle();
    show(Store.prefs.view || 'script');

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  window.Ciak.App = { show, sheet, confirm: confirmBox, prompt: promptBox, closeSidebar, printPDF };
  document.addEventListener('DOMContentLoaded', init);
})();
