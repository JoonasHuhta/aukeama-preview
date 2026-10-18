import {createContentLoader, fetchCatalog} from './content-loader.mjs';
import { parseRoute, libraryUrl, readerUrl, readerReferenceUrl, readerPageSize, findSectionIndex, readingOrder } from './routes.mjs';
import { libraryView, resultList, resumeView, helpView, bookView, readerView, focusedSectionView, errorView, vocabularyResultsView } from './views.mjs';
import { createReadingState } from './reading-state.mjs';
import { createPreviewGuard } from './preview-updates.mjs';
import { closeOtherRoleCards } from './role-cards.mjs';
import { installWordCards } from './word-cards.mjs';
import { installPrintSupport, focusAfterPositionClear } from './print-support.mjs';

const main = document.querySelector('#main');
const printSupport = installPrintSupport(main, window);
const wordCards = installWordCards(main);
// toggle does not bubble; capture also covers freshly rendered focus-dialog copies.
main.addEventListener('toggle', event => { if (!printSupport.active) closeOtherRoleCards(event.target); }, true);
const previewGuard=createPreviewGuard({
  revision:new URL(import.meta.url).searchParams.get('build'),baseUrl:import.meta.url,
  onUpdate:()=>{document.querySelector('#preview-update').hidden=false;}
});
document.querySelector('#reload-preview').addEventListener('click',()=>location.reload());
if (previewGuard.enabled) {
  setInterval(()=>{if (!document.hidden) previewGuard.check();},20000);
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) previewGuard.check();});
  window.addEventListener('focus',()=>previewGuard.check());
}
let books = [];
let generation = 0;
let request;
let reader;
let lastRoute;
let focusAfterRoute = '';
const contentLoader = createContentLoader({baseUrl:import.meta.url});
const readingState = createReadingState(() => localStorage);
let sectionReturnTarget;
let sectionScroll = [];
function closeFocusedSection({ restore = true } = {}) {
  const dialog = document.querySelector('#focused-section');
  if (!dialog?.open) return;
  wordCards.close({ restore: false });
  dialog.close();
  if (restore && sectionReturnTarget?.isConnected) sectionReturnTarget.focus({ preventScroll: true });
  if (restore) for (const [element, top, left] of sectionScroll) {
    if (element.isConnected) { element.scrollTop = top; element.scrollLeft = left; }
  }
  sectionReturnTarget = undefined;
  sectionScroll = [];
}
function openFocusedSection(id, trigger) {
  if (!reader) return;
  const section = reader.sections.find(item => item.id === id);
  const dialog = document.querySelector('#focused-section');
  if (!section || !dialog || dialog.open) return;
  wordCards.close({ restore: false });
  if (typeof dialog.showModal !== 'function') {
    document.querySelector('#reader-status').textContent = 'Selain ei tue erillistä osionäkymää. Voit käyttää Koko luku -lukutapaa.';
    return;
  }
  for (const kind of ['contents', 'vocabulary', 'info']) toggleReaderPanel(kind, false);
  closeOptions();
  sectionReturnTarget = trigger;
  sectionScroll = [...document.querySelectorAll('.reader-content .paper-section, .reader-pages.is-chapter')]
    .map(element => [element, element.scrollTop, element.scrollLeft]);
  dialog.innerHTML = focusedSectionView(section, reader.chapter, reader.mode);
  dialog.showModal();
  document.querySelector('#close-focused-section').focus({ preventScroll: true });
  dialog.oncancel = event => { event.preventDefault(); closeFocusedSection(); };
}
let fontSize = 16;
let fullscreenReading = false;
const singlePage = window.matchMedia('(max-width: 899px)');
const compactControls = window.matchMedia('(max-width: 1199px)');
const pageSize = (chapter = reader?.chapter) => readerPageSize(chapter, singlePage.matches);
function focusControl(id) {
  const control = document.getElementById(id);
  (control?.getClientRects().length ? control : document.querySelector('#toggle-options'))?.focus({ preventScroll: true });
}
function closeOptions() {
  document.querySelector('.reader-page')?.classList.remove('is-options-open');
  document.querySelector('#toggle-options')?.setAttribute('aria-expanded', 'false');
}
try {
  const saved = Number(localStorage.getItem('aukeama.text-size'));
  if ([16, 18, 20, 22, 24].includes(saved)) fontSize = saved;
} catch { /* Reading works when browser storage is unavailable. */ }
document.documentElement.style.setProperty('--reader-zoom', fontSize / 16);

function setTitle(title) {
  document.title = title + ' – Aukeama';
}
function focusMain() {
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function syncFullscreenControls() {
  document.body.classList.toggle('is-reading-fullscreen', fullscreenReading);
  const button = document.querySelector('#toggle-fullscreen');
  if (button) {
    button.textContent = fullscreenReading ? 'Poistu koko ruudusta' : 'Koko ruutu';
    button.setAttribute('aria-pressed', String(fullscreenReading));
  }
}
async function leaveFullscreenReading({ focus = true } = {}) {
  fullscreenReading = false;
  syncFullscreenControls();
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* The expanded view can still close. */ }
  }
  if (focus) focusControl('toggle-fullscreen');
}
async function toggleFullscreenReading() {
  if (fullscreenReading) { await leaveFullscreenReading(); return; }
  fullscreenReading = true;
  syncFullscreenControls();
  try {
    if (!document.documentElement.requestFullscreen) throw new Error('Fullscreen unavailable');
    await document.documentElement.requestFullscreen();
  } catch {
    const status = document.querySelector('#reader-status');
    if (status) status.textContent = 'Laajennettu lukutila. Selaimen koko ruudun tila ei ole käytettävissä. Poistu painikkeesta tai Esc-näppäimellä.';
  }
  focusControl('toggle-fullscreen');
}
function toggleReaderPanel(kind, force) {
  if (kind === 'info') {
    const panel = document.querySelector('#reader-info');
    const button = document.querySelector('#toggle-info');
    if (!panel || !button) return;
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      closeOptions();
      toggleReaderPanel('contents', false);
      toggleReaderPanel('vocabulary', false);
      document.querySelector('#close-info').focus({ preventScroll: true });
    }
    return;
  }
  const vocabulary = kind === 'vocabulary';
  const panel = document.querySelector(vocabulary ? '#vocabulary-panel' : '#chapter-nav');
  const button = document.querySelector(vocabulary ? '#toggle-vocabulary' : '#toggle-contents');
  if (!panel || !button) return;
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  document.querySelector('.reader-layout')?.classList.toggle(vocabulary ? 'is-vocabulary-open' : 'is-nav-open', open);
  if (open) {
    closeOptions();
    toggleReaderPanel('info', false);
    // Only one supporting panel occupies the reading area at a time.
    toggleReaderPanel(vocabulary ? 'contents' : 'vocabulary', false);
    if (vocabulary) document.querySelector('#close-vocabulary').focus({ preventScroll: true });
    else document.querySelector('#close-contents')?.focus({ preventScroll: true });
  }
}
async function renderRoute({ initial = false } = {}) {
  const token = ++generation;
  request?.abort();
  if (await previewGuard.check() || token!==generation) return;
  wordCards.close({ restore: false });
  closeFocusedSection({ restore: false });
  request = new AbortController();
  main.removeAttribute('aria-busy');
  const route = parseRoute(location.hash);
  document.body.classList.toggle('is-reader', route.view === 'reader');
  if (route.view !== 'reader' && fullscreenReading) await leaveFullscreenReading({ focus: false });
  const previousRoute = lastRoute;
  lastRoute = route;
  for (const link of document.querySelectorAll('.site-header nav a')) {
    if ((route.view === 'library' && link.getAttribute('href') === '#/library') ||
        (route.view === 'help' && link.getAttribute('href') === '#/help')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  reader = null;
  if (route.view === 'library') {
    if (previousRoute?.view === 'library' && document.querySelector('#book-results')) {
      const resultHadFocus = document.querySelector('#book-results').contains(document.activeElement);
      document.querySelector('#search').value = route.query;
      document.querySelector('#book-results').innerHTML = resultList(books, route.query);
      if (resultHadFocus) document.querySelector('#search').focus();
    } else main.innerHTML = libraryView(books, route.query, readingState.get());
    setTitle('Kirjasto');
  } else if (route.view === 'help') {
    main.innerHTML = helpView();
    setTitle('Ohje');
  } else {
    let book = books.find(item => item.id === route.bookId);
    if (!book) {
      main.innerHTML = errorView('Sivua ei löytynyt', 'Tarkista osoite tai valitse kirja kirjastosta.');
      setTitle('Sivua ei löytynyt');
    } else if (route.view === 'book') {
      main.innerHTML = bookView(book);
      setTitle(book.title);
    } else {
      let chapter = readingOrder(book).find(item => item.id === route.chapterId);
      if (!chapter) {
        main.innerHTML = errorView('Lukua ei löytynyt', 'Valitse kirjan sisällysluettelosta olemassa oleva luku.');
        setTitle('Lukua ei löytynyt');
      } else {
        main.innerHTML = '<div class="reader-page"><p role="status">Ladataan lukua…</p></div>';
        main.setAttribute('aria-busy', 'true');
        try {
          const loaded = await contentLoader.load(book, chapter, {signal:request.signal,section:route.section});
          if (token !== generation) return;
          if (loaded.books) books = loaded.books;
          book = loaded.book;
          chapter = loaded.chapter;
          if (chapter.id !== route.chapterId || loaded.section !== route.section) {
            route.chapterId = chapter.id;
            route.section = loaded.section;
            history.replaceState(null, '', readerUrl(book.id, chapter.id, route.section, route.mode));
          }
          const sections = loaded.sections;
          const section = sections.find(item => item.id === route.section) || sections[0];
          const index = findSectionIndex(sections, section.id, route.mode, pageSize(chapter));
          reader = { book, chapter, sections, index, section: section.id, mode: route.mode };
          const returnTo = readingState.visit(books, { schemaVersion: 1, bookId: book.id, version: book.version,
            chapterId: chapter.id, sectionId: section.id, mode: route.mode });
          main.innerHTML = readerView(book, chapter, sections, index, route.mode, fontSize, section.id, pageSize(chapter), returnTo);
          syncFullscreenControls();
          setTitle(chapter.title + ' – ' + book.series + ' ' + book.grade);
          if (route.section && !focusAfterRoute) {
            focusAfterRoute = '';
            const target = document.getElementById('section-' + section.id);
            target.tabIndex = -1;
            if (route.mode === 'chapter') target.scrollIntoView({ block: 'start' });
            target.focus({ preventScroll: true });
            return;
          }
        } catch (error) {
          if (token !== generation || error.name === 'AbortError') return;
          main.innerHTML = errorView('Lukua ei voitu avata', 'Lataus epäonnistui. Yritä uudelleen.', true);
        } finally {
          if (token === generation) main.removeAttribute('aria-busy');
        }
      }
    }
  }
  if (token !== generation) return;
  if (!reader) document.body.classList.remove('is-reader');
  const focusTarget = focusAfterRoute && document.getElementById(focusAfterRoute);
  focusAfterRoute = '';
  if (focusTarget && !focusTarget.disabled) {
    window.scrollTo(0, 0);
    focusTarget.focus({ preventScroll: true });
  } else if (!initial && !(route.view === 'library' && previousRoute?.view === 'library')) focusMain();
}

function goToReader(chapter, section = '', mode = reader.mode) {
  location.hash = readerUrl(reader.book.id, chapter.id, section, mode);
}
async function turnPage(direction) {
  if (!reader) return;
  const current = reader;
  const index = current.index + direction * pageSize();
  if (current.mode === 'spread' && index >= 0 && index < current.sections.length) {
    goToReader(current.chapter, current.sections[index].id);
  }
}
main.addEventListener('submit', event => {
  if (event.target.id !== 'book-search') return;
  event.preventDefault();
  location.hash = libraryUrl(document.querySelector('#search').value.trim());
});
function updateVocabularySearch() {
  if (!reader) return;
  const results = document.querySelector('#vocabulary-results');
  if (!results) return;
  const scope = document.querySelector('#vocabulary-scope').value;
  document.querySelector('#vocabulary-note').textContent = scope === 'book' ?
    'Sanat ja ilmaukset kirjan luvuista. Katso sanan yhteydestä sen luku ja sanastorooli; tämä ei ole yhteinen koesanasto.' : reader.chapter.vocabulary.note;
  results.innerHTML = vocabularyResultsView(reader.book,reader.chapter,
    document.querySelector('#vocabulary-query').value,scope);
}
main.addEventListener('input', event => {
  if (event.target.id === 'vocabulary-query') updateVocabularySearch();
});
main.addEventListener('change', event => {
  if (event.target.id === 'vocabulary-scope') updateVocabularySearch();
  if (event.target.id === 'section-select' && reader) goToReader(reader.chapter, event.target.value);
  if (event.target.id === 'reading-mode' && reader) {
    focusAfterRoute = compactControls.matches ? 'toggle-options' : 'reading-mode';
    goToReader(reader.chapter, reader.section, event.target.value);
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('#reader-options, #toggle-options')) closeOptions();
  for (const [kind, panelId, buttonId] of [
    ['contents', 'chapter-nav', 'toggle-contents'],
    ['vocabulary', 'vocabulary-panel', 'toggle-vocabulary'],
    ['info', 'reader-info', 'toggle-info']
  ]) {
    const panel = document.getElementById(panelId);
    if (panel && !panel.hidden && !event.target.closest('#' + panelId + ', #' + buttonId)) {
      const restore = panel.contains(document.activeElement);
      toggleReaderPanel(kind, false);
      if (restore) focusControl(buttonId);
    }
  }
  const anchor = event.target.closest('a');
  if (reader && anchor?.closest('.paper-body') && !event.defaultPrevented && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !anchor.hasAttribute('download') && (!anchor.target || anchor.target === '_self')) {
    const reference = readerReferenceUrl(anchor.getAttribute('href'), reader.book, reader.mode);
    if (reference) {
      event.preventDefault();
      location.hash = reference;
    }
  }
  if (anchor?.getAttribute('href') === '#main' || anchor?.getAttribute('href') === '#book-contents') {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      event.preventDefault();
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    }
  }
});
main.addEventListener('click', event => {
  const dialog = document.querySelector('#focused-section');
  if (dialog?.open) {
    if (event.target.closest('#close-focused-section')) closeFocusedSection();
    else if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeFocusedSection();
    }
    return;
  }
  const button = event.target.closest('button');
  if (button?.dataset.openSection) { openFocusedSection(button.dataset.openSection, button); return; }
  if (!button && reader && !window.getSelection()?.toString()) {
    const paper = event.target.closest('.paper-section[data-focus-section]');
    if (paper && event.target === paper && event.clientX > paper.getBoundingClientRect().right - 16) return;
    if (paper && !event.target.closest('a, input, select, textarea, [contenteditable], .table-wrap, .word-card') &&
        (event.target === paper || event.target.closest('h2, h3, .chapter-opening'))) {
      openFocusedSection(paper.dataset.focusSection, paper.querySelector('.section-open'));
      return;
    }
  }
  if (!button || button.disabled) return;
  if (button.id === 'retry') { start({refresh:true}); return; }
  if (button.id === 'clear-reading-position') {
    const cleared = readingState.clear();
    document.querySelector('#resume-slot').innerHTML = resumeView(books, readingState.get());
    document.querySelector('#library-status').textContent = cleared ? 'Lukukohta tyhjennetty.' :
      'Lukukohta poistettiin tästä näkymästä. Selaimen tallennusta ei voitu tyhjentää.';
    focusAfterPositionClear(main);
    return;
  }
  if (!reader) return;
  if (button.id === 'toggle-contents') {
    toggleReaderPanel('contents');
  } else if (button.id === 'toggle-vocabulary') {
    toggleReaderPanel('vocabulary');
  } else if (button.id === 'close-vocabulary') {
    toggleReaderPanel('vocabulary', false);
    focusControl('toggle-vocabulary');
  } else if (button.id === 'close-contents') {
    toggleReaderPanel('contents', false);
    focusControl('toggle-contents');
  } else if (button.id === 'toggle-options') {
    const open = !document.querySelector('.reader-page').classList.contains('is-options-open');
    for (const kind of ['contents', 'vocabulary', 'info']) toggleReaderPanel(kind, false);
    document.querySelector('.reader-page').classList.toggle('is-options-open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) document.querySelector('#reading-mode').focus({ preventScroll: true });
  } else if (button.id === 'toggle-info') {
    toggleReaderPanel('info');
  } else if (button.id === 'close-info') {
    toggleReaderPanel('info', false);
    focusControl('toggle-info');
  } else if (button.id === 'toggle-fullscreen') {
    closeOptions();
    toggleFullscreenReading();
  } else if (button.dataset.mode) {
    focusAfterRoute = 'reader-content';
    goToReader(reader.chapter, reader.section, button.dataset.mode);
  } else if (button.dataset.font) {
    fontSize = Math.max(16, Math.min(24, fontSize + Number(button.dataset.font) * 2));
    document.documentElement.style.setProperty('--reader-zoom', fontSize / 16);
    document.querySelector('[data-font="-1"]').disabled = fontSize === 16;
    document.querySelector('[data-font="1"]').disabled = fontSize === 24;
    document.querySelector('#font-size-label').textContent = Math.round(fontSize / 16 * 100) + '%';
    // Keep a focus target when the pressed size button becomes disabled.
    if (button.disabled) document.querySelector('[data-font="' + (button.dataset.font === '1' ? '-1' : '1') + '"]').focus();
    try { localStorage.setItem('aukeama.text-size', String(fontSize)); } catch { /* Optional preference only. */ }
  } else if (button.dataset.turn) {
    focusAfterRoute = button.id;
    turnPage(Number(button.dataset.turn));
  }
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && fullscreenReading) {
    fullscreenReading = false;
    syncFullscreenControls();
    focusControl('toggle-fullscreen');
  }
});
document.addEventListener('keydown', event => {
  const focusedDialog = document.querySelector('#focused-section');
  if (focusedDialog?.open) {
    if (event.key === 'Escape') { event.preventDefault(); closeFocusedSection(); }
    if (event.key === 'Tab') {
      const controls = [...focusedDialog.querySelectorAll('button:not(:disabled), a[href], summary, input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (first && (!focusedDialog.contains(document.activeElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
    return;
  }
  if (['ArrowLeft', 'ArrowRight'].includes(event.key) && reader?.mode === 'spread' &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat &&
      !event.target.closest('input, textarea, select, button, a, summary, [contenteditable], .table-wrap, .contents-matrix, .word-card') &&
      !window.getSelection()?.toString() && !document.querySelector('.reader-page.is-options-open') &&
      !['#chapter-nav', '#vocabulary-panel', '#reader-info'].some(id => document.querySelector(id)?.hidden === false)) {
    event.preventDefault();
    focusAfterRoute = 'reader-content';
    turnPage(event.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (document.querySelector('.reader-page.is-options-open')) {
    closeOptions();
    focusControl('toggle-options');
    return;
  }
  if (document.querySelector('#reader-info')?.hidden === false) {
    toggleReaderPanel('info', false);
    focusControl('toggle-info');
    return;
  }
  const vocabulary = document.querySelector('#vocabulary-panel');
  if (vocabulary && !vocabulary.hidden) {
    toggleReaderPanel('vocabulary', false);
    focusControl('toggle-vocabulary');
  } else if (document.querySelector('#chapter-nav')?.hidden === false) {
    toggleReaderPanel('contents', false);
    focusControl('toggle-contents');
  } else if (fullscreenReading && !document.fullscreenElement) {
    leaveFullscreenReading();
  }
});
let swipe;
main.addEventListener('pointerdown', event => {
  swipe = undefined;
  if (event.pointerType !== 'touch' || !event.isPrimary || !event.target.closest('.reader-pages.is-spread') ||
      event.target.closest('input, textarea, select, button, a, summary, .table-wrap, .contents-matrix, .word-card') || window.getSelection()?.toString()) return;
  swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
main.addEventListener('pointercancel', () => { swipe = undefined; });
main.addEventListener('pointerup', event => {
  const start = swipe;
  swipe = undefined;
  if (!start || start.id !== event.pointerId || window.getSelection()?.toString()) return;
  const x = event.clientX - start.x, y = event.clientY - start.y;
  if (Math.abs(x) >= 70 && Math.abs(x) > Math.abs(y) * 1.5) {
    focusAfterRoute = 'reader-content';
    turnPage(x < 0 ? 1 : -1);
  }
});
singlePage.addEventListener('change', () => { if (reader) renderRoute({ initial: true }); });
compactControls.addEventListener('change', () => {
  const focusInside = document.querySelector('#reader-options')?.contains(document.activeElement);
  closeOptions();
  if (focusInside && compactControls.matches) focusControl('toggle-options');
});
window.addEventListener('hashchange', () => renderRoute());
async function start({refresh=false}={}) {
  const token=++generation;
  request?.abort();
  request=new AbortController();
  try {
    if (refresh || !books.length) {
      const current=await fetchCatalog(import.meta.url,{signal:request.signal});
      if (token!==generation) return;
      books=current;
      contentLoader.clear();
    }
    if (token===generation) await renderRoute({initial:true});
  } catch(error) {
    if (token!==generation || error.name==='AbortError') return;
    document.body.classList.remove('is-reader');
    main.innerHTML = errorView('Kirjastoa ei voitu ladata', 'Tarkista yhteys ja yritä uudelleen.', true);
  }
}
start();
