/** Renderer for the manuscript's Markdown subset. Raw HTML is never allowed. */
import {escapeHtml} from './html.mjs';
import {decorateSpatialDiagram} from './layout-map.mjs';
import {decorateLearningVisuals} from './learning-visuals.mjs';
import {readerEditionFamily,decorateReaderEdition,decorateReaderSourceRepeat,decorateReaderComparison} from './reader-edition.mjs';
export {escapeHtml} from './html.mjs';
function safeLink(value) {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://aukeama.invalid/');
    return ['https:', 'http:'].includes(url.protocol) ? value : null;
  } catch { return null; }
}
function isLanguageTag(value) {
  return typeof value === 'string' && value.length <= 35 &&
    /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value);
}
// Definitions belong to one authored section; word: links are identifiers, never URLs.
export function readWordCards(markdown) {
  const source = markdown.replace(/\r\n?/g, '\n');
  const blocks = [...source.matchAll(/^:::word-cards\n([\s\S]*?)^:::[\t ]*$/gm)];
  if (blocks.length > 1) throw new Error('Only one word-card definition block per section');
  const body = source.replace(/^:::word-cards\n([\s\S]*?)^:::[\t ]*$/gm, '');
  if (/^:::word-cards/m.test(body)) throw new Error('Unclosed word-card definitions');
  const cards = new Map();
  if (blocks.length) {
    if (blocks[0][1].length > 16000) throw new Error('Word-card definitions too large');
    const values = JSON.parse(blocks[0][1]);
    if (!Array.isArray(values) || !values.length || values.length > 24) throw new Error('Invalid word-card list');
    const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
    const line = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 &&
      value.length <= max && !/[\r\n\x00-\x1f\x7f]/.test(value);
    for (const card of values) {
      if (!card || typeof card !== 'object' || Array.isArray(card) ||
          Object.keys(card).some(key => !['id','wordId','senseId','meaning','model','note','language'].includes(key)) ||
          !id(card.id) || !id(card.wordId) || !id(card.senseId) || !line(card.meaning, 240) ||
          (card.model !== undefined && !line(card.model, 160)) ||
          (card.note !== undefined && !line(card.note, 240)) ||
          (card.language !== undefined && !isLanguageTag(card.language)) ||
          cards.has(card.id)) throw new Error('Invalid word-card definition');
      cards.set(card.id, card);
    }
  }
  const used = new Set();
  const references = body.replace(/`[^`]*`/g, '');
  for (const match of references.matchAll(/\[([^\]\n]+)\]\(word:([^)]*)\)/g)) {
    if (match[1].length > 100 || /[<>\[\x00-\x1f]/.test(match[1]) || !cards.has(match[2])) {
      throw new Error('Unknown or invalid word-card reference: ' + match[2]);
    }
    used.add(match[2]);
  }
  if ((references.match(/\]\(word:/g) || []).length !==
      [...references.matchAll(/\[([^\]\n]+)\]\(word:([^)]*)\)/g)].length ||
      [...cards.keys()].some(key => !used.has(key))) throw new Error('Unused or malformed word-card reference');
  return { markdown: body, cards };
}
export function inlineMarkdown(text, { wordCards, interactiveWords = false } = {}) {
  const token = /\x60([^\x60]+)\x60|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([\s\S]+?)\*\*|\*([^*]+)\*| {2,}\n|\n/g;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(token)) {
    result += escapeHtml(text.slice(cursor, match.index));
    if (match[1] !== undefined) result += '<code>' + escapeHtml(match[1]) + '</code>';
    else if (match[2] !== undefined) {
      const card = match[3].startsWith('word:') && wordCards?.get(match[3].slice(5));
      if (interactiveWords && card) {
        result += '<button type="button" class="word-reference" data-word-card="' + escapeHtml(JSON.stringify(card)) +
          '" aria-expanded="false"' + (card.language ? ' lang="' + escapeHtml(card.language) + '"' : '') + '>' + escapeHtml(match[2]) + '</button>';
      } else {
        const href = safeLink(match[3]);
        result += href ? '<a href="' + escapeHtml(href) + '">' + inlineMarkdown(match[2], {wordCards,interactiveWords}) + '</a>' : inlineMarkdown(match[2], {wordCards,interactiveWords});
      }
    } else if (match[4] !== undefined) result += '<strong>' + inlineMarkdown(match[4], {wordCards,interactiveWords}) + '</strong>';
    else if (match[5] !== undefined) result += '<em>' + inlineMarkdown(match[5], {wordCards,interactiveWords}) + '</em>';
    else result += match[0] === '\n' ? ' ' : '<br>';
    cursor = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(cursor));
}
export function sectionSlug(title) {
  return title.toLocaleLowerCase('fi').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function pointHeading(text) {
  const match = /^(.*?)\s+\{#([^}]*)\}$/.exec(text);
  if (!match) {
    if (text.includes('{#')) throw new Error('Invalid content point');
    return {title:text};
  }
  if (!match[1].trim() || match[1].includes('{#') || match[2].length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(match[2])) {
    throw new Error('Invalid content point');
  }
  return {title:match[1], point:match[2]};
}
export function readContentPoints(markdown) {
  const points = new Set();
  let block = false;
  for (const line of markdown.replace(/\r\n?/g,'\n').split('\n')) {
    if (/^:::/.test(line)) { block = line.trim() !== ':::'; continue; }
    if (!line.includes('{#')) continue;
    const heading = /^### (.+)$/.exec(line);
    if (!heading || block) throw new Error('Content points require a top-level subheading');
    const {point} = pointHeading(heading[1]);
    if (!point || points.has(point) || points.size >= 32) throw new Error('Duplicate or invalid content point');
    points.add(point);
  }
  return [...points];
}
export function parseChapter(source, { sectionIds, dialogueLanguage } = {}) {
  if (dialogueLanguage !== undefined && !isLanguageTag(dialogueLanguage)) throw new Error('Invalid dialogue language');
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const body = normalized.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
  if (body.startsWith('---\n')) throw new Error('Unclosed chapter metadata');
  const sections = [];
  const used = new Set();
  let current;
  for (const line of body.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      if (heading[1].includes('{#')) throw new Error('Content points require a top-level subheading');
      const base = sectionSlug(heading[1]);
      let id = base;
      let suffix = 2;
      while (used.has(id)) id = base + '-' + suffix++;
      used.add(id);
      current = { id, title: heading[1], markdown: '', kind: /^Kohtaus/.test(heading[1]) ? 'dialogue' : 'text' };
      sections.push(current);
    } else if (current) current.markdown += line + '\n';
  }
  if (!sections.length) throw new Error('Chapter has no sections');
  if (sectionIds) {
    if (!Array.isArray(sectionIds) || sectionIds.length !== sections.length ||
        new Set(sectionIds).size !== sectionIds.length || sectionIds.some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
      throw new Error('Invalid stable section IDs');
    }
    sections.forEach((section, index) => { section.id = sectionIds[index]; });
  }
  return sections.map(section => {
    const markdown = section.markdown.trim();
    readWordCards(markdown);
    const points = readContentPoints(markdown);
    return { ...section, markdown, ...(points.length ? {points} : {}), ...(dialogueLanguage !== undefined ? {dialogueLanguage} : {}) };
  });
}
function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}
function startsBlock(line, dialogue) {
  return /^(#{1,3} |>|[-*] |\d+\. |---\s*$|\||:::)/.test(line) ||
    (dialogue && /^\*\*[^*]+:\*\*/.test(line));
}
function renderContentsTable(data) {
  const strings = values => Array.isArray(values) && values.every(value => typeof value === 'string');
  if (!data || !strings(data.columns) || data.columns.length !== 4 || !Array.isArray(data.rows) || !data.rows.length ||
      data.rows.some(row => !row || ['marker','title','href','use'].some(key => typeof row[key] !== 'string') ||
        !strings(row.topics) || !strings(row.concepts) || !strings(row.pending))) throw new Error('Invalid contents table');
  const label = index => '<span class="contents-cell-label" aria-hidden="true">' + escapeHtml(data.columns[index]) + '</span>';
  const items = values => '<ul>' + values.map(value => '<li>' + inlineMarkdown(value) + '</li>').join('') + '</ul>';
  return '<div class="contents-matrix" role="region" aria-label="Lukujen sisältövertailu" tabindex="0"><table class="contents-table" role="table">' +
    '<caption class="sr-only">Lukujen tavoitteet, aiheet ja käsitteet</caption><thead role="rowgroup"><tr role="row">' +
    data.columns.map(column => '<th scope="col" role="columnheader">' + escapeHtml(column) + '</th>').join('') + '</tr></thead><tbody role="rowgroup">' +
    data.rows.map(row => {
      const href = safeLink(row.href);
      const title = inlineMarkdown(row.title);
      return '<tr role="row"><th scope="row" role="rowheader">' +
        (row.marker ? '<span class="contents-marker' + (/^\d+$/.test(row.marker) ? '' : ' is-label') + '">' + escapeHtml(row.marker) + '</span>' : '') +
        (href ? '<a href="' + escapeHtml(href) + '" aria-label="' + escapeHtml('Avaa ' + row.marker + ': ' + row.title) + '">' + title + '</a>' : title) +
        '</th><td role="cell">' + label(1) + '<p>' + inlineMarkdown(row.use) + '</p>' +
        (row.pending.length ? '<p class="contents-pending"><strong>Suunniteltu täydennys:</strong> ' + row.pending.map(inlineMarkdown).join('; ') + '</p>' : '') +
        '</td><td role="cell">' + label(2) + items(row.topics) + '</td><td role="cell">' + label(3) + items(row.concepts) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
export function renderMarkdown(markdown, { dialogue = false, responsiveTable = false, indexReferences = 'optional', modelTable = false, contentsTable = false, compactSceneHelp = false, messageSceneHelp = false, roleTable, tableStyle,
  wordCards, interactiveWords = false, dialogueLanguage } = {}) {
  if (dialogueLanguage !== undefined && !isLanguageTag(dialogueLanguage)) throw new Error('Invalid dialogue language');
  if (!['optional','omit'].includes(indexReferences)) throw new Error('Invalid index reference display');
  if(roleTable!==undefined&&(!roleTable||!Array.isArray(roleTable.headers)||roleTable.headers.length<2||roleTable.headers.length>6||
      roleTable.headers.some(h=>typeof h!=='string'||!h.trim()||h.length>160)||!Number.isInteger(roleTable.privateColumn)||
      roleTable.privateColumn<1||roleTable.privateColumn>=roleTable.headers.length))throw new Error('Invalid role table display');
  if (!wordCards) {
    const prepared = readWordCards(markdown);
    markdown = prepared.markdown;
    wordCards = prepared.cards;
  }
  const inline = text => inlineMarkdown(text, {wordCards,interactiveWords});
  readContentPoints(markdown);
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith(':::spatial-table')) {
      const label = /^:::spatial-table (.{1,160})$/.exec(line)?.[1];
      const body = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      if (!label || i === lines.length) throw new Error('Invalid spatial table');
      i++;
      const grid = body.filter(value => value.trim());
      const headings = cells(grid[0] || '');
      if (grid.length < 3 || grid.length > 14 || headings.length < 2 || headings.length > 12 ||
          !/^\|[\s:|-]+\|$/.test(grid[1]) ||
          grid.some(value => !/^\|.*\|$/.test(value)) ||
          grid.slice(2).some(value => cells(value).length !== headings.length)) {
        throw new Error('Spatial table must be a rectangular Markdown table');
      }
      const rows = grid.slice(2).map(value => '<tr>' + cells(value).map((cell, index) =>
        index === 0 ? '<th scope="row">' + inline(cell) + '</th>' :
          '<td>' + inline(cell) + '</td>').join('') + '</tr>').join('');
      output.push('<p class="map-pan-hint">Pienellä näytöllä vieritä karttaa sivusuunnassa. Paikkojen sijainti ei muutu.</p>' +
        '<div class="table-wrap spatial-map" role="region" aria-label="' + escapeHtml(label) +
        ' – vieritettävä kartta" tabindex="0"><table class="table-spatial"><caption>' + escapeHtml(label) +
        '</caption><thead><tr>' + headings.map(cell => '<th scope="col">' + inlineMarkdown(cell) +
        '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>');
      continue;
    }
    if (line.startsWith(':::role-card')) {
      const role = /^:::role-card (.+)$/.exec(line);
      if (!role || !role[1].trim() || role[1].length > 160) throw new Error('Invalid role card title');
      const body = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      if (i === lines.length || !body.join('').trim() || body.some(value => /^:::/.test(value))) {
        throw new Error('Invalid role card block');
      }
      i++;
      output.push('<details class="role-card"><summary>' + escapeHtml(role[1]) + '</summary><div class="role-card-body">' +
        renderMarkdown(body.join('\n'), {wordCards,interactiveWords}) + '</div></details>');
      continue;
    }
    if (line === ':::contents-table') {
      if (!contentsTable) throw new Error('Contents table outside a contents opening');
      const body = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      if (i === lines.length) throw new Error('Unclosed contents table');
      i++;
      output.push(renderContentsTable(JSON.parse(body.join('\n'))));
      continue;
    }
    const support = /^:::(word-help|extra-help) (.+)$/.exec(line);
    if (support) {
      const body = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      if (i === lines.length || body.some(value => /^:::/.test(value))) throw new Error('Invalid reading support block');
      i++;
      const pairs = [], notes = [];
      for (const value of body) {
        const reference = /^\[([^\]\n]+)\]\(word:([a-z0-9]+(?:-[a-z0-9]+)*)\)$/.exec(value);
        if (reference) {
          const card = wordCards.get(reference[2]);
          if (!card) throw new Error('Missing word-card meaning');
          pairs.push('<div><dt>' + escapeHtml(reference[1]) + '</dt><dd>' + escapeHtml(card.meaning) + '</dd></div>');
          continue;
        }
        const pair = /^\*([^*]+)\* = (.+)$/.exec(value);
        if (pair) pairs.push('<div><dt>' + inline(pair[1]) + '</dt><dd>' + inline(pair[2]) + '</dd></div>');
        else notes.push(value);
      }
      const content = (pairs.length ? '<dl class="word-help-list">' + pairs.join('') + '</dl>' : '') +
        renderMarkdown(notes.join('\n'), {wordCards,interactiveWords});
      const title = inline(support[2]);
      output.push(support[1] === 'word-help' ? '<section class="word-help"><h3>' + title + '</h3>' + content + '</section>' :
        '<details class="extra-help"><summary>' + title + '</summary><div class="extra-help-body">' + content + '</div></details>');
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const {title,point} = pointHeading(heading[2]);
      output.push('<h3' + (point ? ' data-content-point="' + escapeHtml(point) + '" tabindex="-1"' : '') + '>' + inline(title) + '</h3>'); i++; continue;
    }
    if (/^---\s*$/.test(line)) { output.push('<hr>'); i++; continue; }
    if (/^>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^> ?/, ''));
      // A quote that opens with a bold label ending in a colon ("**Label:** text") is a
      // note in the instruction language, not a quoted message; it keeps the UI typeface.
      const note=/^\*\*[^*\n]{1,40}:\*\*/.test(quote[0]||'');
      output.push('<blockquote'+(note?' class="note"':'')+'>' + renderMarkdown(quote.join('\n'), {wordCards,interactiveWords}) + '</blockquote>');
      continue;
    }
    if (/^\|/.test(line) && /^\|?[\s:|-]+\|/.test(lines[i + 1] || '')) {
      let headings = cells(line); i += 2;
      const semanticTable = responsiveTable || modelTable;
      const references = responsiveTable && headings.length === 3;
      const omitReferences = references && indexReferences === 'omit';
      const privateColumn=roleTable&&JSON.stringify(headings)===JSON.stringify(roleTable.headers)?roleTable.privateColumn:-1;
      if (omitReferences) headings = headings.slice(0,2);
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const values = cells(lines[i++]);
        rows.push('<tr' + (semanticTable ? ' role="row"' : '') + '>' + (omitReferences ? values.slice(0,2) : values).map((cell,index) => '<td' +
          (privateColumn===index ? ' class="role-private-cell"' : references && !omitReferences && index===2 ? ' class="index-reference-cell"' : '') +
          (semanticTable ? ' role="cell"' : '') + '>' +
          (modelTable ? '<span class="model-cell-label" aria-hidden="true">' + inline(headings[index] || '') + '</span>' : '') +
          (privateColumn===index?'<details class="role-private"><summary aria-label="Näytä oma tieto: '+escapeHtml(values[0])+'">Näytä oma tieto</summary><div>'+inline(cell)+'</div></details>':inline(cell)) + '</td>').join('') + '</tr>');
      }
      const optionalReferences = references && !omitReferences;
      const columnPair = interactiveWords && headings.length === 2 && !responsiveTable && !roleTable && !tableStyle;
      output.push((optionalReferences ? '<div class="index-view"><details class="index-references-control"><summary>Lukuviitteet ja sanaston roolit</summary><p>Viite avaa sanan käyttöluvun. Ydin = yhdessä harjoiteltava, valitse = omaan vastaukseen valittava, tuki = ymmärtämisen apu.</p></details>' : '') +
        '<div class="table-wrap" role="region" aria-label="Ilmaukset" tabindex="0"' + (columnPair ? ' data-column-pair' : '') + '><table' +
        (semanticTable ? ' class="' + (responsiveTable ? 'table-index' : 'table-model'+(tableStyle==='schedule'?' table-schedule':'')) + '" role="table"' : '') + '><thead' +
        (semanticTable ? ' role="rowgroup"' : '') + '><tr' + (semanticTable ? ' role="row"' : '') + '>' +
        headings.map((cell,index) => '<th scope="col"' + (semanticTable ? ' role="columnheader"' : '') +
          (optionalReferences && index===2 ? ' class="index-reference-cell"' : '') + '>' + inline(cell) + '</th>').join('') +
        '</tr></thead><tbody' + (semanticTable ? ' role="rowgroup"' : '') + '>' + rows.join('') + '</tbody></table></div>' + (optionalReferences ? '</div>' : ''));
      continue;
    }
    const list = /^([-*]|\d+\.) (.+)$/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const tag = ordered ? 'ol' : 'ul';
      const first = ordered ? Number.parseInt(list[1], 10) : 1;
      const pattern = ordered ? /^\d+\. (.+)$/ : /^[-*] (.+)$/;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        const item = [pattern.exec(lines[i++])[1]];
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item.push(lines[i++].trim());
        items.push('<li>' + inline(item.join('\n')) + '</li>');
      }
      output.push('<' + tag + (ordered && first !== 1 ? ' start="' + first + '"' : '') + '>' + items.join('') + '</' + tag + '>');
      continue;
    }
    if (dialogue && /^\*\*[^*]+:\*\*/.test(line)) {
      const turns = [];
      while (i < lines.length) {
        const speaker = /^\*\*([^*]+):\*\*\s*(.*)$/.exec(lines[i]);
        if (!speaker) break;
        i++;
        const speech = [speaker[2]];
        while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], true)) speech.push(lines[i++]);
        const key = ['Saga', 'Leo', 'Milo'].includes(speaker[1]) ? speaker[1].toLowerCase() : 'other';
        turns.push('<div class="dialogue-turn speaker-' + key + '"><dt>' + escapeHtml(speaker[1]) +
          '</dt><dd' + (dialogueLanguage ? ' lang="' + escapeHtml(dialogueLanguage) + '"' : '') +
          '>' + inline(speech.join('\n')) + '</dd></div>');
        while (i < lines.length && !lines[i].trim()) i++;
      }
      output.push('<dl class="dialogue">' + turns.join('') + '</dl>');
      continue;
    }
    if (/^\*\*Ääni /.test(line)) {
      const availability = /äänite tuotetaan myöhemmin/i.test(line) ? '' : '<small>Äänite ei vielä saatavilla.</small>';
      output.push('<p class="audio-note">' + inline(line) + availability + '</p>');
      i++; continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], dialogue)) paragraph.push(lines[i++]);
    output.push('<p>' + inline(paragraph.join('\n')) + '</p>');
  }
  // Adjacent cards share one disclosure group; other tasks/copies remain independent.
  for (let n = 0; n < output.length; n++) {
    if (!output[n].startsWith('<details class="role-card">')) continue;
    let end = n + 1;
    while (end < output.length && output[end].startsWith('<details class="role-card">')) end++;
    output.splice(n, end - n, '<div class="role-cards" role="group" aria-label="Paritehtävän kortit">' +
      output.slice(n, end).join('\n') + '</div>');
  }
  const firstHelp = output.findIndex(item => item.startsWith('<section class="word-help">'));
  const firstSpeech = output.findIndex(item => item.startsWith('<dl class="dialogue">'));
  let firstReading=firstSpeech;
  // A complete supported message and the replies form one reading unit.
  // This optional layout changes wrappers only, not prose or task order.
  const firstMessage=output.findIndex(item=>/^<blockquote[ >]/.test(item));
  if(messageSceneHelp&&dialogue&&firstHelp>=0&&firstMessage>firstHelp&&firstMessage<firstSpeech&&
      output.filter(item=>/^<blockquote[ >]/.test(item)).length===1&&
      output.filter(item=>item.startsWith('<dl class="dialogue">')).length===1&&
      output.slice(firstHelp,firstMessage).every(item=>/^<(?:section class="word-help"|details class="extra-help")>/.test(item))&&
      output.slice(firstMessage).every(item=>/^<(?:p(?: |>)|h3(?: |>)|ol>|ul>|blockquote(?: class="note")?>|dl class="dialogue">)/.test(item)))firstReading=firstMessage;
  const hint = interactiveWords && output.some(item => item.includes('class="word-reference"')) ?
    '<p class="word-card-hint">Alleviivattua sanaa painamalla näet sen merkityksen.</p>' : '';
  if (dialogue && firstHelp >= 0 && firstReading > firstHelp &&
      output.slice(firstHelp, firstReading).every(item => /^<(?:section class="word-help"|details class="extra-help")>/.test(item))) {
    if (compactSceneHelp) return hint + output.slice(0,firstHelp).join('\n') +
      '<div class="editorial-scene"><details class="scene-support"><summary>Sanat avuksi</summary><aside class="scene-support-body" aria-label="Lukemisen tuki">'+
      output.slice(firstHelp,firstReading).join('\n')+'</aside></details><div class="scene-main">'+
      output.slice(firstReading).join('\n')+'</div></div>';
    return hint + output.slice(0, firstHelp).join('\n') + '<div class="scene-reading"><aside class="scene-help" aria-label="Lukemisen tuki">' +
      output.slice(firstHelp, firstReading).join('\n') + '</aside><div class="scene-main">' +
      output.slice(firstReading).join('\n') + '</div></div>';
  }
  return hint + output.join('\n');
}
function openingIllustration(section, presentation) {
  const image=presentation?.opening;
  if (presentation?.style!=='illustrated' || image?.section!==section.id ||
      !/^design-media\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{64}\.png$/.test(image.file) ||
      typeof image.alt!=='string' || !image.alt.trim() || image.alt.length>600 ||
      ![image.width,image.height].every(n=>Number.isInteger(n)&&n>=256&&n<=2048)) return '';
  const sign=typeof image.sign==='string' && image.sign.length<=40 ? image.sign : '';
  if(image.signLayout!==undefined && (image.signLayout!=='notice' || !sign))return '';
  if(image.sticker!==undefined && (image.signLayout!=='notice' || typeof image.sticker!=='string' || !image.sticker.trim() || image.sticker.length>12))return '';
  const notice=image.signLayout==='notice';
  return '<figure class="opening-illustration"'+(image.slot?' data-illustration-slot="'+escapeHtml(image.slot)+'"':'')+'><div class="opening-image"><img src="'+escapeHtml(image.file)+
    '" width="'+image.width+'" height="'+image.height+'" alt="'+escapeHtml(image.alt)+'" decoding="async">'+
    (sign?'<span class="opening-sign'+(notice?' opening-sign-notice':'')+'" aria-hidden="true">'+escapeHtml(sign)+'</span>':'')+
    (image.sticker?'<span class="opening-sticker" aria-hidden="true">'+escapeHtml(image.sticker)+'</span>':'')+
    '</div><figcaption>Kuvitusluonnos · paikallinen taittokokeilu</figcaption></figure>';
}
function illustrationPlaceholder(section, slots) {
  const slot=Array.isArray(slots)?slots.find(item=>item?.section===section.id):null;
  if(!slot || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slot.id) ||
      [slot.title,slot.purpose].some(value=>typeof value!=='string'||!value.trim()||value.length>300)||
      !Array.isArray(slot.ratio)||slot.ratio.length!==2||slot.ratio.some(n=>!Number.isInteger(n)||n<1||n>16)||
      slot.ratio[0]/slot.ratio[1]<1.5||slot.ratio[0]/slot.ratio[1]>2)return '';
  return '<figure class="illustration-placeholder" data-illustration-slot="'+escapeHtml(slot.id)+'">'+
    '<div class="illustration-space"><svg viewBox="0 0 '+slot.ratio.join(' ')+'" aria-hidden="true" focusable="false"></svg>'+
    '<div class="illustration-label"><span>Kuvitus tulossa</span><strong>'+escapeHtml(slot.title)+'</strong></div></div>'+
    '<figcaption>'+escapeHtml(slot.purpose)+'</figcaption></figure>';
}
function closingIllustration(section,presentation,edition) {
  const image=presentation?.closing,last=edition?.sections?.at(-1);
  if(presentation?.style!=='illustrated'||last?.family!=='closing'||last.id!==section.id||image?.section!==section.id||
      Object.keys(image).sort().join(',')!=='alt,file,height,section,slot,width'||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(image.slot)||image.slot===presentation.opening?.slot||
      !/^design-media\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{64}\.png$/.test(image.file)||
      typeof image.alt!=='string'||!image.alt.trim()||image.alt.length>600||
      ![image.width,image.height].every(n=>Number.isInteger(n)&&n>=256&&n<=2048)||
      image.width/image.height<1.5||image.width/image.height>2)return '';
  return '<figure class="closing-illustration" data-illustration-slot="'+escapeHtml(image.slot)+'"><img src="'+escapeHtml(image.file)+
    '" width="'+image.width+'" height="'+image.height+'" alt="'+escapeHtml(image.alt)+'" loading="lazy" decoding="async">'+
    '<figcaption>Kuvitusluonnos · paikallinen taittokokeilu</figcaption></figure>';
}
export function renderSection(section, { chapter, pageLabel = '', focusable = false, idPrefix = '', supportType = chapter?.supportType, presentation = chapter?.presentation, illustrationSlots = chapter?.illustrationSlots, learningVisuals = chapter?.learningVisuals, readerEdition = chapter?.readerEdition, practiceLinks = [], afterTitle = '' } = {}) {
  const contents = supportType === 'contents';
  const models = ['markdown','grammar-guide','phrase-guide'].includes(supportType);
  const marker = chapter?.label ?? chapter?.number;
  const opening = chapter ? '<div class="chapter-opening">' +
    (marker !== undefined ? '<span class="chapter-number' + (chapter.label ? ' chapter-label' : '') + '" aria-hidden="true">' + escapeHtml(marker) + '</span>' : '') +
    '<h1' + (contents ? ' class="sr-only"' : '') + '>' + (marker !== undefined ? '<span class="sr-only">' + escapeHtml(marker) + (chapter.label ? ' – ' : '. ') + '</span>' : '') + escapeHtml(chapter.title) + '</h1></div>' : '';
  const illustrated=presentation?.style==='illustrated';
  const family=readerEditionFamily(readerEdition,section),editorial=illustrated||!!family;
  const map=readerEdition?.map,roleTable=map?.taskSection===section.id?map.roles:undefined;
  const tableStyle=illustrated && presentation.tables?.find(item=>item.section===section.id)?.kind;
  let body=renderMarkdown(section.markdown, { dialogue: section.kind === 'dialogue', dialogueLanguage: section.dialogueLanguage,
    responsiveTable: supportType === 'vocabulary-index', modelTable: models || editorial, compactSceneHelp: illustrated&&!family,
    messageSceneHelp:!!family,roleTable,tableStyle, contentsTable: contents, interactiveWords: true });
  const diagram=illustrated && presentation.diagrams?.find(item=>item.section===section.id);
  if (diagram) body=decorateSpatialDiagram(body,section.markdown,diagram.binding,'reader-map-'+idPrefix+section.id);
  if (learningVisuals?.length) body=decorateLearningVisuals(body,learningVisuals,section.id);
  if (family) body=decorateReaderComparison(body,section,readerEdition.comparison);
  if (family) body=decorateReaderEdition(body,section,readerEdition,idPrefix);
  const repeat=readerEdition?.repeats?.find(item=>item.beforeSection===section.id);
  // A bounded source copy is a data table or quotation, not a sentence-pair drill.
  if (family&&repeat) body=decorateReaderSourceRepeat(body,repeat,renderMarkdown(repeat.source.markdown),idPrefix);
  const illustration=openingIllustration(section,presentation)||illustrationPlaceholder(section,illustrationSlots);
  return '<section class="paper-section' + (chapter ? ' section-opening' : '') + (editorial?' editorial-paper':'') + (family?' reader-edition family-'+family:'') +
    (chapter?.kind === 'back-matter' ? ' support-opening' : '') +
    (models ? ' model-support' : '') + (supportType === 'grammar-guide' ? ' grammar-support' : '') + (contents ? ' contents-page' : '') + '" tabindex="0"' +
    (focusable ? ' data-focus-section="' + escapeHtml(section.id) + '"' : '') +
    (pageLabel ? ' aria-label="' + escapeHtml(pageLabel) + '"' : ' aria-labelledby="title-' + escapeHtml(idPrefix + section.id) + '"') +
    ' data-section-id="' + escapeHtml(section.id) + '" id="section-' + escapeHtml(idPrefix + section.id) + '"><div class="paper-body">' +
    (focusable ? '<button type="button" class="section-open" data-open-section="' + escapeHtml(section.id) +
      '" aria-haspopup="dialog" aria-label="Näytä erikseen: ' + escapeHtml(section.title === 'Avausaukeama' ? chapter?.title || 'Aloitus' : section.title) + '">Näytä erikseen</button>' : '') +
    opening + illustration + '<h2 id="title-' + escapeHtml(idPrefix + section.id) + '">' +
    inlineMarkdown(section.title === 'Avausaukeama' ? 'Aloitus' : section.title) + '</h2>' + afterTitle +
    body + closingIllustration(section,presentation,readerEdition) +
    (practiceLinks.length ? '<nav class="section-practice" aria-label="Tähän aiheeseen liittyvät digitehtävät"><p>Harjoittele työkirjassa</p><ul>' +
      practiceLinks.map(link=>'<li><a href="'+escapeHtml(link.href)+'">'+escapeHtml(link.title)+'<span aria-hidden="true"> ›</span></a></li>').join('') +
      '</ul></nav>' : '') + '</div></section>';
}
