// Automatically checked practice sets. A wrong answer shows the correct answer and
// a short explanation. Only each set's best practice round is kept, in this browser's
// storage, so a returning learner sees what is done; answers themselves are not stored.
// The score is tied to a revision of the set's task content: a changed task starts afresh.
import {escapeHtml as e} from './content.mjs';
import {bookUrl, drillUrl} from './routes.mjs';

export function drillsOf(book) { return book?.localDrills ?? []; }

// Case is ignored with the drill language's own rules (German noun capitals are a later, explicit option).
export function normalizeAnswer(value, language) {
  return String(value).normalize('NFC').toLocaleLowerCase(language || undefined).replace(/\s+/gu, ' ').trim().replace(/[.!?]+$/u, '').trim();
}
export function checkAnswer(item, value, language) {
  const given = normalizeAnswer(value ?? '', language);
  return given.length > 0 && item.answers.some(answer => normalizeAnswer(answer, language) === given);
}

export function drillLinks(book, chapter) {
  return drillsOf(book).filter(drill => !chapter || drill.chapterId === chapter.id).map(drill =>
    '<a class="button" href="' + e(drillUrl(book.id, drill.id)) + '">' + e(drill.title) +
    '<small class="drill-progress" data-drill-progress="' + e(drill.id) + '" hidden></small></a>').join('');
}

/** Same words as the printed workbook: an outlined number and "valittava". */
export function routeTag(route) {
  return route === 'optional' || route === 'alternative' ? ' <span class="route-tag">valittava</span>' : '';
}

/** Online practice for one workbook page: the drill sets whose paper task is on it. */
export function drillPageLinks(book, page) {
  const links = drillsOf(book).flatMap(drill => drill.sets.filter(set => set.workbookPages?.includes(page)).map(set =>
    '<a class="button" href="' + e(drillUrl(book.id, drill.id, set.id)) + '">Harjoittele sähköisesti<small>' + e(set.title) + routeTag(set.workbookRoute) + '</small></a>'));
  return links.length ? '<h2 class="workbook-drill-title">Tämän sivun digiharjoitus</h2><div class="workbook-drill-links">' + links.join('') + '</div>' +
    '<p class="muted">Tarkistuu heti. Paperin tehtävä on sama: sähköinen tekotapa ei ole toinen pakollinen tehtävä, joten tee jompikumpi tai molemmat.</p>' : '';
}
export function drillInvitation(book) {
  const drills = drillsOf(book);
  if (!drills.length) return '';
  return '<section class="drill-invitation" id="lisaa-harjoitusta" tabindex="-1"><h2>Lisää harjoitusta</h2>' +
    '<p>Valinnaisia tehtäviä, jotka tarkistuvat heti. Väärän vastauksen jälkeen näet oikean vastauksen ja lyhyen selityksen.</p>' +
    drills.map(drill => {
      const chapter = book.chapters.find(item => item.id === drill.chapterId);
      const count = drill.sets.reduce((sum, set) => sum + set.items.length, 0);
      return '<article><h3>' + e(drill.title) + '</h3><p>' + e((chapter?.number ? 'Luku ' + chapter.number + ' · ' : '') +
        drill.sets.length + ' tehtävää, ' + count + ' kohtaa') + '</p><p class="drill-progress" data-drill-progress="' + e(drill.id) + '" hidden></p><a class="button" href="' + e(drillUrl(book.id, drill.id)) +
        '">Aloita<span class="sr-only">: ' + e(drill.title) + '</span></a></article>';
    }).join('') + '</section>';
}

const blank = prompt => e(prompt).replace(/_{3,}/g, '<span class="drill-blank" aria-hidden="true">____</span>');

function itemView(drill, set, item) {
  const id = 'drill-' + set.id + '-' + item.id;
  const lang = item.promptLanguage ?? drill.language;
  const prompt = '<span class="drill-prompt" id="' + id + '-prompt"' + (lang ? ' lang="' + e(lang) + '"' : '') + '>' + blank(item.prompt) + '</span>';
  const feedback = '<p class="drill-feedback" id="' + id + '-feedback" role="status"></p>';
  if (set.type === 'choice') {
    return '<li class="drill-item" data-set="' + e(set.id) + '" data-item="' + e(item.id) + '"><fieldset><legend>' + prompt + '</legend>' +
      '<div class="drill-options">' + (item.options ?? set.options).map((option, index) =>
        '<label><input type="radio" name="' + id + '" value="' + e(option) + '" id="' + id + '-' + index + '">' +
        '<span' + (set.optionLanguage ? ' lang="' + e(set.optionLanguage) + '"' : '') + '>' + e(option) + '</span></label>').join('') +
      '</div></fieldset>' + feedback + '</li>';
  }
  return '<li class="drill-item" data-set="' + e(set.id) + '" data-item="' + e(item.id) + '"><label for="' + id + '">' + prompt + '</label>' +
    '<input type="text" id="' + id + '" autocomplete="off" autocapitalize="off" spellcheck="false" lang="' + e(drill.language) + '" aria-describedby="' + id + '-feedback">' +
    feedback + '</li>';
}

// Best practice rounds: {v:2, sets:{setId:{rev, best}}}. A round counts once every item
// of the set is answered. Readers get {setId: best} for sets whose revision still matches.
export function bestScoresKey(bookId, drillId) { return 'aukeama.drill.' + bookId + '.' + drillId; }
/** Revision of what the learner answers: instruction, passage, prompts, options and accepted
 * answers. Title and explanations are excluded, so wording or styling fixes keep the score. */
export function setRevision(set) {
  const text = JSON.stringify([set.type, set.instruction, set.options ?? null, set.passage ?? null,
    set.items.map(item => [item.id, item.prompt, item.answers, item.options ?? null, item.promptLanguage ?? null])]);
  let hash = 0x811c9dc5;
  for (const char of text) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(36);
}
function readStored(storage, bookId, drillId) {
  try {
    const value = JSON.parse(storage?.getItem(bestScoresKey(bookId, drillId)) || 'null');
    // Earlier stores without revisions cannot show which task version they belong to.
    return value?.v === 2 && value.sets && typeof value.sets === 'object' && !Array.isArray(value.sets) ? value.sets : {};
  } catch { return {}; }
}
export function readBestScores(storage, bookId, drill) {
  const stored = readStored(storage, bookId, drill.id), scores = {};
  for (const set of drill.sets) {
    const row = stored[set.id];
    if (row?.rev === setRevision(set) && Number.isInteger(row.best) && row.best >= 0) scores[set.id] = Math.min(row.best, set.items.length);
  }
  return scores;
}
export function recordBestScore(storage, bookId, drill, setId, correct) {
  const set = drill.sets.find(item => item.id === setId), stored = readStored(storage, bookId, drill.id);
  const previous = readBestScores(storage, bookId, drill)[setId];
  stored[setId] = {rev: setRevision(set), best: Number.isInteger(previous) && previous >= correct ? previous : correct};
  try { storage?.setItem(bestScoresKey(bookId, drill.id), JSON.stringify({v: 2, sets: stored})); } catch { /* Optional progress only. */ }
  return readBestScores(storage, bookId, drill);
}
/** Clear one named drill's rounds from both storages; other drills and own texts are untouched. */
export function clearBestScores(storages, bookId, drillId) {
  for (const storage of storages) { try { storage?.removeItem(bestScoresKey(bookId, drillId)); } catch { /* Nothing stored. */ } }
}
// Shared computers: a remembered choice keeps rounds in session storage only.
export const DRILL_STORAGE_PREFERENCE = 'aukeama.drill-storage';
export function sessionOnly(local) { try { return local?.getItem(DRILL_STORAGE_PREFERENCE) === 'session'; } catch { return false; } }
export function pickDrillStorage({getLocal = () => undefined, getSession = () => undefined} = {}) {
  let local, session;
  try { local = getLocal(); } catch { /* Storage blocked. */ }
  try { session = getSession(); } catch { /* Storage blocked. */ }
  return {local, session, active: sessionOnly(local) ? session : local};
}
function bestText(set, best) {
  return Number.isInteger(best) ? 'Paras harjoituskierros: ' + best + ' / ' + set.items.length + (best >= set.items.length ? ' ✓' : '') : '';
}
/** Same wording as the book page's progress: what is done first, then what went fully right. */
export function drillSummary(drill, scores = {}) {
  return drillProgressText(drill, scores) || 'Tehty 0 / ' + drill.sets.length + ' tehtävää.';
}
function stepState(set, best) {
  return !Number.isInteger(best) ? '' : best >= set.items.length ? '✓' : best + ' / ' + set.items.length;
}
/** The set a learner most likely wants: the first one not yet fully right. */
export function firstOpenSet(drill, scores = {}) {
  return drill.sets.find(set => !(scores[set.id] >= set.items.length))?.id ?? drill.sets[0]?.id;
}
const OVERVIEW = 'yhteenveto';
/** End-of-drill overview: which sets to try again. Rounds only, never the answers. */
export function drillOverview(drill, scores = {}) {
  const again = drill.sets.filter(set => !(scores[set.id] >= set.items.length));
  const row = set => {
    const best = scores[set.id], index = drill.sets.indexOf(set) + 1;
    return '<li><span class="drill-number">' + index + '</span><span>' + e(set.title) + '<small>' +
      (Number.isInteger(best) ? 'Paras kierros ' + best + ' / ' + set.items.length : 'Ei vielä tehty') + '</small></span>' +
      '<button type="button" data-drill-show="' + e(set.id) + '">' + (Number.isInteger(best) ? 'Tee uudelleen' : 'Tee nyt') +
      '<span class="sr-only">: ' + e(set.title) + '</span></button></li>';
  };
  return '<p>' + e(drillSummary(drill, scores)) + '</p>' + (again.length
    ? '<p>' + (drill.sets.some(set => Number.isInteger(scores[set.id])) ? 'Näihin kannattaa palata:' : 'Aloita mistä tahansa tehtävästä.') + '</p><ul class="drill-again">' + again.map(row).join('') + '</ul>'
    : '<p>Jokainen tehtävä on mennyt kaikki oikein. Palaa työkirjaan tai kokeile tehtäviä myöhemmin uudelleen.</p>');
}

/** Progress for a drill link; empty until the learner has finished at least one set here. */
export function drillProgressText(drill, scores = {}) {
  const tried = drill.sets.filter(set => Number.isInteger(scores[set.id])).length;
  if (!tried) return '';
  const perfect = drill.sets.filter(set => scores[set.id] >= set.items.length).length;
  return 'Tehty ' + tried + ' / ' + drill.sets.length + ' tehtävää' + (perfect ? ', niistä ' + perfect + ' kaikki oikein' : '') + '.';
}
/** Views are rendered without storage; the app fills progress into the placeholders afterwards. */
export function fillDrillProgress(root, book, storages) {
  const storage = pickDrillStorage(storages).active;
  for (const drill of drillsOf(book)) {
    const text = drillProgressText(drill, readBestScores(storage, book.id, drill));
    root.querySelectorAll('[data-drill-progress="' + drill.id + '"]').forEach(node => { node.textContent = text; node.hidden = !text; });
  }
}

// One set at a time: a long drill (eight sets, 40+ items) is otherwise one very long page.
function stepsNav(drill, scores, active) {
  if (drill.sets.length < 2) return '';
  return '<nav class="drill-steps" aria-label="Harjoituksen tehtävät"><ol>' + drill.sets.map((set, index) =>
    '<li><button type="button" data-drill-show="' + e(set.id) + '"' + (set.id === active ? ' aria-current="step"' : '') + '>' +
    '<span class="drill-number">' + (index + 1) + '</span><span class="sr-only">' + e(set.title) + '</span>' +
    '<span class="drill-step-state" id="drill-step-' + e(set.id) + '">' + stepState(set, scores[set.id]) + '</span></button></li>').join('') +
    '<li><button type="button" data-drill-show="' + OVERVIEW + '"' + (active === OVERVIEW ? ' aria-current="step"' : '') + '>Yhteenveto</button></li></ol></nav>';
}
function stepButtons(drill, index) {
  if (drill.sets.length < 2) return '';
  const previous = drill.sets[index - 1], next = drill.sets[index + 1];
  return '<p class="drill-step-buttons">' +
    (previous ? '<button type="button" data-drill-show="' + e(previous.id) + '">← Edellinen tehtävä</button>' : '') +
    '<button type="button" class="primary" data-drill-show="' + e(next ? next.id : OVERVIEW) + '">' +
    (next ? 'Seuraava tehtävä: ' + e(next.title) : 'Yhteenveto') + ' →</button></p>';
}

export function drillView(book, drill, scores = {}, {session = false, active = firstOpenSet(drill, scores)} = {}) {
  const chapter = book.chapters.find(item => item.id === drill.chapterId);
  return '<div class="page drill-page"><nav class="breadcrumbs" aria-label="Sijainti"><ol><li><a href="#/library">Kirjasto</a></li>' +
    '<li><a href="' + e(bookUrl(book.id)) + '">' + e(book.title) + '</a></li><li><span aria-current="page">Lisää harjoitusta</span></li></ol></nav>' +
    '<p class="eyebrow">Lisää harjoitusta' + (chapter ? ' · ' + e(chapter.title) : '') + '</p>' +
    '<h1 id="drill-title" tabindex="-1">' + e(drill.title) + '</h1><p>' + e(drill.intro) + '</p>' +
    '<p class="drill-summary" id="drill-summary">' + drillSummary(drill, scores) + '</p>' +
    '<div class="drill-storage"><p>Parhaat harjoituskierrokset tallentuvat vain tähän selaimeen, eivät vastauksia. ' +
    'Ne kertovat harjoittelusta, jossa palaute näyttää oikeat vastaukset, eivät koeosaamisesta.</p>' +
    '<label><input type="checkbox" id="drill-session"' + (session ? ' checked' : '') + '> Yhteiskäyttökone: säilytä tulokset vain, kunnes selain suljetaan</label>' +
    '<button type="button" id="drill-clear">Tyhjennä tämän harjoituksen tulokset</button>' +
    '<p class="drill-storage-status" id="drill-storage-status" role="status"></p></div>' +
    (drill.status !== 'ready' ? '<p class="draft-note">Luonnos: tehtävien kieli ja vastaukset tarkistetaan vielä.</p>' : '') +
    stepsNav(drill, scores, active) +
    drill.sets.map((set, index) =>
      '<section class="drill-set" data-set="' + e(set.id) + '" aria-labelledby="drill-set-' + e(set.id) + '"' + (set.id === active ? '' : ' hidden') + '>' +
      '<h2 id="drill-set-' + e(set.id) + '" tabindex="-1"><span class="drill-number">' + (index + 1) + '</span>' + e(set.title) + routeTag(set.workbookRoute) + '</h2>' +
      '<p>' + e(set.instruction) + '</p>' +
      (set.passage ? '<blockquote class="drill-passage" lang="' + e(drill.language) + '">' + set.passage.split('\n').map(e).join('<br>') + '</blockquote>' : '') +
      '<ol class="drill-items">' + set.items.map(item => itemView(drill, set, item)).join('') + '</ol>' +
      '<div class="drill-actions"><button type="button" class="primary" data-drill-check="' + e(set.id) + '">Tarkista</button>' +
      '<button type="button" data-drill-retry="' + e(set.id) + '" hidden>Yritä vääriä uudelleen</button>' +
      '<p class="drill-score" id="drill-score-' + e(set.id) + '" role="status"></p>' +
      '<p class="drill-best" id="drill-best-' + e(set.id) + '">' + bestText(set, scores[set.id]) + '</p></div>' +
      stepButtons(drill, index) + '</section>').join('') +
    (drill.sets.length ? '<section class="drill-overview" data-set="' + OVERVIEW + '" aria-labelledby="drill-set-' + OVERVIEW + '"' + (active === OVERVIEW ? '' : ' hidden') + '>' +
      '<h2 id="drill-set-' + OVERVIEW + '" tabindex="-1">Yhteenveto</h2><div id="drill-overview-body">' + drillOverview(drill, scores) + '</div></section>' : '') +
    '<p class="actions"><a href="' + e(bookUrl(book.id)) + '">Kirjan materiaaleihin</a></p></div>';
}

function valueOf(row) {
  const checked = row.querySelector('input[type="radio"]:checked');
  if (checked) return checked.value;
  return row.querySelector('input[type="text"]')?.value ?? '';
}

/** Check the answered items of one set (or one item). Unanswered items stay neutral,
 * so checking early never reveals the answers to items the learner has not tried. */
export function checkSet(root, drill, setId, onlyItem) {
  const set = drill.sets.find(item => item.id === setId);
  let correct = 0, wrong = 0, open = 0;
  for (const item of set.items) {
    const row = root.querySelector('.drill-item[data-set="' + setId + '"][data-item="' + item.id + '"]');
    if (onlyItem !== undefined && item.id !== onlyItem) {
      if (row.classList.contains('is-correct')) correct++;
      else if (row.classList.contains('is-wrong')) wrong++;
      else open++;
      continue;
    }
    const value = valueOf(row);
    const feedback = row.querySelector('.drill-feedback');
    if (!value.trim()) {
      row.classList.remove('is-correct', 'is-wrong');
      feedback.textContent = '';
      open++;
      continue;
    }
    const ok = checkAnswer(item, value, drill.language);
    row.classList.toggle('is-correct', ok);
    row.classList.toggle('is-wrong', !ok);
    if (ok) { correct++; feedback.textContent = 'Oikein.'; }
    else { wrong++; feedback.textContent = 'Ei vielä. Oikea vastaus: ' + item.answers[0] + '.' + (item.explanation ? ' ' + item.explanation : ''); }
  }
  root.querySelector('#drill-score-' + setId).textContent = correct + ' / ' + set.items.length + ' oikein' +
    (open ? ' · ' + open + ' vastaamatta' : '') + '.';
  const retry = root.querySelector('[data-drill-retry="' + setId + '"]');
  if (retry) retry.hidden = wrong === 0;
  return {correct, wrong, open, total: set.items.length};
}

/** Clear only the wrong answers so the learner tries them again without the model in view. */
export function retrySet(root, setId) {
  const rows = [...root.querySelectorAll('.drill-item.is-wrong[data-set="' + setId + '"]')];
  for (const row of rows) {
    row.classList.remove('is-wrong');
    row.querySelector('.drill-feedback').textContent = '';
    row.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = false; });
    const field = row.querySelector('input[type="text"]');
    if (field) field.value = '';
  }
  root.querySelector('#drill-score-' + setId).textContent = '';
  root.querySelector('[data-drill-retry="' + setId + '"]').hidden = true;
  rows[0]?.querySelector('input')?.focus();
}

export function createDrillWorkspace(root, storages = {}) {
  let current, bookId;
  const storage = () => pickDrillStorage(storages).active;
  function showScores(scores) {
    for (const set of current.sets) {
      root.querySelector('#drill-best-' + set.id).textContent = bestText(set, scores[set.id]);
      const step = root.querySelector('#drill-step-' + set.id);
      if (step) step.textContent = stepState(set, scores[set.id]);
    }
    root.querySelector('#drill-summary').textContent = drillSummary(current, scores);
    const overview = root.querySelector('#drill-overview-body');
    if (overview) overview.innerHTML = drillOverview(current, scores);
  }
  function show(setId) {
    const target = root.querySelector('.drill-page section[data-set="' + setId + '"]');
    if (!target) return;
    root.querySelectorAll('.drill-page section[data-set]').forEach(section => { section.hidden = section !== target; });
    root.querySelectorAll('.drill-steps [data-drill-show]').forEach(button => {
      if (button.dataset.drillShow === setId) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    const heading = target.querySelector('h2');
    heading?.focus({preventScroll: true});
    root.querySelector('.drill-steps')?.scrollIntoView?.({block: 'start'});
  }
  function remember(setId, result) {
    if (!result || result.open) return;
    showScores(recordBestScore(storage(), bookId, current, setId, result.correct));
  }
  root.addEventListener('change', event => {
    if (!current || event.target.id !== 'drill-session') return;
    const {local} = pickDrillStorage(storages);
    try {
      if (event.target.checked) local?.setItem(DRILL_STORAGE_PREFERENCE, 'session');
      else local?.removeItem(DRILL_STORAGE_PREFERENCE);
    } catch { /* Preference unavailable: the current page still works. */ }
    showScores(readBestScores(storage(), bookId, current));
    root.querySelector('#drill-storage-status').textContent = event.target.checked ?
      'Uudet tulokset säilyvät vain tämän selainistunnon ajan.' : 'Uudet tulokset säilyvät tässä selaimessa.';
  });
  root.addEventListener('click', event => {
    if (!current || !root.querySelector('.drill-page')) return;
    if (event.target.closest('#drill-clear')) {
      const {local, session} = pickDrillStorage(storages);
      clearBestScores([local, session], bookId, current.id);
      showScores({});
      root.querySelector('#drill-storage-status').textContent = 'Tämän harjoituksen tulokset tyhjennettiin. Muut harjoitukset ja omat tekstit säilyivät.';
      return;
    }
    const step = event.target.closest('[data-drill-show]');
    if (step) { show(step.dataset.drillShow); return; }
    const check = event.target.closest('[data-drill-check]');
    if (check) { remember(check.dataset.drillCheck, checkSet(root, current, check.dataset.drillCheck)); return; }
    const retry = event.target.closest('[data-drill-retry]');
    if (retry) retrySet(root, retry.dataset.drillRetry);
  });
  // Enter in a text answer checks that one answer.
  root.addEventListener('keydown', event => {
    if (!current || event.key !== 'Enter' || !event.target.matches?.('.drill-item input[type="text"]')) return;
    event.preventDefault();
    const row = event.target.closest('.drill-item');
    remember(row.dataset.set, checkSet(root, current, row.dataset.set, row.dataset.item));
  });
  return {
    mount(book, drill, {focus = true, setId} = {}) {
      current = drill; bookId = book.id;
      const scores = readBestScores(storage(), book.id, drill);
      // A link from a workbook page opens that page's set; an unknown set falls back to the usual start.
      const active = drill.sets.some(set => set.id === setId) ? setId : firstOpenSet(drill, scores);
      root.innerHTML = drillView(book, drill, scores, {session: sessionOnly(pickDrillStorage(storages).local), active});
      if (focus && setId && active === setId) root.querySelector('#drill-set-' + setId)?.focus({preventScroll: true});
      else if (focus) { root.querySelector('#drill-title').focus({preventScroll: true}); globalThis.scrollTo?.(0, 0); }
    },
    unmount() { current = undefined; }
  };
}
