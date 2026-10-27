/* Ciak — import/export: Fountain e Final Draft (.fdx) */
(function () {
  'use strict';

  const SCENE_RE = /^(INT\.?\s*\/\s*(EXT|EST)\.?|I\/E\.?|INT\.|EXT\.|EST\.|INT\s|EXT\s|EST\s)/i;
  const TRANSITION_RE = /^[A-ZÀ-Ý0-9 .'’-]+(TO:|SU:|IN:)$/;
  const SHOT_RE = /^(CLOSE ON|ANGLE ON|INSERT|WIDE|BACK TO|POV|PRIMO PIANO|DETTAGLIO|CAMPO LUNGO|RITORNO A)\b|\bPOV$/;

  const hasLetters = (s) => /\p{L}/u.test(s);
  const isUpper = (s) => hasLetters(s) && s === s.toUpperCase();

  // Fountain → { titlePage, blocks: [{type, text}] }
  function parseFountain(src, { titlePage: parseTitle = true } = {}) {
    let text = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');      // boneyard
    text = text.replace(/\[\[[\s\S]*?\]\]/g, '');      // note
    const lines = text.split('\n');
    let i = 0;
    const tp = {};

    if (parseTitle && /^[A-Za-z][A-Za-z ]*:/.test(lines[0] || '')) {
      let key = null;
      for (; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) { i++; break; }
        const m = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
        if (m && !/^\s{2,}/.test(line)) {
          key = m[1].trim().toLowerCase();
          tp[key] = m[2].trim();
        } else if (key) {
          tp[key] = (tp[key] ? tp[key] + '\n' : '') + line.trim();
        }
      }
    }

    const blocks = [];
    let actionBuf = [];
    const flushAction = () => {
      if (!actionBuf.length) return;
      const t = actionBuf.join(' ').replace(/\s+/g, ' ').trim();
      actionBuf = [];
      if (t) blocks.push({ type: 'action', text: t });
    };
    let inDialogue = false;

    for (; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      const prevBlank = i === 0 || !lines[i - 1].trim();
      const nextBlank = i + 1 >= lines.length || !lines[i + 1].trim();

      if (!line) { flushAction(); inDialogue = false; continue; }
      if (/^#/.test(line) || /^=(?!=)/.test(line) || /^={3,}$/.test(line)) { flushAction(); continue; }

      if (inDialogue) {
        const last = blocks[blocks.length - 1];
        if (/^\(.*\)$/.test(line)) blocks.push({ type: 'parenthetical', text: line });
        else if (last && last.type === 'dialogue') last.text += ' ' + line;
        else blocks.push({ type: 'dialogue', text: line });
        continue;
      }

      if (prevBlank) {
        // intestazione di scena (forzata con "." o standard)
        if (/^\.[^.]/.test(line)) { flushAction(); blocks.push({ type: 'scene', text: stripSceneNum(line.slice(1)) }); continue; }
        if (SCENE_RE.test(line)) { flushAction(); blocks.push({ type: 'scene', text: stripSceneNum(line) }); continue; }
        // transizione
        if (/^>/.test(line) && !/<$/.test(line)) { flushAction(); blocks.push({ type: 'transition', text: line.slice(1).trim() }); continue; }
        if (/^>.*<$/.test(line)) { flushAction(); blocks.push({ type: 'action', text: line.slice(1, -1).trim() }); continue; }
        if (nextBlank && isUpper(line) && (TRANSITION_RE.test(line) || /^(FADE OUT|FADE TO BLACK|DISSOLVENZA)/.test(line))) {
          flushAction(); blocks.push({ type: 'transition', text: line }); continue;
        }
        // personaggio
        if (/^@/.test(line) && !nextBlank) { flushAction(); blocks.push({ type: 'character', text: line.slice(1).trim() }); inDialogue = true; continue; }
        const nameOnly = line.replace(/\(.*?\)/g, '').replace(/\^$/, '').trim();
        if (!nextBlank && isUpper(nameOnly) && !/^!/.test(line)) {
          flushAction(); blocks.push({ type: 'character', text: line.replace(/\^$/, '').trim() }); inDialogue = true; continue;
        }
      }

      // azione (le righe MAIUSCOLE isolate diventano inquadrature / sotto-scene)
      const forced = /^!/.test(line);
      const t = forced ? line.slice(1) : line;
      if (!forced && prevBlank && nextBlank && isUpper(t) && t.length <= 60) {
        flushAction();
        let type = 'subheader';
        if (/^INTERCUT|^END INTERCUT|^FINE INTERCUT/.test(t)) type = 'intercut';
        else if (SHOT_RE.test(t)) type = 'shot';
        blocks.push({ type, text: t });
        continue;
      }
      actionBuf.push(t);
    }
    flushAction();

    const titlePage = {};
    if (tp.title) titlePage.title = tp.title.replace(/[_*]/g, '');
    if (tp.credit) titlePage.credit = tp.credit;
    if (tp.author || tp.authors) titlePage.author = tp.author || tp.authors;
    if (tp.source) titlePage.source = tp.source;
    if (tp['draft date'] || tp.date) titlePage.draftDate = tp['draft date'] || tp.date;
    if (tp.contact) titlePage.contact = tp.contact;
    return { titlePage, blocks };
  }

  function stripSceneNum(s) {
    return s.replace(/\s*#[^#]*#\s*$/, '').trim();
  }

  function parenWrap(t) {
    t = t.trim().replace(/^\(+/, '').replace(/\)+$/, '');
    return '(' + t + ')';
  }

  // blocchi → Fountain (solo il copione, senza frontespizio)
  function toFountainBody(blocks, numbers) {
    const out = [];
    let num = 0;
    let prev = null;
    for (const blk of blocks) {
      const text = (blk.text || '').trim();
      if (!text && blk.type !== 'action') continue;
      const tight = (blk.type === 'dialogue' || blk.type === 'parenthetical') &&
        prev && ['character', 'parenthetical', 'dialogue'].includes(prev.type);
      if (!tight && out.length) out.push('');
      switch (blk.type) {
        case 'scene': {
          num++;
          let t = text.toUpperCase();
          if (!SCENE_RE.test(t)) t = '.' + t;
          out.push(numbers ? `${t} #${num}#` : t);
          break;
        }
        case 'character':
          out.push(!hasLetters(text) || SCENE_RE.test(text) ? '@' + text.toUpperCase() : text.toUpperCase());
          break;
        case 'parenthetical': out.push(parenWrap(text)); break;
        case 'dialogue': out.push(text); break;
        case 'transition': {
          const t = text.toUpperCase();
          out.push(/TO:$/.test(t) ? t : '> ' + t);
          break;
        }
        case 'shot': case 'subheader': case 'intercut': {
          const t = text.toUpperCase();
          out.push(SCENE_RE.test(t) || /TO:$/.test(t) ? '!' + t : t);
          break;
        }
        default: {
          // azione: evita che venga scambiata per altro
          const needsBang = SCENE_RE.test(text) || (isUpper(text) && text.length <= 60) || /^[.>@#=!~]/.test(text);
          out.push(needsBang ? '!' + text : text);
        }
      }
      prev = blk;
    }
    return out.join('\n');
  }

  function toFountain(project) {
    const tp = project.titlePage || {};
    const tpl = [];
    if (tp.title) tpl.push('Title: ' + tp.title);
    if (tp.credit) tpl.push('Credit: ' + tp.credit);
    if (tp.author) tpl.push('Author: ' + tp.author);
    if (tp.source) tpl.push('Source: ' + tp.source);
    if (tp.draftDate) tpl.push('Draft date: ' + tp.draftDate);
    if (tp.contact) tpl.push('Contact:\n' + tp.contact.split('\n').map((l) => '    ' + l).join('\n'));
    const body = toFountainBody(project.blocks, project.settings && project.settings.sceneNumbers);
    return (tpl.length ? tpl.join('\n') + '\n\n' : '') + body + '\n';
  }

  const FDX_TYPES = {
    scene: 'Scene Heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical',
    dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', subheader: 'Shot', intercut: 'Shot'
  };

  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

  function toFDX(project) {
    let num = 0;
    const paras = project.blocks.filter((x) => (x.text || '').trim()).map((blk) => {
      const type = FDX_TYPES[blk.type] || 'Action';
      let text = blk.text.trim();
      if (blk.type === 'parenthetical') text = parenWrap(text);
      if (blk.type !== 'action' && blk.type !== 'dialogue' && blk.type !== 'parenthetical') text = text.toUpperCase();
      const numAttr = blk.type === 'scene' && project.settings.sceneNumbers ? ` Number="${++num}"` : '';
      return `    <Paragraph Type="${type}"${numAttr}>\n      <Text>${xmlEsc(text)}</Text>\n    </Paragraph>`;
    });
    const tp = project.titlePage || {};
    const tpPara = (t, align) => `      <Paragraph Alignment="${align}" Type="Action">\n        <Text>${xmlEsc(t)}</Text>\n      </Paragraph>`;
    const tpParas = [];
    if (tp.title) tpParas.push(tpPara(tp.title.toUpperCase(), 'Center'));
    if (tp.credit) tpParas.push(tpPara('', 'Center'), tpPara(tp.credit, 'Center'));
    if (tp.author) tpParas.push(tpPara(tp.author, 'Center'));
    if (tp.source) tpParas.push(tpPara('', 'Center'), tpPara(tp.source, 'Center'));
    if (tp.draftDate) tpParas.push(tpPara('', 'Left'), tpPara(tp.draftDate, 'Left'));
    if (tp.contact) tp.contact.split('\n').forEach((l) => tpParas.push(tpPara(l, 'Left')));
    return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paras.join('\n')}
  </Content>
  <TitlePage>
    <Content>
${tpParas.join('\n')}
    </Content>
  </TitlePage>
</FinalDraft>
`;
  }

  const FDX_IN = {
    'scene heading': 'scene', action: 'action', character: 'character', parenthetical: 'parenthetical',
    dialogue: 'dialogue', transition: 'transition', shot: 'shot', general: 'action', 'new act': 'subheader', 'end of act': 'subheader'
  };

  function parseFDX(src) {
    const doc = new DOMParser().parseFromString(src, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('File Final Draft non valido');
    const content = doc.querySelector('FinalDraft > Content') || doc.querySelector('Content');
    const blocks = [];
    if (content) {
      for (const p of Array.from(content.children)) {
        if (p.nodeName !== 'Paragraph') continue;
        const type = FDX_IN[(p.getAttribute('Type') || '').toLowerCase()] || 'action';
        const text = Array.from(p.getElementsByTagName('Text')).map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
        if (text) blocks.push({ type, text });
      }
    }
    const titlePage = {};
    const tpc = doc.querySelector('TitlePage Content');
    if (tpc) {
      const texts = Array.from(tpc.querySelectorAll('Paragraph')).map((p) => p.textContent.trim()).filter(Boolean);
      if (texts[0]) titlePage.title = texts[0];
    }
    return { titlePage, blocks };
  }

  window.Ciak.Formats = { parseFountain, toFountain, toFountainBody, toFDX, parseFDX, SCENE_RE, parenWrap };
})();
