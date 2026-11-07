import { escapeHtml as e } from './content.mjs';
import { readingOrder, readerUrl } from './routes.mjs';

/*
 * Learner-owned return marks ("omat paluumerkit"). Subject-neutral: a mark
 * names a book, chapter and section by their stable ids, never a page number.
 * Marks stay in this tab's memory unless the learner chooses to keep a book's
 * marks in this browser. Nothing is sent anywhere and no history is kept.
 */
export const returnMarksKey = 'aukeama.return-marks.v1';
export const MARK_KINDS = Object.freeze({
  return: Object.freeze({ label: 'Palaa tähän', hint: 'Haluan jatkaa tai harjoitella tätä myöhemmin.' }),
  ask: Object.freeze({ label: 'Haluan kysyä', hint: 'Haluan ottaa tämän kohdan esille opettajan kanssa.' })
});
const MAX_MARKS = 300, MAX_RAW = 120000;
const id = value => typeof value === 'string' && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function returnMarksEnabled(book, chapterId) {
  return !!book?.returnMarks?.chapters?.includes(chapterId);
}
export function markTitle(section) {
  const title = String(section?.title || '').replace(/[*_`]/g, '').trim();
  return (title === 'Avausaukeama' ? 'Aloitus' : title).slice(0, 200);
}
export function chapterName(chapter) {
  if (!chapter) return '';
  if (chapter.label) return chapter.label;
  return chapter.number !== undefined ? 'Luku ' + chapter.number : chapter.title;
}
function validMark(value) {
  return value && id(value.chapterId) && id(value.sectionId) && Object.hasOwn(MARK_KINDS, value.kind) &&
    text(value.title, 200) && text(value.version, 100) && (value.chapterName === undefined || text(value.chapterName, 120));
}
function fields(value) {
  return { chapterId: value.chapterId, sectionId: value.sectionId, kind: value.kind, title: value.title,
    version: value.version, ...(value.chapterName ? { chapterName: value.chapterName } : {}) };
}
/** Reads the stored books; broken entries are dropped one by one, never guessed. */
export function parseStoredMarks(raw) {
  const books = new Map();
  if (typeof raw !== 'string' || !raw || raw.length > MAX_RAW) return books;
  let value;
  try { value = JSON.parse(raw); } catch { return books; }
  if (value?.schemaVersion !== 1 || !value.books || typeof value.books !== 'object') return books;
  for (const [bookId, entry] of Object.entries(value.books)) {
    if (!id(bookId) || !Array.isArray(entry?.marks)) continue;
    const marks = [];
    for (const mark of entry.marks.slice(0, MAX_MARKS)) {
      if (validMark(mark) && !marks.some(item => item.chapterId === mark.chapterId && item.sectionId === mark.sectionId)) marks.push(fields(mark));
    }
    books.set(bookId, marks);
  }
  return books;
}

/**
 * Where a mark points in the current edition: 'ok', 'changed' (same id, other
 * title in the loaded chapter), 'moved' (an editorial redirect exists) or
 * 'missing'. A moved or missing mark is shown, never silently retargeted.
 */
export function resolveMark(book, mark, loaded = null) {
  const chapter = readingOrder(book).find(item => item.id === mark.chapterId);
  if (chapter?.sectionIds?.includes(mark.sectionId)) {
    const section = loaded?.chapter?.id === chapter.id && loaded.sections?.find(item => item.id === mark.sectionId);
    const title = section ? markTitle(section) : mark.title;
    return { status: section && title !== mark.title ? 'changed' : 'ok', chapter, title };
  }
  const redirect = book.sectionRedirects?.find(item => item.chapterId === mark.chapterId && item.sectionId === mark.sectionId);
  const target = redirect && readingOrder(book).find(item => item.id === redirect.targetChapterId);
  if (target?.sectionIds?.includes(redirect.targetSectionId)) {
    return { status: 'moved', chapter: target, sectionId: redirect.targetSectionId, title: mark.title };
  }
  return { status: 'missing', chapter, title: mark.title };
}

export function createReturnMarkStore(getStorage) {
  const memory = new Map();
  const persisted = new Set();
  let available = true;
  try {
    for (const [bookId, marks] of parseStoredMarks(getStorage().getItem(returnMarksKey))) {
      memory.set(bookId, marks);
      persisted.add(bookId);
    }
  } catch { available = false; }
  const errors = new Set();
  function write() {
    const books = {};
    for (const bookId of persisted) books[bookId] = { marks: memory.get(bookId) || [] };
    const storage = getStorage();
    if (!persisted.size) storage.removeItem(returnMarksKey);
    else storage.setItem(returnMarksKey, JSON.stringify({ schemaVersion: 1, books }));
  }
  function commit(bookId) {
    if (!persisted.has(bookId)) return true;
    try { write(); errors.delete(bookId); return true; }
    catch { errors.add(bookId); return false; }
  }
  const list = bookId => memory.get(bookId) || [];
  return {
    list,
    get: (bookId, chapterId, sectionId) => list(bookId).find(mark => mark.chapterId === chapterId && mark.sectionId === sectionId) || null,
    set(bookId, mark) {
      if (!id(bookId) || !validMark(mark)) return null;
      const marks = list(bookId).filter(item => !(item.chapterId === mark.chapterId && item.sectionId === mark.sectionId));
      if (marks.length >= MAX_MARKS) return null;
      marks.push(fields(mark));
      memory.set(bookId, marks);
      return { saved: commit(bookId) };
    },
    remove(bookId, chapterId, sectionId) {
      const removed = list(bookId).filter(mark => mark.chapterId === chapterId && mark.sectionId === sectionId);
      if (!removed.length) return null;
      memory.set(bookId, list(bookId).filter(mark => !removed.includes(mark)));
      return { removed, saved: commit(bookId) };
    },
    clear(bookId) {
      const removed = list(bookId);
      memory.set(bookId, []);
      return { removed, saved: commit(bookId) };
    },
    /** Puts removed marks back unless the learner has marked that spot again. */
    restore(bookId, marks) {
      const current = list(bookId);
      const back = marks.filter(mark => validMark(mark) && !current.some(item => item.chapterId === mark.chapterId && item.sectionId === mark.sectionId));
      memory.set(bookId, [...current, ...back.map(fields)].slice(0, MAX_MARKS));
      return { saved: commit(bookId) };
    },
    storage: bookId => ({ persistent: persisted.has(bookId), error: errors.has(bookId), available }),
    persist(bookId, enabled) {
      if (!id(bookId)) return false;
      const before = persisted.has(bookId);
      if (enabled) persisted.add(bookId); else persisted.delete(bookId);
      try { write(); errors.delete(bookId); available = true; return true; }
      catch {
        if (before) persisted.add(bookId); else persisted.delete(bookId);
        errors.add(bookId);
        return false;
      }
    }
  };
}

// Shape carries the meaning as well as colour: bookmark outline, question mark, plus.
const SHAPES = {
  none: '<path d="M10 4v12M4 10h12"/>',
  return: '<path d="M6 3h8v14l-4-3-4 3z"/>',
  ask: '<circle cx="10" cy="10" r="8"/><path d="M7.7 7.7a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .8-1 1.5v.5"/><path d="M10 14.4v.2"/>'
};
export const markSymbolSvg = kind => '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" focusable="false">' + (SHAPES[kind] || SHAPES.none) + '</svg>';
const symbol = kind => '<span class="return-mark-symbol" data-kind="' + e(kind) + '" aria-hidden="true">' + markSymbolSvg(kind) + '</span>';

/** The heading control rendered with every section of a trial chapter; state is filled in later. */
export function returnMarkControl(section) {
  const title = markTitle(section);
  return '<div class="return-mark" data-return-mark-section="' + e(section.id) + '" data-return-mark-title="' + e(title) + '">' +
    '<button type="button" class="return-mark-toggle" data-return-mark-toggle aria-expanded="false">' +
    symbol('none') + '<span class="return-mark-text">Merkitse kohta</span><span class="sr-only">: ' + e(title) + '</span></button></div>';
}

export function storageSentence(state) {
  if (state.error) return 'Selain esti tallennuksen. Merkit ovat tallessa vain tämän välilehden ajan.';
  return state.persistent
    ? 'Merkit säilyvät tässä selaimessa. Ne eivät siirry toiselle laitteelle eivätkä palveluun.'
    : 'Merkit ovat tallessa vain tämän välilehden ajan. Ne katoavat, kun sivu ladataan uudelleen tai välilehti suljetaan.';
}

export function returnMarkMenu(title, current, state) {
  return '<div class="return-mark-menu" role="group" aria-label="' + e('Oma merkki: ' + title) + '">' +
    '<p class="return-mark-target">Kohde: <strong>' + e(title) + '</strong></p><div class="return-mark-choices">' +
    Object.entries(MARK_KINDS).map(([kind, item]) => '<button type="button" data-return-mark-kind="' + kind + '" aria-pressed="' + (current?.kind === kind) + '">' +
      symbol(kind) + '<span><strong>' + e(item.label) + '</strong><span class="return-mark-hint">' + e(item.hint) + '</span></span></button>').join('') +
    '</div>' + (current ? '<button type="button" class="return-mark-remove" data-return-mark-remove>Poista merkki</button>' : '') +
    '<p class="return-mark-note">Oma muistutus, ei viesti opettajalle. ' + (state.error ? 'Selain esti tallennuksen; merkki on tallessa tämän välilehden ajan.'
      : state.persistent ? 'Säilyy tässä selaimessa.' : 'Tallessa tämän välilehden ajan.') + ' Kaikki merkit: Luvut › Omat merkit.</p></div>';
}

function itemLabel(resolved, mark) {
  return [mark.chapterName || chapterName(resolved.chapter) || 'Luku', resolved.title, MARK_KINDS[mark.kind].label].join(' · ');
}

export function returnMarksPanel(book, marks, { mode = 'spread', filter = 'all', loaded = null, state, message = '', undo = false } = {}) {
  const order = readingOrder(book).map(chapter => chapter.id);
  const position = mark => {
    const chapter = readingOrder(book).find(item => item.id === mark.chapterId);
    return [order.includes(mark.chapterId) ? order.indexOf(mark.chapterId) : order.length, chapter?.sectionIds?.indexOf(mark.sectionId) ?? 0];
  };
  const sorted = [...marks].sort((a, b) => { const [x, y] = [position(a), position(b)]; return x[0] - y[0] || x[1] - y[1]; });
  const shown = sorted.filter(mark => filter === 'all' || mark.kind === filter);
  const trial = (book.returnMarks?.chapters || []).map(chapterId => chapterName(readingOrder(book).find(item => item.id === chapterId))).filter(Boolean);
  const items = shown.map(mark => {
    const resolved = resolveMark(book, mark, loaded);
    const remove = '<button type="button" class="return-mark-list-remove" data-return-mark-list-remove="' + e(mark.chapterId + '/' + mark.sectionId) + '">Poista' +
      '<span class="sr-only"> merkki: ' + e(resolved.title) + '</span></button>';
    const label = symbol(mark.kind) + '<span>' + e(itemLabel(resolved, mark)) + '</span>';
    if (resolved.status === 'missing') {
      return '<li class="return-mark-item is-missing"><span class="return-mark-link">' + label + '</span>' +
        '<p class="return-mark-status">Kohtaa ei löydy tästä kirjan versiosta. Merkkiä ei siirretty toiseen kohtaan.</p>' + remove + '</li>';
    }
    const href = readerUrl(book.id, resolved.chapter.id, resolved.sectionId || mark.sectionId, mode);
    const note = resolved.status === 'moved'
      ? '<p class="return-mark-status">Kirjan uudessa versiossa kohta on yhdistetty toiseen osioon. Linkki avaa sen; merkitse uusi kohta itse, jos haluat.</p>'
      : resolved.status === 'changed' ? '<p class="return-mark-status">Kohdan otsikko on muuttunut. Aiemmin: ' + e(mark.title) + '.</p>' : '';
    return '<li class="return-mark-item"><a class="return-mark-link" href="' + e(href) + '">' + label + '</a>' + note + remove + '</li>';
  }).join('');
  const filters = marks.length ? '<fieldset class="return-mark-filter"><legend>Näytä</legend>' +
    [['all', 'Kaikki'], ...Object.entries(MARK_KINDS).map(([kind, item]) => [kind, item.label])].map(([value, label]) =>
      '<label><input type="radio" name="return-mark-filter" value="' + value + '"' + (filter === value ? ' checked' : '') + '> ' + e(label) +
      ' (' + (value === 'all' ? marks.length : marks.filter(mark => mark.kind === value).length) + ')</label>').join('') + '</fieldset>' : '';
  return '<h2 id="return-marks-title" tabindex="-1">Omat merkit</h2>' +
    '<p class="return-marks-intro">Omat muistutuksesi kirjan kohtiin. Merkit eivät lähde opettajalle.' +
    (trial.length ? ' Kokeilussa: ' + e(trial.join(', ')) + '.' : '') + '</p>' + filters +
    (shown.length ? '<ul class="return-mark-list">' + items + '</ul>'
      : '<p class="muted">' + (marks.length ? 'Ei tämän merkityksen merkkejä.' : 'Ei vielä merkkejä. Valitse luvun osion otsikon alta Merkitse kohta.') + '</p>') +
    (message ? '<p class="return-marks-message">' + e(message) + (undo ? ' <button type="button" data-return-mark-undo>Peru</button>' : '') + '</p>' : '') +
    '<div class="return-mark-storage"><label><input type="checkbox" id="return-marks-persist"' + (state.persistent ? ' checked' : '') + '> Säilytä tämän kirjan merkit tässä selaimessa</label>' +
    '<p class="return-mark-storage-note">' + e(storageSentence(state)) + (state.persistent ? ' Samaa selainprofiilia käyttävä näkee ne.' : '') + '</p>' +
    (marks.length ? '<button type="button" id="clear-return-marks">Tyhjennä tämän kirjan omat merkit</button>' : '') + '</div>';
}

/** Connects the controls inside the reader to one store. */
export function createReturnMarks(root, { getStorage, announce = () => {} }) {
  const store = createReturnMarkStore(getStorage);
  const document = root.ownerDocument;
  let context = null, filter = 'all', undo = null, message = '';
  const bar = section => [...root.querySelectorAll('.return-mark')].find(node => node.dataset.returnMarkSection === section);
  const toggleOf = section => bar(section)?.querySelector('[data-return-mark-toggle]');
  function closeMenu({ restore = true } = {}) {
    const menu = root.querySelector('.return-mark-menu');
    if (!menu) return false;
    const toggle = menu.closest('.return-mark')?.querySelector('[data-return-mark-toggle]');
    menu.remove();
    toggle?.setAttribute('aria-expanded', 'false');
    if (restore) toggle?.focus({ preventScroll: true });
    return true;
  }
  function decorateBars() {
    for (const node of root.querySelectorAll('.return-mark')) {
      const section = node.dataset.returnMarkSection, title = node.dataset.returnMarkTitle;
      const mark = store.get(context.book.id, context.chapter.id, section);
      const toggle = node.querySelector('[data-return-mark-toggle]');
      node.dataset.kind = mark?.kind || 'none';
      const icon = toggle.querySelector('.return-mark-symbol');
      if (icon.dataset.kind !== (mark?.kind || 'none')) { icon.dataset.kind = mark?.kind || 'none'; icon.innerHTML = markSymbolSvg(icon.dataset.kind); }
      toggle.querySelector('.return-mark-text').textContent = mark ? MARK_KINDS[mark.kind].label : 'Merkitse kohta';
      toggle.querySelector('.sr-only').textContent = mark ? ' – oma merkki kohdassa ' + title + '. Muuta tai poista' : ': ' + title;
      node.querySelector('[data-return-mark-undo-section]')?.remove();
      const removed = undo?.scope === 'section' && undo.marks[0];
      if (!mark && removed?.chapterId === context.chapter.id && removed.sectionId === section) {
        node.insertAdjacentHTML('beforeend', '<button type="button" class="return-mark-undo" data-return-mark-undo-section>Peru poisto' +
          '<span class="sr-only">: ' + e(title) + '</span></button>');
      }
    }
  }
  function renderPanel() {
    const panel = root.querySelector('#return-marks');
    if (!panel) return;
    const jump = root.querySelector('#jump-return-marks');
    if (jump) jump.innerHTML = symbol('return') + 'Omat merkit (' + store.list(context.book.id).length + ')';
    const active = document.activeElement, inside = active && panel.contains(active);
    const radio = inside && active.name === 'return-mark-filter' ? active.value : '', checkbox = inside && active.id === 'return-marks-persist';
    panel.innerHTML = returnMarksPanel(context.book, store.list(context.book.id), { mode: context.mode, filter, loaded: context,
      state: store.storage(context.book.id), message, undo: undo?.scope === 'list' });
    if (!inside) return;
    const target = radio ? panel.querySelector('input[name="return-mark-filter"][value="' + radio + '"]')
      : checkbox ? panel.querySelector('#return-marks-persist') : panel.querySelector('#return-marks-title');
    target?.focus({ preventScroll: true });
  }
  function decorate() {
    if (!context) return;
    decorateBars();
    renderPanel();
  }
  const savedNote = result => result?.saved === false ? ' Selain esti tallennuksen; merkki on tallessa vain tämän välilehden ajan.' : '';
  function say(text, visible = false) {
    message = visible ? text : '';
    announce(text);
  }
  function choose(node, kind) {
    const section = node.dataset.returnMarkSection, title = node.dataset.returnMarkTitle;
    const result = store.set(context.book.id, { chapterId: context.chapter.id, sectionId: section, kind, title,
      version: context.book.version, chapterName: chapterName(context.chapter) || undefined });
    undo = null;
    closeMenu();
    decorate();
    say(result ? 'Merkitty: ' + MARK_KINDS[kind].label + ' – ' + title + '.' + savedNote(result) : 'Merkkiä ei voitu lisätä.');
  }
  function removeMark(chapterId, sectionId, fromList) {
    const result = store.remove(context.book.id, chapterId, sectionId);
    if (!result) return;
    undo = { scope: fromList ? 'list' : 'section', marks: result.removed };
    if (!fromList) closeMenu();
    say('Merkki poistettu: ' + result.removed[0].title + '. Voit perua poiston.' + savedNote(result), fromList);
    decorate();
  }
  function restore() {
    if (!undo) return;
    const { scope, marks } = undo;
    const result = store.restore(context.book.id, marks);
    undo = null;
    say((marks.length > 1 ? 'Merkit palautettu.' : 'Merkki palautettu: ' + marks[0].title + '.') + savedNote(result), scope !== 'section');
    decorate();
    if (scope === 'section') toggleOf(marks[0].sectionId)?.focus({ preventScroll: true });
  }
  root.addEventListener('click', event => {
    if (!context) return;
    const button = event.target.closest?.('button');
    if (!button) return;
    // Panel controls are replaced on re-render; let the outside-click check see them first.
    if (button.closest('#return-marks, #jump-return-marks')) setTimeout(() => context && act(button));
    else act(button);
  });
  function act(button) {
    const node = button.closest('.return-mark');
    if (node && button.matches('[data-return-mark-toggle]')) {
      const open = node.querySelector('.return-mark-menu');
      closeMenu({ restore: false });
      if (open) { button.focus({ preventScroll: true }); return; }
      const mark = store.get(context.book.id, context.chapter.id, node.dataset.returnMarkSection);
      button.insertAdjacentHTML('afterend', returnMarkMenu(node.dataset.returnMarkTitle, mark, store.storage(context.book.id)));
      button.setAttribute('aria-expanded', 'true');
      const first = node.querySelector('[data-return-mark-kind][aria-pressed="true"]') || node.querySelector('[data-return-mark-kind]');
      first.focus({ preventScroll: true });
      node.querySelector('.return-mark-menu').scrollIntoView?.({ block: 'nearest' });
    } else if (node && button.dataset.returnMarkKind) choose(node, button.dataset.returnMarkKind);
    else if (node && button.matches('[data-return-mark-remove]')) removeMark(context.chapter.id, node.dataset.returnMarkSection, false);
    else if (button.matches('[data-return-mark-undo-section], [data-return-mark-undo]')) restore();
    else if (button.dataset.returnMarkListRemove) {
      const [chapterId, sectionId] = button.dataset.returnMarkListRemove.split('/');
      removeMark(chapterId, sectionId, true);
    } else if (button.id === 'jump-return-marks') {
      // The panel heading is sticky, so scroll the group to just below it.
      const nav = button.closest('#chapter-nav'), group = root.querySelector('#return-marks');
      if (nav && group) nav.scrollTop = Math.max(0, group.offsetTop - (nav.querySelector('.panel-heading')?.offsetHeight || 0) - 12);
      root.querySelector('#return-marks-title')?.focus({ preventScroll: true });
    } else if (button.id === 'clear-return-marks') {
      const result = store.clear(context.book.id);
      undo = result.removed.length ? { scope: 'list', marks: result.removed } : null;
      say('Tämän kirjan omat merkit tyhjennetty. Omat vastaukset ja harjoitustulokset säilyvät.' + savedNote(result), true);
      decorate();
    }
  }
  root.addEventListener('change', event => {
    if (!context) return;
    if (event.target.name === 'return-mark-filter') { filter = event.target.value; message = ''; renderPanel(); }
    else if (event.target.id === 'return-marks-persist') {
      const ok = store.persist(context.book.id, event.target.checked);
      say(ok ? (event.target.checked ? 'Tämän kirjan merkit tallennetaan nyt tähän selaimeen.'
        : 'Merkit poistettiin selaimen muistista. Ne ovat tallessa tämän välilehden ajan.')
        : 'Selain esti muutoksen. Valinta palautettiin ennalleen.', true);
      renderPanel();
    }
  });
  return {
    store,
    mount(book, chapter, sections, mode) {
      closeMenu({ restore: false });
      if (context?.book.id !== book.id) filter = 'all';
      undo = null;
      message = '';
      context = book.returnMarks ? { book, chapter, sections, mode } : null;
      decorate();
    },
    decorate,
    clear() { closeMenu({ restore: false }); context = null; },
    closeMenu
  };
}
