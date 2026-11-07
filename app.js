import {createContentLoader, fetchCatalog} from './content-loader.mjs';
import { parseRoute, libraryUrl, bookUrl, readerUrl, readerReferenceUrl, readerPageSize, findSectionIndex, readingOrder, textbookPageTarget, workbookUrl, textbookUrl, textbookPageSpan, textbookSectionPages } from './routes.mjs';
import { libraryView, resultList, resumeView, helpView, bookView, readerView, focusedSectionView, errorView, vocabularyResultsView, paperPageView, readerSectionsHtml, readerNavigationView, teacherGuideView, workbookReaderView, workbookChapterRanges, workbookTaskView } from './views.mjs';
import { createReadingState, readingSourcePosition } from './reading-state.mjs';
import { createPreviewGuard } from './preview-updates.mjs';
import { closeOtherRoleCards } from './role-cards.mjs';
import { installWordCards } from './word-cards.mjs';
import { installPrintSupport, focusAfterPositionClear } from './print-support.mjs';
import {installRouteDiagrams} from './route-diagrams.mjs';
import {createReaderPanels} from './reader-panels.mjs';
import {installReaderSourceRepeats} from './reader-edition.mjs';
import {createPracticeWorkspace} from './practice-ui.mjs';
import {createDrillWorkspace,drillsOf,fillDrillProgress} from './drill-ui.mjs';
import {paginateSpread,printedFolio} from './page-flow.mjs';
import {practiceActivities} from './practice-state.mjs';
import {createExamWorkspace} from './exam-ui.mjs';
import {createChapterBrowser} from './reader-previews.mjs';
import {createWorkbookPageViewer,installPageTextLoader} from './workbook-page.mjs';
import {authorsView} from './site-info.mjs';
import {createReturnMarks} from './return-marks.mjs';
import {printedPages,hasPrintedSpreads,spreadPages,turnedPage,printedSpreadUrl,partOfPage,sectionPage,sectionsOnPages,PAGE_ZOOMS,zoomStep,zoomLabel,workbookTaskUrl} from './printed-spread.mjs';

const drillStorages={getLocal:()=>localStorage,getSession:()=>sessionStorage};
const main = document.querySelector('#main');
const workbookPageViewer = createWorkbookPageViewer(main);
installPageTextLoader(main);
const examWorkspace = createExamWorkspace(main,{window});
installReaderSourceRepeats(main);
const printSupport = installPrintSupport(main, window);
const routeDiagrams = installRouteDiagrams(main,{isPrinting:()=>printSupport.active});
window.addEventListener('resize',()=>routeDiagrams.refresh());
const wordCards = installWordCards(main);
const readerPanels = createReaderPanels(main, { beforeOpen() {
  wordCards.close({ restore: false });
  closeOptions();
} });
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
const chapterBrowser = createChapterBrowser(main,{
  ResizeObserver:window.ResizeObserver,
  loadSections:(book,chapter,signal)=>contentLoader.load(book,chapter,{signal})
});
const readingState = createReadingState(() => localStorage);
const practiceWorkspace=createPracticeWorkspace(main,{getStorage:()=>localStorage,window});
const drillWorkspace=createDrillWorkspace(main,drillStorages);
// Own return marks stay in this tab unless the learner keeps them in this browser.
const returnMarks=createReturnMarks(main,{getStorage:()=>localStorage,announce:text=>{
  const status=document.querySelector('#reader-status');
  if(status)status.textContent=text;
}});
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
  dialog.innerHTML = focusedSectionView(section, reader.chapter, reader.mode, reader.sections, {book:reader.book,practiceReturn:practiceWorkspace.returnLink(reader.book)});
  dialog.showModal();
  routeDiagrams.refresh();
  document.querySelector('#close-focused-section').focus({ preventScroll: true });
  dialog.oncancel = event => { event.preventDefault(); closeFocusedSection(); };
}
/** One printed workbook task, enlarged over its spread. The address stays shareable. */
function openTaskDialog(page, number) {
  const dialog = document.querySelector('#focused-section');
  const html = reader?.kind === 'workbook' ? workbookTaskView(reader.book, reader.printed, page, number) : '';
  if (!dialog || !html) return false;
  if (typeof dialog.showModal !== 'function') {
    document.querySelector('#reader-status').textContent = 'Selain ei tue tehtävän suurennusta. Suurenna sivua alapalkin painikkeilla.';
    return false;
  }
  for (const kind of ['contents', 'workbook']) toggleReaderPanel(kind, false);
  closeOptions();
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  reader.task = {page, number};
  document.querySelector('#focused-title').focus({preventScroll: true});
  dialog.oncancel = event => { event.preventDefault(); closeTaskDialog(); };
  return true;
}
function closeTaskDialog() {
  const dialog = document.querySelector('#focused-section');
  const open = reader?.task;
  if (dialog?.open) dialog.close();
  if (reader) reader.task = undefined;
  if (!open) return;
  // The spread stays where it was; only the task leaves the address.
  const url = workbookUrl(reader.book.id, lastRoute?.page || reader.printed?.[0]);
  if (location.hash !== url) history.replaceState(null, '', url);
  const area = [...document.querySelectorAll('a.printed-task')]
    .find(link => link.getAttribute('href') === workbookTaskUrl(reader.book.id, open.page, open.number));
  (area || document.querySelector('#reader-content'))?.focus?.({preventScroll: true});
}
function changeFocusedSection(id) {
  const dialog = document.querySelector('#focused-section');
  const section = reader?.sections.find(item => item.id === id);
  if (!dialog?.open || !section) return;
  wordCards.close({ restore: false });
  dialog.innerHTML = focusedSectionView(section, reader.chapter, reader.mode, reader.sections, {book:reader.book,practiceReturn:practiceWorkspace.returnLink(reader.book)});
  routeDiagrams.refresh();
  // Reading in this temporary view does not replace its original return point.
  dialog.querySelector('#focused-title').focus({ preventScroll: true });
}
let fontSize = 16;
// Enlargement of printed pages, kept apart from the text size. 'fit' fills the window width.
let pageZoom = 100;
try { const saved = localStorage.getItem('aukeama.printed-zoom'); if (saved === 'fit' || PAGE_ZOOMS.includes(Number(saved))) pageZoom = saved === 'fit' ? 'fit' : Number(saved); } catch { /* Optional preference. */ }
let fullscreenReading = false;
let pageLayout = 'auto';
const singlePage = window.matchMedia('(max-width: 899px)');
const pageSize = (chapter = reader?.chapter, book = reader?.book) => readerPageSize(chapter, singlePage.matches, pageLayout, hasPrintedSpreads(book));
function focusControl(id) {
  const control = document.getElementById(id);
  (control?.getClientRects().length ? control : document.querySelector('#toggle-options'))?.focus({ preventScroll: true });
}
function closeOptions() {
  const panel = document.querySelector('#reader-options');
  const restore = panel?.contains(document.activeElement);
  if (panel) panel.hidden = true;
  document.querySelector('.reader-page')?.classList.remove('is-options-open');
  document.querySelector('#toggle-options')?.setAttribute('aria-expanded', 'false');
  if (restore) focusControl('toggle-options');
}
try {
  const saved = Number(localStorage.getItem('aukeama.text-size'));
  if ([16, 18, 20, 22, 24].includes(saved)) fontSize = saved;
  const savedLayout = localStorage.getItem('aukeama.page-layout');
  if (['auto','spread','single'].includes(savedLayout)) pageLayout = savedLayout;
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
  readerPanels.toggle(kind, force);
  if(kind==='contents'&&!main.querySelector('#chapter-nav')?.hidden)chapterBrowser.revealCurrent();
}
async function renderRoute({ initial = false } = {}) {
  const token = ++generation;
  request?.abort();
  if (await previewGuard.check() || token!==generation) return;
  wordCards.close({ restore: false });
  if (reader) reader.task = undefined;
  closeFocusedSection({ restore: false });
  chapterBrowser.clear();
  returnMarks.clear();
  workbookPageViewer.clear();
  request = new AbortController();
  main.removeAttribute('aria-busy');
  const route = parseRoute(location.hash);
  document.body.classList.toggle('is-reader', route.view === 'reader');
  if (route.view !== 'reader' && fullscreenReading) await leaveFullscreenReading({ focus: false });
  const previousRoute = lastRoute;
  lastRoute = route;
  for (const link of document.querySelectorAll('.site-header nav a')) {
    if ((route.view === 'library' && link.getAttribute('href') === '#/library') ||
        (route.view === 'help' && link.getAttribute('href') === '#/help') ||
        (route.view === 'authors' && link.getAttribute('href') === '#/tekijat')) link.setAttribute('aria-current', 'page');
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
  } else if (route.view === 'authors') {
    main.innerHTML = authorsView();
    setTitle('Tekijät');
  } else {
    let book = books.find(item => item.id === route.bookId);
    if (!book) {
      main.innerHTML = errorView('Sivua ei löytynyt', 'Tarkista osoite tai valitse kirja kirjastosta.');
      setTitle('Sivua ei löytynyt');
    } else if (route.view === 'book') {
      main.innerHTML = bookView(book, readingState.get(), route);
      fillDrillProgress(main, book, drillStorages);
      setTitle(book.title);
      if (route.workbookPage) {
        main.querySelector('#workbook-page-result').focus();
        return;
      }
    } else if (route.view === 'textbook' && hasPrintedSpreads(book)) {
      // One printed-page viewer: the reader's Aukeama view shows the textbook pages.
      const page = Math.min(Math.max(route.page || 1, 1), printedPages(book).pages);
      location.replace(printedSpreadUrl(book.id, partOfPage(book, page) || readingOrder(book)[0].id, page));
      return;
    } else if (route.view === 'workbook' && printedPages(book, 'workbook')) {
      // The workbook opens in the same reader as the textbook: printed spreads, same controls.
      const proof = printedPages(book, 'workbook'), single = readerPageSize(null, singlePage.matches, pageLayout) === 1;
      const first = Object.values(proof.chapterPages || {}).sort((a, b) => a - b)[0] || 1;
      const pages = spreadPages(proof.pages, Math.min(Math.max(route.page || first, 1), proof.pages), single);
      const opened = pages.includes(route.page) ? route.page : pages[0];
      const range = workbookChapterRanges(book).find(item => item.from <= opened && opened <= item.to);
      reader = { kind: 'workbook', book, chapter: range?.chapter || readingOrder(book)[0], sections: [], index: 0, section: '', part: 1, mode: 'spread', point: '', printed: pages };
      document.body.classList.add('is-reader');
      main.innerHTML = workbookReaderView(book, pages, {single, pageZoom, pageLayout, page: opened});
      fillDrillProgress(main, book, drillStorages);
      if (route.task) openTaskDialog(opened, route.task);
      syncFullscreenControls();
      setTitle('Työkirja s. ' + pages.join('–') + ' – ' + book.series + ' ' + book.grade);
    } else if (route.view === 'workbook' || route.view === 'textbook') {
      const html = paperPageView(book, route.view, route.page);
      const name = route.view === 'workbook' ? 'Työkirja' : 'Tekstikirja';
      if (!html) {
        main.innerHTML = errorView(name + 'a ei löytynyt', 'Painetut sivut avataan paikallisesta materiaaliesikatselusta.');
        setTitle(name + 'a ei löytynyt');
      } else {
        main.innerHTML = html;
        workbookPageViewer.mount();
        setTitle(name + ' – ' + book.title);
        if (!initial) { main.querySelector('#' + route.view + '-view-title').focus({preventScroll:true}); window.scrollTo(0,0); }
        return;
      }
    } else if (route.view === 'exam') {
      if(!examWorkspace.mount(book)) {
        main.innerHTML=errorView('Koetyökalua ei löytynyt','Paikallinen kokeilu avataan kirjan materiaaleista.');
        setTitle('Koetyökalua ei löytynyt');
      } else {setTitle('Kokoa koe – '+book.title);return;}
    } else if (route.view === 'teacher-guide') {
      const guide=(book.localTeacherGuides||[]).find(item=>item.id===route.guideId);
      if(!guide){
        main.innerHTML=errorView('Opettajan ohjetta ei löytynyt','Opettajan ohjeet avataan paikallisesta materiaaliesikatselusta.');
        setTitle('Opettajan ohjetta ei löytynyt');
      } else {
        main.innerHTML=teacherGuideView(book,guide);
        setTitle(guide.title+' – '+book.title);
        if(!initial){main.querySelector('#teacher-guide-title').focus({preventScroll:true});window.scrollTo(0,0);}
        return;
      }
    } else if (route.view === 'drill') {
      const drill=drillsOf(book).find(item=>item.id===route.drillId);
      if(!drill){
        main.innerHTML=errorView('Harjoitusta ei löytynyt','Lisää harjoitusta -tehtävät avataan kirjan materiaaleista.');
        setTitle('Harjoitusta ei löytynyt');
      } else {drillWorkspace.mount(book,drill,{focus:!initial,setId:route.setId});setTitle(drill.title+' – '+book.title);return;}
    } else if (route.view === 'practice') {
      const activity=practiceActivities(book).find(item=>item.id===route.activityId);
      if(!activity||activity.id!==route.activityId||!practiceWorkspace.mount(book,activity,route.step,{focus:!initial,
        entry:!(previousRoute?.view==='practice'&&previousRoute.bookId===route.bookId&&previousRoute.activityId===route.activityId)})) {
        main.innerHTML=errorView('Harjoitusta ei löytynyt','Valitse käytettävissä oleva kokeilu kirjan materiaaleista.');
        setTitle('Harjoitusta ei löytynyt');
      } else {setTitle(activity.title+' – Työkirja');return;}
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
          // Aukeama view of a printed book: the printed spread, addressed by its printed page.
          let printed = null;
          const proof = route.mode === 'spread' && printedPages(book);
          const printedAt = proof && (route.page || sectionPage(book, chapter.id, loaded.section || route.section));
          if (printedAt) {
            const page = Math.min(Math.max(printedAt, 1), proof.pages), owner = partOfPage(book, page);
            if (route.page && owner && owner !== chapter.id) { location.replace(printedSpreadUrl(book.id, owner, page)); return; }
            printed = spreadPages(proof.pages, page, pageSize(chapter, book) === 1);
            const url = printedSpreadUrl(book.id, chapter.id, page);
            if (location.hash !== url) history.replaceState(null, '', url);
            const here = sectionsOnPages(book, printed).find(row => row.chapter === chapter.id);
            route.section = here?.section || '';
          } else if (chapter.id !== route.chapterId || loaded.section !== route.section) {
            route.chapterId = chapter.id;
            route.section = loaded.section;
            history.replaceState(null, '', readerUrl(book.id, chapter.id, route.section, route.mode, route.point));
          }
          const sections = loaded.sections;
          const section = sections.find(item => item.id === route.section) || sections[0];
          const index = findSectionIndex(sections, section.id, route.mode, pageSize(chapter, book));
          reader = { book, chapter, sections, index, section: section.id, part: route.part || 1, mode: route.mode, point:route.point || '', printed };
          const returnTo = readingState.visit(books, { schemaVersion: 1, bookId: book.id, version: book.version,
            chapterId: chapter.id, sectionId: section.id, mode: route.mode });
          main.innerHTML = readerView(book, chapter, sections, index, route.mode, fontSize, section.id, pageSize(chapter, book), returnTo, pageLayout, printed, pageZoom);
          fillDrillProgress(main, book, drillStorages);
          chapterBrowser.mount(book,chapter,sections,section.id,route.mode,pageSize(chapter, book),printed);
          // Own marks belong to the text: their links open the text view.
          returnMarks.mount(book,chapter,sections,printed ? 'chapter' : route.mode);
          const practiceReturn=practiceWorkspace.returnLink(book);
          if(practiceReturn){main.querySelector('.reader-page').classList.add('has-practice-return');main.querySelector('.reader-page').insertAdjacentHTML('afterbegin',practiceReturn);}
          routeDiagrams.refresh();
          await applyFlow({section: section.id, part: route.part || 1, point: route.point || ''});
          if (token !== generation) return;
          syncFullscreenControls();
          setTitle(chapter.title + ' – ' + book.series + ' ' + book.grade);
          if (route.section && !printed && (!focusAfterRoute || route.point)) {
            focusAfterRoute = '';
            const paper = document.getElementById('section-' + section.id) ||
              main.querySelector('.reader-pages [data-section-id="' + CSS.escape(section.id) + '"]');
            // On a paginated spread the point may sit in the section's continuation fragment.
            const point = route.point && [...(reader.flow ? main.querySelectorAll('.reader-pages [data-content-point]') : paper.querySelectorAll('[data-content-point]'))]
              .find(element => element.dataset.contentPoint === route.point);
            const target = point || paper;
            target.tabIndex = -1;
            if (route.mode === 'chapter' || point) target.scrollIntoView({ block: 'start', inline:'nearest' });
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
  const focusTarget = focusAfterRoute && (document.getElementById(focusAfterRoute) ||
    (focusAfterRoute==='next' ? document.getElementById('next-chapter') :
      focusAfterRoute==='previous' ? document.getElementById('previous-chapter') : null));
  focusAfterRoute = '';
  if (focusTarget && !focusTarget.disabled) {
    window.scrollTo(0, 0);
    focusTarget.focus({ preventScroll: true });
  } else if (!initial && !(route.view === 'library' && previousRoute?.view === 'library')) focusMain();
}

// Book-like pages need a real page height: not on phones or very low windows,
// where the whole document scrolls instead.
function flowAvailable() {
  return reader?.mode === 'spread' && !reader.printed && reader.chapter.supportType !== 'contents' &&
    window.innerWidth >= 700 && window.innerHeight > 560;
}
/** Paginate the open spread so that a long section continues on the next page. */
async function applyFlow(target = {section: reader?.section, part: reader?.part || 1}) {
  const pagesElement = main.querySelector('.reader-pages.is-spread');
  if (!reader || !pagesElement || !flowAvailable()) { if (reader) reader.flow = null; return false; }
  const current = reader;
  try { await document.fonts?.ready; } catch { /* Fonts are optional for measuring. */ }
  if (reader !== current || !pagesElement.isConnected) return false;
  // The page number is the printed textbook page, the one used in class.
  const folio = ({section, fraction}) => {
    const page = printedFolio(textbookPageSpan(current.book, current.chapter.id, [section]), fraction);
    return page ? {text: String(page), label: 'Tekstikirjan sivu', page}
      : null;
  };
  const flow = paginateSpread(pagesElement, readerSectionsHtml(current.book, current.chapter, current.sections), {pageSize: pageSize(), target, folio});
  if (!flow) { current.flow = null; return false; }
  current.flow = flow;
  current.section = flow.first.section;
  current.part = flow.first.part;
  current.index = current.sections.findIndex(item => item.id === flow.first.section);
  const footer = main.querySelector('.reader-navigation');
  if (footer) footer.outerHTML = readerNavigationView(current.book, current.chapter, current.sections, flow, pageSize());
  // Wide screens show the position in the top bar (the bottom bar gives its room to the pages).
  const slot = main.querySelector('.reader-position-slot'), position = main.querySelector('.reader-navigation .reading-position');
  if (slot) slot.innerHTML = position ? position.innerHTML : '';
  const select = document.querySelector('#section-select');
  if (select) select.value = flow.first.section;
  returnMarks.decorate();
  routeDiagrams.refresh();
  return true;
}
let reflowTimer = 0;
function scheduleReflow() {
  if (!reader?.flow) return;
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(() => {
    if (!reader?.flow) return;
    const focusInside = main.querySelector('.reader-pages')?.contains(document.activeElement);
    applyFlow({section: reader.section, part: reader.part}).then(() => {
      if (focusInside) main.querySelector('.reader-pages .paper-section')?.focus({preventScroll: true});
    });
  }, 150);
}
window.addEventListener('resize', scheduleReflow);
document.addEventListener('fullscreenchange', scheduleReflow);
function goToReader(chapter, section = '', mode = reader.mode, part = 1) {
  const url = readerUrl(reader.book.id, chapter.id, section, mode, '', part);
  if (location.hash === url) {
    const control = focusAfterRoute;
    focusAfterRoute = '';
    if (control) focusControl(control);
    return;
  }
  location.hash = url;
}
async function turnPage(direction) {
  if (!reader) return;
  const current = reader;
  if (current.kind === 'workbook') {
    const total = printedPages(current.book, 'workbook').pages;
    const single = pageSize() === 1, first = turnedPage(total, current.printed, direction, single);
    if (!first) return;
    // Like the textbook: a spread shared by two chapters stays in the current chapter.
    const range = workbookChapterRanges(current.book).find(item => item.chapter.id === current.chapter.id);
    const pages = spreadPages(total, first, single);
    location.hash = workbookUrl(current.book.id, pages.find(page => range && range.from <= page && page <= range.to) || pages[0]);
    return;
  }
  if (current.printed) {
    const total = printedPages(current.book).pages, single = pageSize() === 1;
    const first = turnedPage(total, current.printed, direction, single);
    if (!first) return;
    // A spread shared by two chapters stays in the current one when it has a page there.
    const pages = spreadPages(total, first, single);
    const page = pages.find(item => partOfPage(current.book, item) === current.chapter.id) || pages[0];
    location.hash = printedSpreadUrl(current.book.id, partOfPage(current.book, page) || current.chapter.id, page);
    return;
  }
  if (current.flow) {
    const spread = current.flow.spread + direction;
    if (spread < 0 || spread >= current.flow.spreads) return;
    const start = current.flow.starts[spread];
    goToReader(current.chapter, start.section, 'spread', start.part);
    return;
  }
  const index = current.index + direction * pageSize();
  if (current.mode === 'spread' && index >= 0 && index < current.sections.length) {
    goToReader(current.chapter, current.sections[index].id);
  }
}
function changeReadingMode(value, focus = 'toggle-options') {
  if (!reader || !['auto','spread','single','chapter'].includes(value)) return;
  if (value !== 'chapter') {
    pageLayout = value;
    try { localStorage.setItem('aukeama.page-layout', value); } catch { /* Optional preference. */ }
  }
  const mode = value === 'chapter' ? 'chapter' : 'spread';
  focusAfterRoute = focus;
  if (reader.kind === 'workbook') { renderRoute(); return; }
  if (reader.mode === mode) renderRoute();
  else goToReader(reader.chapter, reader.section, mode);
}
main.addEventListener('submit', event => {
  if (event.target.id === 'workbook-page-search') {
    event.preventDefault();
    const book = books.find(item=>item.id===lastRoute.bookId);
    const page = event.target.elements.sivu.valueAsNumber;
    const url = bookUrl(book.id,page,book.localProofs.workbook.sha256);
    if (location.hash === url) main.querySelector('#workbook-page-result').focus();
    else location.hash = url;
    return;
  }
  if (event.target.id === 'workbook-reader-page') {
    event.preventDefault();
    const page = event.target.elements.sivu.valueAsNumber;
    if (!reader || !Number.isInteger(page) || page < 1) return;
    toggleReaderPanel('contents', false);
    focusAfterRoute = 'reader-content';
    location.hash = workbookUrl(reader.book.id, page);
    return;
  }
  if (event.target.dataset?.paperKind) {
    event.preventDefault();
    const page = event.target.elements.sivu.valueAsNumber;
    const url = event.target.dataset.paperKind === 'textbook' ? textbookUrl : workbookUrl;
    if (Number.isInteger(page) && page >= 1) location.hash = url(lastRoute.bookId, page);
    return;
  }
  if (event.target.id === 'textbook-page-search') {
    event.preventDefault();
    if (!reader) return;
    const page = event.target.elements.sivu.valueAsNumber;
    if (reader.printed && Number.isInteger(page) && page >= 1 && page <= printedPages(reader.book).pages) {
      // The Aukeama view shows every printed page, word lists included.
      toggleReaderPanel('contents', false);
      focusAfterRoute = 'reader-content';
      location.hash = printedSpreadUrl(reader.book.id, partOfPage(reader.book, page) || reader.chapter.id, page);
      return;
    }
    const target = textbookPageTarget(reader.book, page);
    const status = event.target.querySelector('#textbook-page-status');
    if (!target) { status.textContent = 'Tarkista sivunumero: tekstikirjassa on ' + reader.book.localProofs.textbook.pages + ' sivua.'; return; }
    const chapter = readingOrder(reader.book).find(item => item.id === target.chapterId);
    if (!target.exact) {
      status.innerHTML = '';
      status.append('Sivulla ' + page + ' on sanasto tai tyhjä sivu. ');
      const link = document.createElement('a');
      link.href = readerUrl(reader.book.id, chapter.id, '', reader.mode);
      link.textContent = 'Avaa luku: ' + chapter.title;
      status.append(link);
      return;
    }
    toggleReaderPanel('contents', false);
    focusAfterRoute = 'reader-content';
    goToReader(chapter, target.sectionId);
    return;
  }
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
    'Sanat ja käyttöfraasit kirjan luvuista. Katso tuloksen yhteydestä sen käyttö; tämä ei ole yhteinen koesanasto.' : reader.chapter.vocabulary.note;
  results.innerHTML = vocabularyResultsView(reader.book,reader.chapter,
    document.querySelector('#vocabulary-query').value,scope,reader.mode,document.querySelector('#vocabulary-quiz')?.value||'');
}
main.addEventListener('input', event => {
  if (event.target.id === 'vocabulary-query') updateVocabularySearch();
});
main.addEventListener('change', event => {
  if (['vocabulary-scope','vocabulary-quiz'].includes(event.target.id)) updateVocabularySearch();
  if (event.target.id === 'section-select' && reader?.kind === 'workbook') location.hash = workbookUrl(reader.book.id, Number(event.target.value));
  else if (event.target.id === 'section-select' && reader) goToReader(reader.chapter, event.target.value);
  if (event.target.id === 'reading-mode' && reader) {
    changeReadingMode(event.target.value);
  }
});
document.addEventListener('focusin', event => {
  if (!event.target.closest('#reader-options, #toggle-options')) closeOptions();
  readerPanels.dismissOutside(event.target);
});
document.addEventListener('click', event => {
  if (!event.target.closest('#reader-options, #toggle-options')) closeOptions();
  readerPanels.dismissOutside(event.target, { restore: true });
  const anchor = event.target.closest('a');
  if (reader && anchor?.closest('.paper-body') && !event.defaultPrevented && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !anchor.hasAttribute('download') && (!anchor.target || anchor.target === '_self')) {
    const reference = readerReferenceUrl(anchor.getAttribute('href'), reader.book, reader.mode);
    if (reference) {
      event.preventDefault();
      focusAfterRoute = '';
      const origin = readingSourcePosition(reader.book, reader.chapter.id,
        anchor.closest('[data-section-id]')?.dataset.sectionId, reader.mode);
      if (origin) {
        readingState.visit(books, origin);
        const destination = parseRoute(reference);
        const chapter = readingOrder(reader.book).find(item => item.id === destination.chapterId);
        readingState.followReference(books, origin, { ...origin, chapterId: destination.chapterId,
          sectionId: destination.section || chapter?.sectionIds?.[0], mode: destination.mode });
        const sourceUrl = readerUrl(reader.book.id,reader.chapter.id,origin.sectionId,reader.mode,
          origin.sectionId === reader.section ? reader.point : '');
        if (location.hash !== sourceUrl) history.replaceState(null,'',sourceUrl);
      }
      if (location.hash === reference) renderRoute();
      else location.hash = reference;
    }
  }
  // In-page anchors (#book-contents, #lisaa-harjoitusta, #opettajalle …) scroll within the view;
  // only #/ addresses are routes. Without this the hash change would re-render as a route.
  const inPage = anchor?.getAttribute('href');
  if (inPage && /^#[a-z][a-z0-9-]*$/.test(inPage) && document.getElementById(inPage.slice(1))) {
    const target = document.getElementById(inPage.slice(1));
    if (target) {
      event.preventDefault();
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    }
  }
});
main.addEventListener('click', event => {
  const reveal = event.target.closest?.('.vocabulary-reveal');
  if (reveal) {
    reveal.classList.add('is-revealed'); reveal.removeAttribute('aria-label');
    const progress = document.querySelector('#vocabulary-progress'), list = reveal.closest('.vocabulary-list');
    // Progress counts words, not cells: a word with forms counts once when its headword opens.
    if (progress && list) progress.textContent = 'Avattu ' + [...list.children].filter(row => row.querySelector('dt .is-revealed, dd:not(.vocabulary-forms):not(.vocabulary-references) .is-revealed')).length + ' / ' + list.children.length;
    return;
  }
  // Re-render after the outside-click check, which would treat the replaced button as outside the panel.
  if (event.target.closest?.('#vocabulary-reshuffle')) { setTimeout(() => { updateVocabularySearch(); focusControl('vocabulary-reshuffle'); }); return; }
  const taskLink = event.target.closest('a.printed-task, a.task-link');
  if (reader?.kind === 'workbook' && taskLink && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    const route = parseRoute(taskLink.getAttribute('href'));
    if (route.view === 'workbook' && route.task && openTaskDialog(route.page, route.task)) {
      event.preventDefault();
      history.replaceState(null, '', taskLink.getAttribute('href'));
      return;
    }
  }
  const dialog = document.querySelector('#focused-section');
  if (dialog?.open && reader?.task) {
    if (event.target.closest('#close-focused-section')) closeTaskDialog();
    else if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeTaskDialog();
    }
    return;
  }
  if (dialog?.open) {
    if (event.target.closest('#close-focused-section')) closeFocusedSection();
    else if (event.target.closest('button[data-focused-section]:not(:disabled)')) {
      changeFocusedSection(event.target.closest('button').dataset.focusedSection);
    }
    else if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeFocusedSection();
    }
    return;
  }
  const contentsLink = event.target.closest('#chapter-nav a');
  if (reader && contentsLink?.getAttribute('href') === location.hash && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    toggleReaderPanel('contents', false);
    const paper = document.getElementById('section-' + reader.section);
    (paper || document.querySelector('#reader-content'))?.focus({ preventScroll: true });
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
    for (const kind of ['contents', 'vocabulary', 'info', 'workbook']) toggleReaderPanel(kind, false);
    document.querySelector('.reader-page').classList.toggle('is-options-open', open);
    document.querySelector('#reader-options').hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) document.querySelector('#reading-mode').focus({ preventScroll: true });
  } else if (button.id === 'close-options') {
    closeOptions();
  } else if (button.id === 'toggle-workbook') {
    toggleReaderPanel('workbook');
  } else if (button.id === 'close-workbook') {
    toggleReaderPanel('workbook', false);
    focusControl('toggle-workbook');
  } else if (button.id === 'toggle-info') {
    toggleReaderPanel('info');
  } else if (button.id === 'close-info') {
    toggleReaderPanel('info', false);
    focusControl('toggle-info');
  } else if (button.id === 'toggle-fullscreen') {
    closeOptions();
    toggleFullscreenReading();
  } else if (button.dataset.mode) {
    changeReadingMode(button.dataset.mode === 'spread' ? pageLayout : button.dataset.mode, 'reader-content');
  } else if (button.dataset.zoom) {
    const next = button.dataset.zoom === 'fit' ? (pageZoom === 'fit' ? 100 : 'fit') : zoomStep(pageZoom, Number(button.dataset.zoom));
    if (next === null) return;
    pageZoom = next;
    try { localStorage.setItem('aukeama.printed-zoom', String(pageZoom)); } catch { /* Optional preference. */ }
    document.querySelector('.reader-pages.is-printed')?.setAttribute('data-zoom', String(pageZoom));
    // The control exists for both bars; only one of them is shown at a time.
    for (const label of document.querySelectorAll('.page-zoom-label')) label.textContent = zoomLabel(pageZoom);
    for (const step of [-1, 1]) for (const control of document.querySelectorAll('[data-zoom="' + step + '"]'))
      control.disabled = zoomStep(pageZoom, step) === null;
    for (const control of document.querySelectorAll('[data-zoom="fit"]')) control.setAttribute('aria-pressed', String(pageZoom === 'fit'));
    if (button.disabled) button.closest('.page-zoom')?.querySelector('[data-zoom="' + (button.dataset.zoom === '1' ? '-1' : '1') + '"]')?.focus();
  } else if (button.dataset.font) {
    fontSize = Math.max(16, Math.min(24, fontSize + Number(button.dataset.font) * 2));
    document.documentElement.style.setProperty('--reader-zoom', fontSize / 16);
    routeDiagrams.refresh();
    scheduleReflow();
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
    if (event.key === 'Escape') { event.preventDefault(); if (reader?.task) closeTaskDialog(); else closeFocusedSection(); }
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
      !event.target.closest('input, textarea, select, button, a, summary, [contenteditable], .table-wrap, .contents-matrix, .word-card, .route-diagram') &&
      !window.getSelection()?.toString() && !document.querySelector('.reader-page.is-options-open') &&
      !['#chapter-nav', '#vocabulary-panel', '#reader-info'].some(id => document.querySelector(id)?.hidden === false)) {
    event.preventDefault();
    focusAfterRoute = 'reader-content';
    turnPage(event.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (returnMarks.closeMenu()) { event.preventDefault(); return; }
  if (document.querySelector('.reader-page.is-options-open')) {
    event.preventDefault();
    closeOptions();
    focusControl('toggle-options');
    return;
  }
  if (document.querySelector('#reader-info')?.hidden === false) {
    event.preventDefault();
    toggleReaderPanel('info', false);
    focusControl('toggle-info');
    return;
  }
  if (document.querySelector('#workbook-panel')?.hidden === false) {
    event.preventDefault();
    toggleReaderPanel('workbook', false);
    focusControl('toggle-workbook');
    return;
  }
  const vocabulary = document.querySelector('#vocabulary-panel');
  if (vocabulary && !vocabulary.hidden) {
    // The native search field also uses Escape to clear its value. Here Escape
    // dismisses the aid instead, keeping the lookup available when reopened.
    event.preventDefault();
    toggleReaderPanel('vocabulary', false);
    focusControl('toggle-vocabulary');
  } else if (document.querySelector('#chapter-nav')?.hidden === false) {
    event.preventDefault();
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
      event.target.closest('input, textarea, select, button, a:not(.printed-region), summary, .table-wrap, .contents-matrix, .word-card, .route-diagram') || window.getSelection()?.toString()) return;
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
singlePage.addEventListener('change', () => {
  if (reader?.mode === 'spread' && pageLayout === 'auto') renderRoute({ initial: true });
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

// In the whole-chapter view the section menu follows the reading position.
// Display only: no navigation, history entry or saved position changes.
let chapterScrollFrame = 0;
document.addEventListener('scroll', event => {
  const target = event.target;
  const pages = target === document ? document.querySelector('.reader-pages.is-chapter') :
    target instanceof Element && target.matches('.reader-pages.is-chapter') ? target : null;
  if (!pages || chapterScrollFrame) return;
  chapterScrollFrame = requestAnimationFrame(() => {
    chapterScrollFrame = 0;
    const select = document.querySelector('#section-select');
    if (!select || document.activeElement === select) return;
    const line = Math.max(pages.getBoundingClientRect().top, 0) + 96;
    let current;
    for (const section of pages.querySelectorAll('[data-section-id]')) {
      if (section.getBoundingClientRect().top > line) break;
      current = section;
    }
    const id = current?.dataset.sectionId;
    if (id && select.value !== id && [...select.options].some(option => option.value === id)) select.value = id;
  });
}, true);
start();
