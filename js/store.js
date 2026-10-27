/* Ciak — salvataggio dei progetti (localStorage, tutto resta sul dispositivo) */
(function () {
  'use strict';
  const { U } = window.Ciak;

  const KEY_INDEX = 'ciak.index';
  const KEY_CURRENT = 'ciak.current';
  const KEY_PREFS = 'ciak.prefs';
  const keyProject = (id) => 'ciak.p.' + id;

  const listeners = {};

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      U.toast('Impossibile salvare: spazio esaurito. Esporta un backup.');
      return false;
    }
  }

  const b = (type, text) => ({ id: U.uid(), type, text });

  function blankProject(title) {
    const now = Date.now();
    return {
      id: U.uid(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      titlePage: { title: title || 'Senza titolo', credit: 'Scritto da', author: '', source: '', draftDate: U.today(), contact: '' },
      settings: { sceneNumbers: false },
      blocks: [b('transition', 'FADE IN:'), b('scene', '')],
      cards: [],
      edges: [],
      flowView: null
    };
  }

  // Progetto di esempio: mostra tutti gli elementi del formato sceneggiatura
  function exampleProject() {
    const p = blankProject('Il castello');
    p.titlePage.author = 'Il tuo nome';
    p.settings.sceneNumbers = true;
    const s1 = b('scene', 'EST. VILLETTA DI PERIFERIA - NOTTE');
    const s2 = b('scene', 'INT. VILLETTA - CUCINA - NOTTE');
    p.blocks = [
      b('transition', 'FADE IN:'),
      s1,
      b('action', 'Una moderna villetta di periferia. La finestra sul davanti è illuminata dalle luci di casa. Vediamo la silhouette di una piccola figura che corre avanti e indietro. Ci avviciniamo lentamente e scopriamo un BAMBINO che corre per la casa.'),
      b('transition', 'CUT TO:'),
      s2,
      b('action', 'Una PALLINA VERDE è appoggiata sul bancone. Una piccola mano la afferra. Appartiene a FILIPPO (9), magrolino, perso nel suo mondo immaginario. Vestito da cavaliere. Una spada giocattolo nell\'altra mano.'),
      b('character', 'FILIPPO (V.O.)'),
      b('dialogue', 'Questo è il mio castello. Ho giurato di proteggerlo. Chiunque si metta sulla mia strada subirà l\'ira dell\'onnipotente--'),
      b('action', 'Proprio in quel momento passa la babysitter. GIULIA (23), alla moda, distratta. È al telefono con la mamma di Filippo, TERESA.'),
      b('character', 'GIULIA'),
      b('parenthetical', '(al telefono)'),
      b('dialogue', 'Oh sì, si sta comportando benissimo. Sta solo combattendo orchi e troll.'),
      b('intercut', 'INTERCUT CONVERSAZIONE TELEFONICA'),
      b('character', 'TERESA'),
      b('dialogue', 'Ah, è perfettamente normale.'),
      b('action', 'Filippo alza la spada al cielo, lancia un grido di battaglia e scatta fuori dalla cucina verso --'),
      b('subheader', 'CORRIDOIO'),
      b('action', 'Filippo gira l\'angolo, distratto dalla sua fantasia, e sbatte contro il muro. La sua pallina preferita gli scivola di mano. Tutto rallenta per Filippo.'),
      b('shot', 'POV DI FILIPPO'),
      b('action', 'AL RALLENTATORE - La pallina rotola giù per le scale. SENTIAMO ogni rimbalzo echeggiare mentre la pallina scende i gradini.')
    ];
    const c = (type, title, text, color, extra) => Object.assign({ id: U.uid(), type, title, text, color }, extra || {});
    const k1 = c('scene', '', 'Presentiamo la casa e Filippo che gioca.', 'blue', { sceneId: s1.id });
    const k2 = c('scene', '', 'Filippo-cavaliere difende il suo castello. Giulia al telefono con Teresa. La pallina cade dalle scale.', 'blue', { sceneId: s2.id });
    const k3 = c('scene', 'INT. VILLETTA - CANTINA - NOTTE', 'La pallina rotola fino in cantina, nel buio. Filippo deve decidere se scendere.', 'orange');
    const k4 = c('scene', 'Filippo affronta il "drago"', 'Il drago è il gatto del vicino. Filippo vince la paura.', 'green');
    const k5 = c('scene', 'Giulia trova la pallina', 'Finale alternativo: Giulia scende per prima e rovina la "missione".', 'purple');
    const i1 = c('idea', 'E se la pallina fosse magica?', 'Ogni volta che rimbalza, la casa cambia un po\'.', 'yellow');
    const i2 = c('idea', 'Tema', 'L\'immaginazione come rifugio quando gli adulti non ascoltano.', 'yellow');
    const ch1 = c('character', 'FILIPPO', '9 anni. Si crede un cavaliere. Coraggioso solo nella fantasia.', 'red');
    const ch2 = c('character', 'GIULIA', 'Babysitter, 23 anni. Sempre al telefono.', 'pink');
    const ch3 = c('character', 'TERESA', 'Mamma di Filippo. Apprensiva ma lontana.', 'pink');
    const n1 = c('note', 'Ricerca', 'Guardare come vengono girati i POV dei bambini (macchina ad altezza 1 metro).', '');
    p.cards = [i1, i2, k1, k2, k3, k4, k5, ch1, ch2, ch3, n1];
    const e = (from, to, label) => ({ id: U.uid(), from: from.id, to: to.id, label: label || '' });
    p.edges = [e(k1, k2), e(k2, k3), e(k3, k4, 'scende'), e(k3, k5, 'non scende'), e(i1, k3, 'e se…?')];
    return p;
  }

  function normalize(p) {
    p.titlePage = Object.assign({ title: 'Senza titolo', credit: 'Scritto da', author: '', source: '', draftDate: '', contact: '' }, p.titlePage || {});
    p.settings = Object.assign({ sceneNumbers: false }, p.settings || {});
    p.blocks = Array.isArray(p.blocks) ? p.blocks.filter((x) => x && x.type) : [];
    p.blocks.forEach((x) => { if (!x.id) x.id = U.uid(); if (typeof x.text !== 'string') x.text = ''; });
    if (!p.blocks.length) p.blocks.push(b('scene', ''));
    p.cards = Array.isArray(p.cards) ? p.cards : [];
    p.cards.forEach((x) => { if (!x.id) x.id = U.uid(); x.title = x.title || ''; x.text = x.text || ''; x.type = x.type || 'idea'; });
    const ids = new Set(p.cards.map((x) => x.id));
    p.edges = (Array.isArray(p.edges) ? p.edges : []).filter((x) => ids.has(x.from) && ids.has(x.to));
    p.edges.forEach((x) => { if (!x.id) x.id = U.uid(); x.label = x.label || ''; });
    if (!p.createdAt) p.createdAt = Date.now();
    if (!p.updatedAt) p.updatedAt = Date.now();
    return p;
  }

  const Store = {
    project: null,

    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    emit(evt, data) { (listeners[evt] || []).forEach((fn) => fn(data)); },

    prefs: Object.assign({ theme: 'auto', pageSize: 'A4', view: 'script', sidebar: true }, read(KEY_PREFS, {})),
    setPref(k, v) { this.prefs[k] = v; write(KEY_PREFS, this.prefs); },

    list() {
      return read(KEY_INDEX, []).sort((a, b2) => b2.updatedAt - a.updatedAt);
    },

    init() {
      let index = read(KEY_INDEX, []);
      if (!index.length) {
        const ex = exampleProject();
        this._persist(ex);
        index = read(KEY_INDEX, []);
      }
      const cur = localStorage.getItem(KEY_CURRENT);
      const id = index.some((x) => x.id === cur) ? cur : this.list()[0].id;
      this.open(id);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },

    load(id) {
      const p = read(keyProject(id), null);
      return p ? normalize(p) : null;
    },

    open(id) {
      if (this.project) this.saveNow();
      const p = this.load(id);
      if (!p) return false;
      this.project = p;
      try { localStorage.setItem(KEY_CURRENT, id); } catch (e) { /* ignorato */ }
      this.emit('open', p);
      return true;
    },

    create(title) {
      const p = blankProject(title);
      this._persist(p);
      this.open(p.id);
      return p;
    },

    createExample() {
      const p = exampleProject();
      this._persist(p);
      this.open(p.id);
      return p;
    },

    _persist(p) {
      if (!write(keyProject(p.id), p)) return false;
      const index = read(KEY_INDEX, []).filter((x) => x.id !== p.id);
      index.push({ id: p.id, title: p.titlePage.title || 'Senza titolo', updatedAt: p.updatedAt });
      write(KEY_INDEX, index);
      return true;
    },

    touch() {
      if (!this.project) return;
      this.project.updatedAt = Date.now();
      this.emit('dirty');
      this._saveSoon();
    },

    saveNow() {
      if (!this.project) return;
      this._saveSoon.cancel();
      if (this._persist(this.project)) this.emit('saved');
    },

    remove(id) {
      try { localStorage.removeItem(keyProject(id)); } catch (e) { /* ignorato */ }
      write(KEY_INDEX, read(KEY_INDEX, []).filter((x) => x.id !== id));
      if (this.project && this.project.id === id) {
        this.project = null;
        const rest = this.list();
        if (rest.length) this.open(rest[0].id);
        else this.create('Senza titolo');
      }
    },

    duplicate(id) {
      const src = id === (this.project && this.project.id) ? JSON.parse(JSON.stringify(this.project)) : this.load(id);
      if (!src) return null;
      src.id = U.uid();
      src.titlePage.title = (src.titlePage.title || 'Senza titolo') + ' (copia)';
      src.createdAt = src.updatedAt = Date.now();
      this._persist(src);
      return src;
    },

    exists(id) { return read(KEY_INDEX, []).some((x) => x.id === id); },

    // Importa un progetto completo (backup .json). mode: 'replace' | 'copy'
    importProject(obj, mode) {
      const p = normalize(JSON.parse(JSON.stringify(obj)));
      if (mode !== 'replace' || !p.id) {
        p.id = U.uid();
        p.createdAt = Date.now();
      }
      if (this.project && this.project.id === p.id) this.project = null;
      this._persist(p);
      this.open(p.id);
      return p;
    },

    // Crea un progetto da blocchi importati (Fountain / Final Draft)
    createFromBlocks(title, blocks, titlePage) {
      const p = blankProject(title);
      if (titlePage) Object.assign(p.titlePage, titlePage);
      p.blocks = blocks.length ? blocks.map((x) => b(x.type, x.text)) : p.blocks;
      this._persist(p);
      this.open(p.id);
      return p;
    }
  };

  Store._saveSoon = U.debounce(() => Store.saveNow(), 500);
  window.addEventListener('pagehide', () => Store.saveNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.saveNow(); });

  window.Ciak.Store = Store;
})();
