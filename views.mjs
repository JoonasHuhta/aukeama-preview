import { escapeHtml as e, renderSection, renderMarkdown, inlineMarkdown, sectionSlug } from './content.mjs';
import {workbookPageImage} from './workbook-page.mjs';
import { libraryUrl, bookUrl, readerUrl, readerPageSize, filterBooks, readingOrder, textbookPageSpan, formatPageSpan, workbookUrl, textbookUrl, textbookPageTarget, examUrl, teacherGuideUrl, drillUrl } from './routes.mjs';
import { resolveReadingPosition } from './reading-state.mjs';
import { coverView as cover, themeStyle } from './cover.mjs';
import { searchReadingSupport, hasVocabularyQuery } from './vocabulary-search.mjs';
import {practiceLink,practiceSectionLinks,practiceInvitation} from './practice-ui.mjs';
import {practiceActivities} from './practice-state.mjs';
import {drillsOf,drillLinks,drillPageLinks,routeTag} from './drill-ui.mjs';
import {examLink} from './exam-ui.mjs';
import {languageName, capitalize} from './language-names.mjs';
import {chapterBrowserView} from './reader-previews.mjs';
import {returnMarksEnabled,returnMarkControl} from './return-marks.mjs';
import {FEEDBACK_URL,external} from './site-info.mjs';
import {printedSpreadHtml,printedNavigation,printedPosition,sectionTitles,printedPages,spreadPages,pageLabel,printedThumbnailHtml,workbookPosition,workbookTaskAreas,workbookTaskUrl,printedTaskImage,pageZoomControl,printedSpreadUrl,partOfPage,sectionPage} from './printed-spread.mjs';

// The book page's centre: each chapter's textbook, workbook pages and practice in one row.
// Only attached materials are shown; a plain web copy keeps the simple contents list.
export function chapterHub(book, mode = 'spread') {
  const proof = book.localProofs?.workbook, drills = drillsOf(book), practice = practiceActivities(book);
  const marker = chapter => chapter.label !== undefined ? e(chapter.label) : chapter.number !== undefined ? e(chapter.number) + '.' : '';
  const row = chapter => {
    const page = proof?.chapterPages?.[chapter.id];
    const workbook = Number.isInteger(page) && page >= 1 && page <= proof.pages ?
      '<a class="button" href="' + e(workbookUrl(book.id, page)) + '">Työkirja<small>alkaa sivulta ' + page + '</small></a>' : '';
    const guides = (book.localTeacherGuides || []).filter(guide => guide.chapters.includes(chapter.id));
    const extras = drillLinks(book, chapter) + practiceLink(book, chapter) + guides.map(guide =>
      '<a class="button teacher-guide-link" href="' + e(teacherGuideUrl(book.id, guide.id)) + '">Opettajalle<small>' + e(guide.title) + '</small></a>').join('');
    return '<li><article aria-labelledby="hub-' + e(chapter.id) + '"><h3 id="hub-' + e(chapter.id) + '"><span class="chapter-index">' + marker(chapter) + '</span><span>' + e(chapter.title) + '</span></h3>' +
      '<div class="chapter-hub-links"><a class="button primary" href="' + readerUrl(book.id, chapter.id, '', mode) + '">Lue<span class="sr-only">: ' + e(chapter.title) + '</span></a>' +
      workbook + extras + '</div></article></li>';
  };
  const plain = entries => '<ol class="chapter-links">' + entries.map(chapter =>
    '<li><a href="' + readerUrl(book.id, chapter.id, '', mode) + '"><span class="chapter-index">' + marker(chapter) + '</span><span>' + e(chapter.title) + '</span></a></li>').join('') + '</ol>';
  return '<section id="book-contents" class="chapter-hub" tabindex="-1" aria-labelledby="book-contents-title"><h2 id="book-contents-title">Luvut</h2>' +
    '<p class="muted">Luvun tekstikirja' + (proof ? ', työkirja' : '') + (drills.length || practice.length ? ' ja digiharjoitukset' : '') + ' yhdessä paikassa.' +
    (drills.length ? ' Digiharjoitukset tarkistuvat heti.' : '') + '</p>' +
    (book.frontMatter?.length ? plain(book.frontMatter) : '') +
    '<ol class="chapter-hub-list">' + book.chapters.map(row).join('') + '</ol>' +
    (book.backMatter?.length ? '<h3>Apusivut</h3>' + plain(book.backMatter) : '') + '</section>';
}
function breadcrumbs(book, reader = false) {
  return '<nav class="breadcrumbs" aria-label="Sijainti"><ol><li><a href="#/library">Kirjasto</a></li><li>' +
    (reader ? '<a href="' + bookUrl(book.id) + '">' + e(book.title) + '</a>' : '<span aria-current="page">' + e(book.title) + '</span>') +
    '</li>' + (reader ? '<li><span aria-current="page">Tekstikirja</span></li>' : '') + '</ol></nav>';
}
function navigationArrow(direction) {
  return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="' +
    (direction === 'previous' ? 'M14 5 7 12 14 19' : 'M10 5 17 12 10 19') + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
export function chapterContinuation(book,chapter,mode='spread') {
  const entries=readingOrder(book),index=entries.findIndex(item=>item.id===chapter.id);
  if (index<0) return '';
  const next=entries[index+1];
  const label=!next?'Kirjan tietoihin':next.kind==='back-matter'?
    (chapter.kind==='back-matter'?'Seuraava apusivu':'Apusivuille'):chapter.kind==='front-matter'?'Aloita lukeminen':'Seuraava luku';
  const title=next?((next.label??next.number)!==undefined?(next.label??next.number)+' · ':'')+next.title:'Kirjan kokonaisuus ja materiaalit';
  return '<a class="button primary chapter-continuation" id="next-chapter" href="'+e(next?readerUrl(book.id,next.id,'',mode):bookUrl(book.id))+
    '"'+(next?' rel="next"':'')+' aria-label="'+e(label+': '+title)+'"><span>'+e(label)+'</span><small>'+e(title)+'</small></a>';
}
function pageNavigation(book,chapter,sections, index, isSpread, pageSize, flow) {
  const continuation=chapterContinuation(book,chapter,isSpread?'spread':'chapter');
  const entries=readingOrder(book), previous=entries[entries.findIndex(item=>item.id===chapter.id)-1];
  const previousLabel=previous ? 'Edellinen '+(previous.kind==='back-matter'?'apusivu':previous.kind==='front-matter'?'sisällyssivu':'luku')+': '+previous.title : '';
  const previousChapter=previous ? '<a class="button chapter-previous" id="previous-chapter" rel="prev" href="'+
    e(readerUrl(book.id,previous.id,previous.sectionIds?.at(-1)||'',isSpread?'spread':'chapter'))+
    '" aria-label="'+e(previousLabel)+'" title="'+e(previousLabel)+
    '"><span aria-hidden="true">←</span><span>Edellinen</span></a>' : '';
  if (!isSpread) return '<footer class="reader-navigation chapter-navigation"><div class="chapter-reading-note">' +
    '<strong>Koko luku</strong><span>' + (formatPageSpan(textbookPageSpan(book, chapter.id, sections.map(section => section.id))) ? 'Tekstikirja ' + formatPageSpan(textbookPageSpan(book, chapter.id, sections.map(section => section.id))) : 'Vieritä sisältöä') + '</span></div>' +
    previousChapter+'<button type="button" data-mode="spread" id="return-to-spread">Aukeamatilaan</button>'+continuation+'</footer>';
  // With book-like pagination (flow) a spread is two page slots, not two sections.
  const count = flow ? flow.spreads : Math.ceil(sections.length / pageSize);
  const position = flow ? flow.spread + 1 : Math.floor(index / pageSize) + 1;
  const atStart = flow ? flow.spread === 0 : index === 0;
  const atEnd = flow ? flow.spread >= flow.spreads - 1 : index + pageSize >= sections.length;
  const label = (pageSize === 1 ? 'Sivu' : 'Aukeama') + ' ' + position + ' / ' + count;
  // On flowing pages the span is the printed pages shown in the page corners.
  const paperSpan = flow?.paperPages?.length ? {from: Math.min(...flow.paperPages), to: Math.max(...flow.paperPages)}
    : textbookPageSpan(book, chapter.id, flow ? flow.sectionIds : sections.slice(index, index + pageSize).map(section => section.id));
  const paper = formatPageSpan(paperSpan);
  const unit = pageSize === 1 ? 'sivu' : 'aukeama';
  return '<footer class="reader-navigation">'+(atStart && previousChapter ? previousChapter : '<button type="button" class="page-turn" data-turn="-1" id="previous" aria-label="Edellinen ' + unit + '" title="Edellinen ' + unit + '"' +
    (atStart ? ' disabled' : '') + '>' + navigationArrow('previous') + '</button>') +
    '<div class="reading-position"><p>' + label + (paper ? '<span class="paper-pages"><span class="paper-separator" aria-hidden="true"> · </span><a href="' + e(textbookUrl(book.id, paperSpan.from)) + '" title="Näytä painettu sivu">Tekstikirja ' + paper + '</a></span>' : '') + '</p><progress max="' + count + '" value="' + position +
    '" aria-label="Luvun lukukohta"></progress></div>' +
    (atEnd?continuation:'<button type="button" class="page-turn" data-turn="1" id="next" aria-label="Seuraava ' + unit + '" title="Seuraava ' + unit + '">' + navigationArrow('next') + '</button>')+'</footer>';
}
/** Footer for a paginated spread: flow = {spread, spreads, sectionIds}. */
export function readerNavigationView(book, chapter, sections, flow, pageSize = 2) {
  return pageNavigation(book, chapter, sections, 0, true, pageSize, flow);
}
export function resultList(books, query) {
  const result = filterBooks(books, query);
  return '<p class="results-count muted" role="status">' + result.length +
    (result.length === 1 ? ' kirja' : ' kirjaa') + '</p>' +
    (result.length ? '<ul class="book-list">' + result.map(book =>
      '<li><article class="book-row"' + themeStyle(book) + '>' + cover(book) + '<div class="book-summary"><h3><a href="' + bookUrl(book.id) + '">' + e(book.title) +
      '</a></h3><p class="muted">' + e(book.subjectLabel) + ' · ' + e(book.grade) + '. luokka · ' + e(book.statusLabel) +
      '</p><p>' + e(book.description) + '</p>' + materialSummary(book) + '</div><div class="row-actions"><a class="button primary" href="' +
      readerUrl(book.id, readingOrder(book)[0].id) + '" aria-label="Avaa tekstikirja: ' + e(book.title) + '">Avaa tekstikirja</a>' +
      (book.localProofs?.workbook ? '<a class="button" href="' + e(workbookUrl(book.id)) + '" aria-label="Avaa työkirja: ' + e(book.title) + '">Avaa työkirja</a>' : '') +
      (book.pdf ? '<a class="button" href="' + e(book.pdf.file) + '" download="' + e(book.pdf.filename) +
        '" aria-label="Lataa PDF-esikatselu: ' + e(book.title) + '">PDF-esikatselu</a>' : '') + '<a href="' + bookUrl(book.id) +
      '">Kaikki materiaalit<span class="sr-only">: ' + e(book.title) + '</span></a></div></article></li>').join('') + '</ul>' :
      '<div class="empty-state"><p>Haulla ei löytynyt kirjoja.</p><a href="' + libraryUrl() + '">Tyhjennä haku</a></div>');
}
// What this copy of the book actually offers; only attached materials are named.
export function materialSummary(book) {
  const items = ['tekstikirja verkossa'];
  if (book.localProofs?.workbook) items.push('työkirja ' + book.localProofs.workbook.pages + ' s.');
  if (drillsOf(book).length || practiceActivities(book).length) items.push('digiharjoitukset');
  if (book.localProofs?.guide || book.localAssessment) items.push('opettajan materiaalit');
  return items.length > 1 ? '<p class="material-summary"><span class="sr-only">Mukana: </span>' + items.map(e).join(' · ') + '</p>' : '';
}
// Facts the teacher needs first, taken from the attached materials (not written by hand):
// where the chapter is in both books, its digital practice and where the answers are.
export function guideOverview(book, guide) {
  const chapters = guide.chapters.map(id => book.chapters.find(chapter => chapter.id === id)).filter(Boolean);
  if (!chapters.length) return '';
  const work = book.localProofs?.workbook, order = book.chapters.map(chapter => chapter.id);
  const rows = chapters.map(chapter => {
    const name = chapter.label ?? (chapter.number !== undefined ? 'Luku ' + chapter.number : chapter.title);
    const text = textbookPageSpan(book, chapter.id, chapter.sectionIds || []);
    const start = work?.chapterPages?.[chapter.id];
    const later = order.slice(order.indexOf(chapter.id) + 1).map(id => work?.chapterPages?.[id]).find(Number.isInteger);
    const end = Number.isInteger(start) ? (Number.isInteger(later) ? later - 1 : work.pages) : null;
    const drills = drillsOf(book).filter(drill => drill.chapterId === chapter.id);
    const cells = [
      text ? '<a href="' + e(textbookUrl(book.id, text.from)) + '">Tekstikirja ' + formatPageSpan(text) + '</a>' : '<a href="' + readerUrl(book.id, chapter.id) + '">Tekstikirja</a>',
      Number.isInteger(start) ? '<a href="' + e(workbookUrl(book.id, start)) + '">Työkirja ' + formatPageSpan({from: start, to: end}) + '</a>' : '',
      drills.map(drill => '<a href="' + e(drillUrl(book.id, drill.id)) + '">' + e(drill.title) + '</a> (' +
        drill.sets.reduce((sum, set) => sum + set.items.length, 0) + ' kohtaa)').join(', ')].filter(Boolean);
    return '<tr><th scope="row">' + e(name) + '</th><td>' + cells.join('<br>') + '</td></tr>';
  });
  const answers = book.localProofs?.guide;
  return '<section class="guide-overview" aria-labelledby="guide-overview-title"><h2 id="guide-overview-title">Pikakatsaus</h2>' +
    '<table><tbody>' + rows.join('') + '</tbody></table>' +
    (answers ? '<p>Työkirjan vastaukset ja kuuntelukäsikirjoitukset: <a href="' + e(answers.file) + '" target="_blank" rel="noopener">opettajan työkirja (PDF)<span class="sr-only">, uusi välilehti</span></a>. Sen alun sivukartta kertoo jokaisen tehtävän vastaussivun.</p>' : '') + '</section>';
}

// A teacher's chapter guide as one readable page with its own contents.
export function teacherGuideView(book, guide) {
  const guides = book.localTeacherGuides || [], index = guides.indexOf(guide);
  // "## " parts become the guide's own sections, listed at the top for quick access.
  const parts = [];
  let current = {title: '', lines: []};
  for (const line of guide.markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) { if (current.title || current.lines.join('').trim()) parts.push(current); current = {title: heading[1].trim(), lines: []}; }
    else current.lines.push(line);
  }
  parts.push(current);
  const used = new Set();
  const sections = parts.map(part => {
    let id = 'ohje-' + (sectionSlug(part.title) || 'alku');
    while (used.has(id)) id += '-2';
    used.add(id);
    return {...part, id};
  });
  const html = sections.map(part => '<section class="teacher-guide-part" tabindex="-1" id="' + e(part.id) + '"' + (part.title ? ' aria-labelledby="' + e(part.id) + '-title"' : '') + '>' +
    (part.title ? '<h2 id="' + e(part.id) + '-title">' + inlineMarkdown(part.title) + '</h2>' : '') + renderMarkdown(part.lines.join('\n')) + '</section>').join('');
  const contents = sections.filter(part => part.title);
  const toc = contents.length > 2 ? '<details class="teacher-guide-contents" open><summary>Ohjeen osat</summary><ol>' + contents.map(part =>
    '<li><a href="#' + e(part.id) + '">' + inlineMarkdown(part.title) + '</a></li>').join('') + '</ol></details>' : '';
  const chapters = guide.chapters.map(id => book.chapters.find(chapter => chapter.id === id)).filter(Boolean);
  const neighbour = (other, label) => other ? '<a class="button" href="' + e(teacherGuideUrl(book.id, other.id)) + '">' + label + '<small>' + e(other.title) + '</small></a>' : '';
  return '<div class="page teacher-guide-page"' + themeStyle(book) + '>' + breadcrumbs(book).replace('<span aria-current="page">' + e(book.title) + '</span>', '<a href="' + e(bookUrl(book.id)) + '">' + e(book.title) + '</a>').replace('</ol></nav>', '<li><span aria-current="page">Opettajan ohje</span></li></ol></nav>') +
    '<p class="eyebrow">Opettajan ohje · sisäinen toimitusluonnos</p><h1 id="teacher-guide-title" tabindex="-1">' + e(guide.title) + '</h1>' +
    (chapters.length ? '<p class="actions">' + chapters.map(chapter => '<a class="button" href="' + readerUrl(book.id, chapter.id) + '">Avaa ' + e((chapter.label ?? (chapter.number !== undefined ? 'luku ' + chapter.number : chapter.title))) + ' tekstikirjassa</a>').join('') + '</p>' : '') +
    '<p class="draft-note">Ohje ei ole ihmisen kielentarkistus eikä pilotoitu käyttöohje. Työaika-arviot ovat testaamattomia.</p>' +
    guideOverview(book, guide) + toc + '<div class="teacher-guide-body">' + html + '</div>' +
    '<nav class="teacher-guide-nav" aria-label="Muut opettajan ohjeet">' + neighbour(guides[index - 1], '← Edellinen ohje') + neighbour(guides[index + 1], 'Seuraava ohje →') + '</nav></div>';
}
function teacherGuideList(book) {
  const guides = book.localTeacherGuides || [];
  return guides.length ? '<h3>Lukujen opettajan ohjeet</h3><ul class="teacher-guide-list">' + guides.map(guide =>
    '<li><a href="' + e(teacherGuideUrl(book.id, guide.id)) + '">' + e(guide.title) + '</a></li>').join('') + '</ul>' : '';
}
export function teacherSection(book) {
  const guide = book.localProofs?.guide, exam = book.localAssessment;
  if (!guide && !exam && !book.localTeacherGuides?.length) return '';
  return '<section class="teacher-section" id="opettajalle" tabindex="-1" aria-labelledby="teacher-title"><h2 id="teacher-title">Opettajalle</h2>' +
    '<p>Ratkaisut, kuuntelukäsikirjoitukset, tulosteet ja kokeen kokoaminen samassa paikassa. Opettajan sivu ei ole suojattu; se on koottu helpottamaan työtä.</p>' +
    '<div class="proof-cards">' +
    (guide ? '<article><h3>Opettajan työkirja</h3><p>Ratkaisut, kuuntelukäsikirjoitukset ja sivukartta · ' + guide.pages + ' sivua · PDF-luonnos</p>' +
      '<div class="actions"><a class="button" href="' + e(guide.file) + '" target="_blank" rel="noopener">Avaa PDF<span class="sr-only">: opettajan työkirja, uusi välilehti</span></a>' +
      '<a href="' + e(guide.file) + '" download="' + e(guide.filename) + '">Lataa</a></div></article>' : '') +
    (exam ? '<article><h3>Koetyökalu</h3><p>Valitse tehtävät, järjestä koepaperi ja säädä vastaustilaa. ' + exam.tasks.length + ' tehtäväluonnosta.</p>' +
      '<div class="actions"><a class="button" href="' + e(examUrl(book.id)) + '">Avaa koetyökalu</a></div></article>' : '') +
    (book.localProofs?.textbook && book.localProofs?.workbook ? '<article><h3>Tulosteet</h3><p>Tekstikirja ja oppilaan työkirja PDF:nä tulostamista varten.</p>' +
      '<div class="actions"><a class="button" href="#book-print">Kirjat paperilla</a></div></article>' : '') +
    '</div>' + teacherGuideList(book) + '<h3>Ensimmäinen oppitunti</h3><ol class="teacher-steps"><li>Avaa luku tekstikirjasta ja näytä aukeama.</li>' +
    '<li>Lukijan Työkirja-painike avaa saman luvun työkirjasivun, PDF:n ja digiharjoitukset.</li>' +
    '<li>Valitse tunnille yksi perusreitin tehtävä ja palaa siihen seuraavalla kerralla ilman mallia.</li></ol></section>';
}
export function resumeView(books, state = {}) {
  const resume = resolveReadingPosition(books, state.position);
  if (!resume) return '';
  const { book, chapter, sectionId, mode } = resume;
  const marker = chapter.label ?? chapter.number;
  return '<section class="resume-reading" aria-labelledby="resume-title"><h2 id="resume-title">Jatka lukemista</h2>' +
    '<p class="resume-where"><strong>' + e(book.title) + '</strong><span>' + (marker !== undefined ? e(marker) + ' · ' : '') + e(chapter.title) +
    ' · Osio ' + (chapter.sectionIds.indexOf(sectionId) + 1) + ' / ' + chapter.sectionIds.length + '</span></p>' +
    '<div class="resume-actions"><a class="button primary" href="' + readerUrl(book.id, chapter.id, sectionId, mode) +
    '">Jatka tästä</a><button type="button" id="clear-reading-position">Tyhjennä lukukohta</button></div>' +
    '<p class="muted resume-note">' + (state.persistent === false ?
      'Selain ei salli lukukohdan tallentamista. Kohta säilyy vain tämän välilehden ajan.' :
      'Lukukohta säilyy vain tässä selaimessa. Tyhjennä se yhteiskäyttöisellä koneella.') + '</p></section>';
}
/** The spread the front page shows: where the reader is, else where the book begins. */
export function frontSpread(book, resume) {
  const proof = printedPages(book);
  if (!proof) return null;
  const page = (resume && sectionPage(book, resume.chapter.id, resume.sectionId)) ||
    Math.min(...readingOrder(book).map(chapter => proof.chapterPages?.[chapter.id]).filter(Number.isInteger).concat(proof.pages));
  return spreadPages(proof.pages, page);
}
/**
 * The front page is itself an aukeama: the left page says what this is and where to
 * continue, the right page is a real spread of the book, opening where it is shown.
 */
export function libraryHero(books, state = {}) {
  const book = resolveReadingPosition(books, state.position)?.book || books[0];
  if (!book) return '';
  const resume = resolveReadingPosition(books, state.position);
  const pages = frontSpread(book, resume);
  const chapter = readingOrder(book)[0];
  // Only what is true of this book today; the aims are said as aims in the note below.
  const practice = drillsOf(book).length || practiceActivities(book).length;
  const facts = [
    book.localProofs?.workbook ? 'Koko lukuvuoden kaari: tekstikirja, työkirja' + (practice ? ' ja sähköiset harjoitukset' : '') : '',
    'Avaa linkistä ilman tunnuksia',
    pages ? 'Tulosta mitä tarvitset: paperilla ja ruudulla samat sivut' : ''].filter(Boolean);
  const right = pages
    ? '<a class="hero-spread" href="' + e(printedSpreadUrl(book.id, partOfPage(book, pages[0]) || chapter.id, pages[0])) + '">' +
      printedThumbnailHtml(book, pages) + '<span class="hero-spread-label">Selaa tekstikirjaa<small>' + e(pageLabel(pages)) + '</small></span></a>'
    : '<a class="hero-spread hero-spread-cover" href="' + e(readerUrl(book.id, chapter.id)) + '">' + cover(book) +
      '<span class="hero-spread-label">Selaa tekstikirjaa<small>' + e(book.title) + '</small></span></a>';
  return '<section class="library-hero" aria-labelledby="hero-title">' +
    '<div class="hero-page hero-text"><p class="hero-eyebrow">Opettajalta opettajille</p>' +
    '<h1 id="hero-title">Oppikirja ilman välimatkaa</h1>' +
    '<p class="hero-lead">Sähköinen oppimateriaali jää helposti etäälle: tunnusten taakse, valikoiden sisään ja kauas siitä, mitä lapsi ja nuori oikeasti elää. Teen kielten oppikirjoja, jotka toimisivat toisin. Ensimmäisenä kuudennen luokan ruotsi.</p>' +
    '<ul class="hero-facts">' + facts.map(fact => '<li>' + e(fact) + '</li>').join('') + '</ul>' +
    '<div id="resume-slot">' + resumeView(books, state) + '</div>' +
    // With a reading position, "Jatka tästä" is the one main action on the page.
    '<div class="hero-actions"><a class="button' + (resume ? '' : ' primary') + '" href="' + e(readerUrl(book.id, chapter.id)) + '">Avaa tekstikirja</a>' +
    (book.localProofs?.workbook ? '<a class="button" href="' + e(workbookUrl(book.id)) + '">Avaa työkirja</a>' : '') +
    '<a href="' + e(bookUrl(book.id)) + '">Kaikki materiaalit</a></div>' +
    '<p class="hero-stage muted">' + e(book.series + ' ' + book.grade + ' · ' + book.statusLabel) + '</p></div>' +
    '<div class="hero-page hero-figure">' + right + '</div></section>' + bookKit(book, practice) + whyNote();
}
/** What the book consists of, each part said as it is today. */
export function bookKit(book, practice) {
  const parts = [
    ['Tekstikirja', 'Luvut painettuina aukeamina ja luettavana tekstinä, sanakortit mukana.'],
    book.localProofs?.workbook && ['Työkirja', 'Tehtävät samoilla sivuilla paperilla ja ruudulla. Jokaisen tehtävän voi avata isona taululle.'],
    practice && ['Sähköiset harjoitukset', 'Luvun sanat ja rakenteet harjoiteltavina, palaute heti.'],
    ['Opettajalle', 'Opettajan ohjeet, ratkaisut ja koetyökalu ovat kehitteillä.'],
  ].filter(Boolean);
  return '<section class="book-kit" aria-labelledby="kit-title"><h2 id="kit-title">Mitä kirjaan kuuluu</h2><ul>' +
    parts.map(([title, text]) => '<li><h3>' + e(title) + '</h3><p>' + e(text) + '</p></li>').join('') + '</ul></section>';
}
/** The author's own reason, in the first person: the part a service cannot copy. */
export function whyNote() {
  return '<section class="why-note" aria-labelledby="why-title"><h2 id="why-title">Miksi teen tätä</h2>' +
    '<p>Kouluilla on nyt kovat säästöpaineet. Tavoitteeni on kokonainen oppikirja koko lukuvuodeksi, josta koulu ei maksa joka vuosi uudelleen, jotta raha jää siihen, mitä kukin koulu kipeimmin tarvitsee.</p>' +
    '<p>Haluan, että kirjan saa auki heti ja tulostettua juuri sen, mitä tunnilla tarvitaan. Selvitän luokassa, mikä toimii ja mikä ei, ja korjaan kirjaa sen mukaan.</p>' +
    '<p>Kirja on koottu osista, joten palaute muuttuu korjaukseksi nopeasti, ja kokonaisuutta voi sovittaa koulun tai alueen tarpeisiin. ' +
    'Kerro, mikä toimi ja mikä ei: ' + external('palaute Discordissa', FEEDBACK_URL) + '. <a href="#/tekijat">Kuka tätä tekee?</a></p></section>';
}
export function libraryView(books, query, state) {
  const compactSearch = books.length <= 1;
  return '<div class="page library-page">' + libraryHero(books, state) +
    '<div class="shelf-heading"><h2 id="library-books">Kirjasto</h2>' +
    (compactSearch ? '<details class="library-search"' + (query ? ' open' : '') + '><summary>Hae kirjastosta</summary>' : '') +
    '<form class="search-form" role="search" id="book-search"><label for="search">Hae kirjoja</label>' +
    '<div class="search-row"><input type="search" id="search" name="q" value="' + e(query) +
    '" placeholder="Kirjan nimi, oppiaine tai luokka"><button class="primary" type="submit">Hae</button></div></form>' +
    (compactSearch ? '</details>' : '') + '</div><p id="library-status" class="muted" role="status"></p>' +
    '<div id="book-results">' + resultList(books, query) + '</div></div>';
}
export function helpView() {
  return '<div class="page help-page"><h1>Ohje</h1><h2>Avaa materiaali</h2>' +
    '<p>Hae kirjaa nimen, oppiaineen tai luokan mukaan. Avaa tekstikirja tai työkirja suoraan kirjastosta. ' +
    'Kaikki materiaalit -sivun Luvut-osiossa on jokaisen luvun tekstikirja, työkirja ja harjoitukset. Sen alla ovat tulosteet ja Opettajalle-osio.</p>' +
    '<p>PDF-esikatselun voi ladata, kun linkki näkyy kirjan kohdalla. Materiaalien saatavuus näkyy kirjan tiedoissa. ' +
    'Käsikirjoitusmerkintä tarkoittaa keskeneräistä oppimateriaalia, ei hyväksyttyä julkaisua.</p>' +
    '<p>Kirjan materiaalisivun Jatka lukemista palauttaa omaan lukukohtaan. Kielioppi, Fraasit ja Aakkosellinen sanasto löytyvät materiaalisivulta ja Luvut-valikosta, kun ne kuuluvat kirjaan. ' +
    'Merkintä Ei vielä käytettävissä tässä verkkoversiossa tarkoittaa, ettei kyseistä materiaalia voi avata tästä palvelusta.</p>' +
    '<p>Tulosta koko kirja PDF-esikatselusta. Selaimen tulostus tulostaa vain näkyvissä olevat sisältösivut ' +
    'tai Koko luku -tilan luvun. Näiden sivujen lisätuet ja roolikortit avataan tulostukseen automaattisesti.</p>' +
    '<h2>Lue ja selaa</h2><p>Luvut-painike avaa sisällysluettelon. Luvun osan voi valita myös yläpalkista. ' +
    'Edellinen ja Seuraava selaavat saman luvun sivuja. Tietokoneella voit käyttää myös nuolinäppäimiä, ' +
    'puhelimella vaakapyyhkäisyä. Tietokoneella ja tabletilla luvun osiot jatkuvat sivulta toiselle kuten kirjassa: pitkä osio jatkuu seuraavalla sivulla, eikä tehtävää katkaista, jos se mahtuu yhdelle sivulle. Puhelimella sivua vieritetään. Luvun viimeisellä sivulla Seuraava luku -linkki avaa seuraavan luvun. ' +
    'Sama linkki on Koko luku -tilan alapalkissa. Näppäin tai pyyhkäisy ei vaihda lukua automaattisesti.</p>' +
    '<p>Luvun ensimmäisellä sivulla Edellinen-linkki avaa edellisen luvun lopun. Koko luku -tilassa sama linkki on alapalkissa. Puhelimella sen tunnistaa vasemmalle osoittavasta nuolesta.</p>' +
    '<p>Sanasto löytyy suoraan yläpalkista. Hae sanaa, käyttöfraasia tai suomenkielistä merkitystä. Hakutulos näyttää myös luvun ja käyttötavan. ' +
    'Lukuasetuksista voit vaihtaa aukeaman ja koko luvun välillä, suurentaa tekstiä, ' +
    'avata koko ruudun tilan, ladata kirjan PDF:n sekä lukea ohjeet ja kirjan tiedot. Puhelimella lukuasetukset avataan säätimien kuvakkeesta.</p>' +
    '<p>Näytä erikseen avaa yhden sisältöosan leveään näkymään. Voit avata sen myös otsikosta tai sivun tyhjästä reunasta. ' +
    'Tekstiä voi valita normaalisti. Palaa Takaisin-painikkeesta tai Esc-näppäimellä; lukukohta ja vieritys säilyvät.</p>' +
    '<h2>Työkirja ja digitehtävät</h2><p>Kun kirjan työkirja on käytettävissä, lukijan yläpalkin Työkirja-painike avaa luvun työkirjan, ' +
    'luvun digitehtävät ja työkirjan sivuhaun. Kirjan materiaalisivun Avaa työkirja näyttää työkirjan sivun ja sen vieressä tekstikirjan kohdat, ' +
    'joihin sivu viittaa. Työkirjan tehtävät tehdään paperille tai vihkoon.</p>' +
    '<p>Digitehtävät ovat erillisiä kokeiluja. Vastaukset säilyvät oletuksena vain avoimessa välilehdessä. ' +
    'Työn säilytys -kohdasta voi sallia tallennuksen tähän selaimeen. Ota työ talteen tiedostona ennen sulkemista; ' +
    'tiedoston voi tuoda takaisin samaan harjoitukseen.</p>' +
    '<p>Kun tekstikirjan PDF on liitetty, lukijan alapalkki näyttää näkyvien osioiden sivut painetussa kirjassa. ' +
    'Luvut-paneelista voi siirtyä painetun tekstikirjan sivulle.</p>' +
    '<h2>Lukukohta ja selaimen tallennus</h2><p>Viimeksi avattu lukukohta ja tekstikoko tallennetaan vain ' +
    'tähän selaimeen, jos selain sallii tallennuksen. Tietoja ei lähetetä palvelimelle eikä synkronoida ' +
    'eri laitteisiin. Oppilaan vastauksia tai henkilötietoja ei tallenneta tähän lukukohtatoimintoon.</p>' +
    '<p>Jatka tästä avaa viimeksi käytetyn luvun ja sisältöosan samalla lukutavalla. ' +
    'Saman kirjan sisällysluettelossa, kieliopissa tai muulla apusivulla käyminen ei korvaa luvun lukukohtaa. ' +
    'Apusivun Lukuun-linkki palauttaa samaan kohtaan ja lukutapaan, myös sivun päivittämisen jälkeen, jos tallennus on sallittu. ' +
    'Ilman aiempaa lukukohtaa myös apusivua voi jatkaa myöhemmin. ' +
    'Jos kirja, painos tai osio ei enää löydy, jatkamispainiketta ei näytetä.</p>' +
    '<p>Yhteiskäyttöisellä koneella valitse kirjastosta Tyhjennä lukukohta. Tämä poistaa vain lukukohdan, ' +
    'ei tekstikoon asetusta. Jos tallennus on estetty, lukija toimii silti.</p>' +
    '<a class="button" href="#/library">Takaisin kirjastoon</a></div>';
}
export function supportLinks(book, mode='spread') {
  const labels={'grammar-guide':'Kielioppi','phrase-guide':'Fraasit','vocabulary-index':'Aakkosellinen sanasto'};
  const parts=(book.backMatter||[]).filter(part=>labels[part.supportType]);
  if (!parts.length) return '';
  return '<nav class="support-shortcuts" aria-label="Lukemisen apusivut">'+parts.map(part=>
    '<a class="button" href="'+e(readerUrl(book.id,part.id,'',mode))+'">'+labels[part.supportType]+'</a>').join('')+'</nav>';
}
export function materialAvailability(material,book) {
  const proof=book?.localProofs?.[material.id];
  if(proof) return 'PDF-luonnos · '+proof.pages+' sivua'+(material.type==='reader'?' · Luettavissa myös selaimessa':' · Vastaa paperille tai vihkoon');
  return material.type==='reader' && ['draft','published'].includes(material.status) ? material.statusLabel+' · Luettavissa selaimessa' :
    material.statusLabel+' · Ei vielä käytettävissä tässä verkkoversiossa';
}
function workbookPageForm(proof,page) {
  return '<form id="workbook-page-search"><label for="workbook-page">Työkirjan sivu (1–'+proof.pages+')</label><div>'+
    '<input id="workbook-page" name="sivu" type="number" inputmode="numeric" required min="1" max="'+proof.pages+'"'+(page && page<=proof.pages?' value="'+page+'"':'')+'>'+
    '<button type="submit">Hae sivu</button></div></form>';
}
// Paper page jump for the printed textbook that matches this local proof.
export function textbookPageForm(book) {
  const proof=book.localProofs?.textbook;
  if(!proof?.sectionPages?.length)return '';
  return '<form class="page-jump" id="textbook-page-search"><label for="textbook-page">Siirry tekstikirjan sivulle (1–'+proof.pages+')</label><div>'+
    '<input id="textbook-page" name="sivu" type="number" inputmode="numeric" required min="1" max="'+proof.pages+'">'+
    '<button type="submit">Siirry</button></div><p class="muted" id="textbook-page-status" role="status"></p></form>';
}
// One place for the chapter's workbook: paper PDF, digital practice and page lookup.
export function workbookPanelView(book,chapter) {
  const proof=book.localProofs?.workbook,pdf=workbookChapterLink(book,chapter),practice=practiceLink(book,chapter)+drillLinks(book,chapter);
  if(!pdf&&!practice&&!proof?.pageSources)return '';
  return '<aside class="workbook-panel" id="workbook-panel" aria-labelledby="workbook-panel-title" hidden>'+
    '<div class="panel-heading"><h2 id="workbook-panel-title">Työkirja</h2><button type="button" id="close-workbook" aria-label="Sulje työkirja">Sulje</button></div>'+
    (pdf||practice?'<h3>Tämä luku</h3><div class="workbook-panel-links">'+
      (Number.isInteger(proof?.chapterPages?.[chapter.id])?'<a class="button workbook-chapter-link" href="'+e(workbookUrl(book.id,proof.chapterPages[chapter.id]))+'">Avaa luvun työkirja<small>Sivu '+proof.chapterPages[chapter.id]+' ja tekstikirjan lähteet rinnakkain</small></a>':'')+
      pdf+practice+'</div>'+
      (practice?'<p class="muted">Digitehtävä on erillinen kokeilu. Muut työkirjan tehtävät tehdään paperille tai vihkoon.</p>':''):'')+
    (proof?.pageSources?'<h3>Työkirjasta tekstikirjaan</h3><p>Kirjoita työkirjan sivunumero. Saat tehtävän mallin tai lukutekstin tekstikirjasta.</p>'+workbookPageForm(proof):'')+
    '</aside>';
}
// The chapter that a printed page belongs to (chapters start on their mapped page).
function chapterForPage(book,kind,page) {
  const starts=Object.entries(book.localProofs?.[kind]?.chapterPages||{}).filter(([,start])=>start<=page).sort((a,b)=>b[1]-a[1]);
  return starts.length ? readingOrder(book).find(chapter=>chapter.id===starts[0][0]) : undefined;
}
export function workbookChapterForPage(book,page) { return chapterForPage(book,'workbook',page); }
// Tasks printed on one workbook page, with the same route label as the paper.
export function workbookPageTasks(proof,page,link=null) {
  const groups=new Map();
  for(const [id,task] of Object.entries(proof?.tasks||{})) if(task.page===page) groups.set(task.number,task.route??'base');
  if(!groups.size)return '';
  const items=[...groups].sort((a,b)=>a[0]-b[0]).map(([number,route])=>'<li>'+(link?'<a class="task-link" href="'+e(workbookTaskUrl(link.bookId,page,number))+'">Tehtävä '+e(number)+'</a>':'Tehtävä '+e(number))+routeTag(route)+'</li>');
  const optional=[...groups.values()].some(route=>route!=='base');
  return '<h2 class="workbook-task-title">Tämän sivun tehtävät</h2><ul class="workbook-task-routes">'+items.join('')+'</ul>'+
    (optional?'<p class="muted">Valittava tehtävä tehdään opettajan valinnan tai oman tarpeen mukaan. Paperilla sen numero on valkoisessa pallossa.</p>':'');
}
function workbookSourceList(book,proof,page) {
  const sources=proof.pageSources?.[page]||[];
  return sources.length ? '<ul class="workbook-source-list">'+sources.map(source=>{
    const chapter=readingOrder(book).find(part=>part.id===source.chapter);
    const title=source.title==='Avausaukeama'?'Aloitus':source.title.replace(/\*/g,'');
    const range=source.page===source.endPage?source.page:source.page+'–'+source.endPage;
    return '<li><a href="'+e(readerUrl(book.id,source.chapter,source.section))+'">'+e(title)+'</a><small>'+e(chapter.title)+' · Tekstikirja s. '+range+'</small></li>';
  }).join('')+'</ul>' : '<p>Tälle sivulle ei ole merkitty tekstikirjan kohtaa.</p>';
}
// The same printed page in the interactive reader: larger text, word help and tasks.
function textbookReaderList(book,page) {
  const target=textbookPageTarget(book,page);
  if(!target)return '<p>Tälle sivulle ei ole lukijan kohtaa.</p>';
  const chapterTitle=id=>readingOrder(book).find(chapter=>chapter.id===id)?.title||'';
  if(!target.exact)return '<p>Sivu kuuluu luvun sanastoon tai kertaukseen.</p><ul class="workbook-source-list"><li><a href="'+
    e(readerUrl(book.id,target.chapterId))+'">Avaa luku lukijassa</a><small>'+e(chapterTitle(target.chapterId))+'</small></li></ul>';
  return '<ul class="workbook-source-list">'+target.sections.map((section,index)=>'<li><a href="'+e(readerUrl(book.id,section.chapterId,section.sectionId))+'">'+
    (target.sections.length>1?'Kohta '+(index+1)+' lukijassa':'Avaa tämä kohta lukijassa')+'</a><small>'+e(chapterTitle(section.chapterId))+'</small></li>').join('')+'</ul>';
}
const paperKinds={
  workbook:{label:'Työkirja',genitive:'Työkirjan',url:workbookUrl},
  textbook:{label:'Tekstikirja',genitive:'Tekstikirjan',url:textbookUrl}
};
// One printed page of the attached learner PDF beside its links to the other book.
export function paperPageView(book,kind,requestedPage) {
  const proof=book.localProofs?.[kind],meta=paperKinds[kind];
  if(!proof||!meta)return '';
  const page=Math.min(Math.max(requestedPage||Object.values(proof.chapterPages||{})[0]||1,1),proof.pages);
  const chapter=chapterForPage(book,kind,page);
  const marker=chapter?(chapter.label??chapter.number):undefined;
  const pdf=proof.file+'#page='+page;
  const pager=(target,label,rel)=>target>=1&&target<=proof.pages?'<a class="button workbook-'+rel+'" href="'+e(meta.url(book.id,target))+'" rel="'+rel+'">'+label+'</a>':'<span class="button workbook-'+rel+'" aria-disabled="true">'+label+'</span>';
  const aside=kind==='workbook'
    ? '<h2 id="paper-sources-title">Tekstikirjasta tähän sivuun</h2>'+workbookSourceList(book,proof,page)+
      (proof.pageSources?.[page]?.length?'<p class="muted">Tekstikirjan linkki avaa mallin. Selaimen Takaisin palaa tähän sivuun.</p>':'')+
      workbookPageTasks(proof,page)+drillPageLinks(book,page)+(chapter?practiceLink(book,chapter):'')
    : '<h2 id="paper-sources-title">Sama sivu lukijassa</h2>'+textbookReaderList(book,page)+
      '<p class="muted">Lukijassa voit suurentaa tekstiä, käyttää sanastoa ja avata tehtävän erikseen.</p>';
  return '<div class="page workbook-page paper-page-'+kind+'">'+breadcrumbs(book)+
    '<p class="eyebrow">'+meta.label+' · '+(kind==='workbook'?'Sisusluonnos':'PDF-luonnos')+' · '+proof.pages+' sivua</p>'+
    '<h1 id="'+kind+'-view-title" tabindex="-1">'+meta.genitive+' sivu '+page+'</h1>'+
    (chapter?'<p class="muted">'+(marker!==undefined?e(marker)+' · ':'')+e(chapter.title)+'</p>':'')+
    '<div class="workbook-toolbar">'+pager(page-1,'← Edellinen sivu','prev')+
    '<form id="'+kind+'-view-page" data-paper-kind="'+kind+'"><label for="'+kind+'-view-input">Sivu</label><input id="'+kind+'-view-input" name="sivu" type="number" inputmode="numeric" required min="1" max="'+proof.pages+'" value="'+page+'"><button type="submit">Siirry</button></form>'+
    pager(page+1,'Seuraava sivu →','next')+
    '<a class="workbook-pdf-link" href="'+e(pdf)+'" target="_blank" rel="noopener">Avaa sivu PDF:nä<span class="sr-only"> uuteen välilehteen</span></a></div>'+
    '<div class="workbook-view-body"><div class="workbook-frame">'+(kind==='workbook'?workbookPageImage(proof,page):'<iframe src="'+e(pdf)+'" title="'+meta.genitive+' sivu '+page+' (PDF)"></iframe>')+
    '<p class="workbook-frame-note muted">'+(kind==='textbook'?'<span class="workbook-frame-hint">Jos sivu ei näy, avaa se PDF:nä uuteen välilehteen. </span>':'Tulostamista varten avaa PDF. ')+
    (kind==='workbook'?'Vastaa paperille tai vihkoon.':'')+'</p></div>'+
    '<aside class="workbook-sources" aria-labelledby="paper-sources-title">'+aside+'</aside></div></div>';
}
export function workbookView(book,requestedPage) { return paperPageView(book,'workbook',requestedPage); }
function workbookLookup(book, {workbookPage:page, workbookHash} = {}) {
  const proof=book.localProofs?.workbook;
  if (!proof?.pageSources && !page) return '';
  const resultHeading = '<h3 id="workbook-page-result" tabindex="-1">Työkirjan sivu '+e(page)+'</h3>';
  if (!proof?.pageSources) return '<section>'+resultHeading+'<p>Tämän verkkoversion työkirjalle ei ole sivuhakua.</p></section>';
  let result='';
  if (page) {
    if (workbookHash && workbookHash !== proof.sha256) result='<p>Linkki on tehty toisesta työkirjavedoksesta. Tarkista sivunumero nykyisestä työkirjasta ja hae uudelleen.</p>';
    else if (page > proof.pages) result='<p>Tässä työkirjassa on '+proof.pages+' sivua. Tarkista sivunumero.</p>';
    else {
      result=(proof.pageSources[page]?.length?'<p>Avaa tehtävään liittyvä kohta tekstikirjasta.</p>':'')+workbookSourceList(book,proof,page);
      result+='<p class="actions"><a class="button" href="'+e(workbookUrl(book.id,page))+'">Näytä sivu ja lähteet rinnakkain</a>'+
        '<a href="'+e(proof.file+'#page='+page)+'" target="_blank" rel="noopener">Avaa työkirjan sivu '+page+' (PDF)<span class="sr-only">, uusi välilehti</span></a></p>';
    }
  }
  return '<section class="workbook-lookup" aria-labelledby="workbook-lookup-title"><h2 id="workbook-lookup-title">Työkirjasta tekstikirjaan</h2>'+
    '<p>Onko sinulla työkirja auki? Löydät tehtävän mallin tai lukutekstin sivunumerolla.</p>'+
    workbookPageForm(proof,page)+(page?'<div class="workbook-page-result">'+resultHeading+result+'</div>':'')+'</section>';
}
export function bookView(book, state={}, route={}) {
  const resume=resolveReadingPosition([book],state.position);
  const readUrl=resume ? readerUrl(book.id,resume.chapter.id,resume.sectionId,resume.mode) : readerUrl(book.id,readingOrder(book)[0].id);
  return '<div class="page"' + themeStyle(book) + '>' + breadcrumbs(book) + '<div class="book-heading">' + cover(book) +
    '<div><h1>' + e(book.title) + '</h1><p class="muted">' + e(book.subjectLabel) + ' · ' + e(book.grade) +
    '. luokka · ' + e(book.statusLabel) + '</p><p>' + e(book.description) +
    '</p>'+(resume?'<p class="book-resume-note">Lukukohtasi: '+e(resume.chapter.title)+' · osio '+(resume.chapter.sectionIds.indexOf(resume.sectionId)+1)+'</p>':'')+
    '<div class="actions"><a class="button primary" href="' + e(readUrl) +
    '">'+(resume?'Jatka lukemista':'Avaa tekstikirja')+'</a>' +
    (book.localProofs?.workbook ? '<a class="button" href="'+e(workbookUrl(book.id))+'">Avaa työkirja</a>' : '') +
    '<a href="#book-contents">Luvut</a>' +
    (book.localProofs?.guide || book.localAssessment ? '<a href="#opettajalle">Opettajalle</a>' : '') +
    (book.pdf ? '<a class="button" href="' + e(book.pdf.file) + '" download="' + e(book.pdf.filename) + '">Lataa PDF-esikatselu</a>' : '') + '</div></div></div>' +
    '<div class="book-body"><div>'+(route.workbookPage?workbookLookup(book,route):'')+chapterHub(book,resume?.mode||'spread')+'<h2>Materiaalit</h2><p class="muted">Tästä näet, mitä voit käyttää tässä verkkoversiossa.</p><ul class="material-list">' + book.materials.map(material =>
      '<li><div><strong>' + e(material.title) + '</strong><small>' + e(materialAvailability(material,book)) +
      '</small></div>' + (material.type === 'reader' && ['draft', 'published'].includes(material.status) ?
        '<a class="button" href="' + e(readUrl) + '">'+(resume?'Jatka lukemista':'Avaa tekstikirja')+'</a>' : book.localProofs?.[material.id] ?
        (material.id==='workbook' ? '<a class="button" href="'+e(workbookUrl(book.id))+'">Avaa työkirja</a>' :
        '<a class="button" href="'+e(book.localProofs[material.id].file)+'" target="_blank" rel="noopener">Avaa PDF <span class="sr-only">(uusi välilehti)</span></a>') : '') +
      '</li>').join('') + '</ul>'+supportLinks(book,resume?.mode||'spread') + practiceInvitation(book) +
    (route.workbookPage?'':workbookLookup(book,route)) + printBookView(book) + (teacherSection(book) || examLink(book)) + '</div><aside aria-label="Kirjan tiedot"><h2>Tiedot</h2><dl class="metadata">' +
    '<div><dt>Versio</dt><dd>' + e(book.version) + '</dd></div><div><dt>Opetussuunnitelma</dt><dd>' + e(book.curriculum) +
    '</dd></div><div><dt>' + (book.status === 'published' ? 'Lisenssi' : 'Lisenssisuunnitelma') + '</dt><dd>' + e(book.license) + '</dd></div></dl>' +
    (['draft', 'editorial-pass-1'].includes(book.status) ? '<div class="draft-note"><p>Käsikirjoitus. Kieli, kuvitus ja äänitteet ovat vielä viimeistelemättä.</p></div>' : '') + '</aside></div></div>';
}
// Name every available chapter; the rest of the workbook remains on paper.
function practiceScopeText(book) {
  const chapters=book.chapters.filter(chapter=>practiceActivities(book).some(item=>item.chapterId===chapter.id));
  const numbers=chapters.map(chapter=>chapter.number).filter(number=>number!==undefined);
  return numbers.length ? (numbers.length===1?'Luvusta ':'Luvuista ')+numbers.map(e).join(' ja ')+
    (numbers.length===1?' on erillinen digitaalinen kokeilu.':' on erillisiä digitaalisia kokeiluja.') : 'Työkirjasta on erillinen digitaalinen kokeilu.';
}
export function printBookView(book) {
  if(book.localProofs?.textbook && book.localProofs?.workbook) {
    return '<section class="print-book-overview" id="book-print" aria-labelledby="book-print-title"><h2 id="book-print-title">Kirjat paperilla</h2>'+
      '<p>Avaa koko kirja uuteen välilehteen tai lataa se tulostamista varten. Nämä ovat paikallisia taittoluonnoksia. PDF-sivut ja verkkolukijan sisältösivut ovat eri asioita.</p>'+
      '<div class="proof-cards">'+Object.entries({textbook:'Tekstikirja',workbook:'Työkirja'}).map(([key,label])=>{
        const proof=book.localProofs[key];
        return '<article><h3>'+label+'</h3><p>'+proof.pages+' sivua · PDF-luonnos</p><div class="actions">'+
          '<a class="button" href="'+e(proof.file)+'" target="_blank" rel="noopener">Avaa PDF<span class="sr-only">: '+label+', uusi välilehti</span></a>'+
          '<a href="'+e((key==='textbook'?textbookUrl:workbookUrl)(book.id))+'">Selaa sivuja<span class="sr-only">: '+label+'</span></a>'+
          '<a href="'+e(proof.file)+'" download="'+e(proof.filename)+'">Lataa PDF<span class="sr-only">: '+label+'</span></a></div></article>';
      }).join('')+'</div><p>'+(practiceActivities(book).length?practiceScopeText(book)+' Koko työkirjaan vastaat paperille tai vihkoon.':'Työkirjaa ei vielä täytetä tässä palvelussa. Vastaa paperille tai vihkoon.')+' Kokeile ennen koko kirjan tulostamista muutamaa kaksipuolista sivua.</p></section>';
  }
  if (!book.pdf) return '';
  return '<section class="print-book-overview" id="book-print" aria-labelledby="book-print-title"><h2 id="book-print-title">Painettava kokonaisuus</h2>'+
    '<p>Koko tekstikirja on yhdessä PDF-tiedostossa. Siinä näkyvät tämän version todelliset sivut ja sivunumerot. Verkkolukijan sisältösivut eivät vastaa yksi yhteen paperisivuja.</p>'+
    (book.chapters.some(chapter=>chapter.presentation)?'<p class="draft-note">Kuvitusluonnokset näkyvät tässä paikallisessa kokeessa. Lataus-PDF ja paperivedokset ovat erillisiä taittoversioita.</p>':'')+
    (book.chapters.some(chapter=>chapter.illustrationSlots?.length)?'<p class="muted">Verkkolukijan katkoviivakehykset näyttävät suunnitellut avauskuvien paikat. Ladattava PDF ja kuvapaikallinen paperikoetaitto ovat vielä eri versioita.</p>':'')+
    '<div class="actions"><a class="button primary" href="'+e(book.pdf.file)+'" target="_blank" rel="noopener">Avaa koko kirja (PDF)</a>'+
    '<a class="button" href="'+e(book.pdf.file)+'" download="'+e(book.pdf.filename)+'">Lataa tulostettava PDF</a></div>'+
    '<p class="muted">Katso PDF-lukijassa aukeamanäkymää kansisivu erillään, jos lukija tarjoaa tämän asetuksen. Tarkista ennen koko kirjan tulostusta muutama kaksipuolinen koesivu.'+
    (book.status==='published'?'':' PDF on nykyinen toimitusluonnos, ei vielä painovalmis kirja.')+'</p></section>';
}
export function workbookChapterLink(book,chapter) {
  const proof=book.localProofs?.workbook,page=proof?.chapterPages?.[chapter.id];
  if(!Number.isInteger(page)||page<1||page>proof.pages)return '';
  return '<a class="button workbook-chapter-link" href="'+e(proof.file+'#page='+page)+'" target="_blank" rel="noopener">'+
    'Luvun työkirja (PDF)<small>Sivu '+page+' · avautuu uuteen välilehteen</small></a>';
}
// Self-test hides one language; each hidden answer is a button that reveals only itself.
// The book's vocabulary names its languages; labels follow them (source = taught language).
const vocabularyOf = (book, chapter) => chapter?.vocabulary || book?.chapters?.find(item => item.vocabulary)?.vocabulary || {};
const QUIZ_MODES = ['source', 'target'];
function quizAnswer(html, label) {
  return label ? '<button type="button" class="vocabulary-reveal" aria-label="' + e(label) + '"><span class="vocabulary-answer">' + html + '</span></button>' : html;
}
export function vocabularyResultsView(book, chapter, query = '', scope = 'chapter', mode = 'spread', quiz = '', random = Math.random) {
  if (!QUIZ_MODES.includes(quiz)) quiz = '';
  const sourceName = languageName(vocabularyOf(book, chapter).sourceLanguage, 'source');
  const sv = quiz === 'source' ? 'Näytä ' + sourceName.adjective + ' sana' : '', fi = quiz === 'target' ? 'Näytä merkitys' : '';
  if (!hasVocabularyQuery(query) && !quiz) return '<p role="status" id="vocabulary-count">Kirjoita sana, ilmaus tai merkitys hakukenttään.</p>' +
    '<p>Tuloksessa näkyvät sanan luku ja käyttö.</p>';
  const entries = searchReadingSupport(book, chapter, query, scope);
  // Alphabetical order gives away neighbours, so a self-test is shuffled.
  if (quiz) for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  const vocabulary = chapter.vocabulary || book.chapters.find(item => item.vocabulary)?.vocabulary;
  return '<p role="status" id="vocabulary-count">' + entries.length + (quiz ? (entries.length === 1 ? ' sana kerrattavana' : ' sanaa kerrattavana') +
      '. Muista ensin, avaa sitten piilotettu kohta.' : entries.length === 1 ? ' hakutulos' : ' hakutulosta') + '</p>' +
    (quiz && entries.length ? '<div class="vocabulary-quiz-tools"><p id="vocabulary-progress" aria-live="polite">Avattu 0 / ' + entries.length + '</p>' +
      '<button type="button" id="vocabulary-reshuffle">Sekoita ja peitä uudelleen</button></div>' : '') +
    (entries.length ? '<dl class="vocabulary-list">' + entries.map(entry =>
      '<div><dt lang="' + e(vocabulary.sourceLanguage) + '">' + quizAnswer(e(entry.form), sv) + '</dt>' +
      (entry.forms ? '<dd class="vocabulary-forms" lang="' + e(vocabulary.sourceLanguage) + '"><span class="sr-only">Muodot: </span>' +
        quizAnswer(entry.forms.map(e).join(' · '), sv && 'Näytä taivutusmuodot') + '</dd>' : '') +
      '<dd lang="' +
      e(vocabulary.targetLanguage) + '">' + quizAnswer(entry.meanings.map(e).join('; '), fi) + '</dd><dd class="vocabulary-references">' +
      entry.references.map(ref => scope === 'book' ? '<a href="' + readerUrl(book.id,ref.chapterId,'',mode) + '">' +
        e(ref.chapterTitle) + ' — ' + e(ref.groupTitle) + '</a>' : '<span>' + e(ref.groupTitle) + '</span>').join('') +
      '</dd></div>').join('') + '</dl>' : '<p>Haulla ei löytynyt sanoja. Kokeile lyhyempää sanaa tai vaihda haku koko kirjaan.</p>');
}
export function vocabularyView(chapter, book = {chapters:[chapter]}, mode = 'spread') {
  if (!chapter.vocabulary && !book.chapters.some(item => item.vocabulary)) return '';
  const words = vocabularyOf(book, chapter), source = languageName(words.sourceLanguage, 'source'), target = languageName(words.targetLanguage, 'target');
  return '<aside class="vocabulary-panel" id="vocabulary-panel" aria-labelledby="vocabulary-title" hidden>' +
    '<div class="panel-heading"><h2 id="vocabulary-title">Sanasto</h2><button type="button" id="close-vocabulary" aria-label="Sulje sanasto">Sulje</button></div>' +
    '<div class="vocabulary-search"><label for="vocabulary-query">Hae sanaa tai merkitystä</label>' +
    '<input type="search" id="vocabulary-query" placeholder="' + e(capitalize(source.adverb) + ' tai ' + target.adverb) + '" autocomplete="off" aria-describedby="vocabulary-search-hint">' +
    '<p class="muted" id="vocabulary-search-hint">Hae myös käyttöfraaseja, esimerkiksi kysymyksiä.</p>' +
    '<label for="vocabulary-scope">Hakualue</label><select id="vocabulary-scope"><option value="chapter"' + (!chapter.vocabulary ? ' disabled' : '') + '>Tämä luku</option>' +
    '<option value="book"' + (!chapter.vocabulary ? ' selected' : '') + '>Koko kirja</option></select>' +
    '<label for="vocabulary-quiz">Kertaa sanat</label><select id="vocabulary-quiz" aria-describedby="vocabulary-quiz-hint">' +
    '<option value="">Näytä kaikki</option><option value="source">Piilota ' + e(source.name) + '</option><option value="target">Piilota ' + e(target.name) + '</option></select>' +
    '<p class="muted" id="vocabulary-quiz-hint">Kertaus näyttää hakualueen kaikki sanat ilman hakua.</p></div>' +
    '<p class="vocabulary-intro" id="vocabulary-note">' + e(chapter.vocabulary?.note || 'Sanat ja ilmaukset kirjan luvuista.') + '</p>' +
    '<div id="vocabulary-results">' + vocabularyResultsView(book,chapter,'',chapter.vocabulary ? 'chapter' : 'book',mode) + '</div></aside>';
}
export function readerInfoView(book, chapter) {
  return '<aside class="reader-info-panel" id="reader-info" aria-labelledby="reader-info-title" hidden>' +
    '<div class="panel-heading"><h2 id="reader-info-title">Ohjeet ja kirjan tiedot</h2>' +
    '<button type="button" id="close-info" aria-label="Sulje info">Sulje</button></div>' +
    '<h3>Lukeminen</h3><ul><li>Luvut avaa sisällysluettelon ja luvunvaihdon. Luvun osa siirtää suoraan valittuun kohtaan.' +
    (book.localProofs?.textbook ? ' Luvut-paneelin sivuhaku avaa painetun tekstikirjan sivulla olevan kohdan.' : '') + '</li>' +
    '<li>Lukuasetusten Lukutapa-valinnasta Aukeama näyttää kaksi sisältösivua rinnakkain ja Yksi sivu yhden. Automaattinen sovittaa sivumäärän ikkunan leveyteen. Valinta säilyy tässä selaimessa, jos selaimen tallennus on käytettävissä. Pitkä osio jatkuu seuraavalla sivulla; tekstikoon tai ikkunan muutos jakaa sivut uudelleen. Koko luku näyttää kaikki osat peräkkäin. Alapalkin Aukeamatilaan-painike avaa kaksi sivua rinnakkain.</li>' +
    '<li>Näytä erikseen suurentaa yhden osion. Edellinen ja Seuraava selaavat saman luvun osioita. Takaisin tai Esc sulkee suurennuksen ja palauttaa alkuperäiseen lukukohtaan. Osion numero ei ole painetun kirjan sivunumero.' +
    (book.localProofs?.textbook ? ' Alapalkki näyttää näkyvien osioiden sivut painetussa tekstikirjassa.' : '') + '</li>' +
    (book.localProofs?.workbook ? '<li>Työkirja avaa luvun työkirjan oikealta sivulta, luvun digitehtävät ja työkirjan sivuhaun. Sulje tai Esc palauttaa lukemiseen.</li>' : '') +
    '<li>Lukuasetuksissa A− ja A+ muuttavat tekstikokoa välillä 100–150 %. Koko ruutu laajentaa lukutilan; poistu sen painikkeesta tai Esc-näppäimellä.</li>' +
    (book.chapters.some(item => item.vocabulary) ? '<li>Sanastosta voit hakea ' + e(languageName(vocabularyOf(book, chapter).sourceLanguage).genitive) + ' sanoilla, kokonaisilla käyttöfraaseilla tai ' + e(languageName(vocabularyOf(book, chapter).targetLanguage, 'target').adjective) + 'illä merkityksillä. Valitse Tämä luku tai Koko kirja. Tuloksen yhteydessä näkyy sen käyttö; haku ei muuta kaikkia sanoja opeteltaviksi. Sulje tai Esc palauttaa lukemiseen.</li>' : '') +
    (book.pdf ? '<li>PDF lataa koko tekstikirjan tämänhetkisen esikatselun.</li>' : '') +
    '<li>Sivunvaihtopainikkeet selaavat nykyistä lukua. Ensimmäisellä sivulla erillinen Edellinen-linkki vie edellisen luvun loppuun. Viimeisellä sivulla on siirtymä seuraavaan lukuun tai apusivuun. Koko luku -tilan alapalkissa ovat samat luvunvaihdot. Lukua vaihdetaan vain linkistä, ei nuolinäppäimellä tai pyyhkäisyllä. Kirjoittaminen ja tekstin valinta eivät käynnistä sivunvaihtoa.</li><li>Info suljetaan Sulje-painikkeella tai Esc-näppäimellä. Lukukohta ei muutu.</li></ul>' +
    '<h3>Nykyinen aineisto</h3><p>' + e(book.title) + ' · ' + e(book.statusLabel) + '</p>' +
    '<p>Versio: ' + e(book.version) + '</p><ul>' + book.materials.map(material =>
      '<li>' + e(material.title) + ' — ' + e(materialAvailability(material,book)) + '</li>').join('') + '</ul>' +
    '<p><a href="' + bookUrl(book.id) + '">Kirjan tiedot ja lisenssi' + (book.status === 'published' ? '' : 'suunnitelma') + '</a></p></aside>';
}
/** The reader's section pages; the paginated spread renders every section once. */
export function readerSectionsHtml(book, chapter, sections, list = sections) {
  return list.map(section => renderSection(section, {
    chapter: section.id === sections[0].id ? chapter : undefined,
    supportType: chapter.supportType,
    presentation: chapter.presentation,
    illustrationSlots: chapter.illustrationSlots,
    learningVisuals: chapter.learningVisuals,
    readerEdition: chapter.readerEdition,
    practiceLinks: practiceSectionLinks(book,chapter,section.id),
    focusable: chapter.supportType !== 'contents',
    afterTitle: returnMarksEnabled(book, chapter.id) ? returnMarkControl(section) : '',
    pageLabel: 'Sisältösivu ' + (sections.indexOf(section) + 1) + ': ' + section.title
  })).join('');
}
export function readerView(book, chapter, sections, index, mode, fontSize, selectedSection = sections[index].id, pageSize = 2, returnTo = null, pageLayout = 'auto', printed = null, pageZoom = 100) {
  pageSize = readerPageSize(chapter, pageSize === 1, pageLayout, !!printed);
  const isSpread = mode === 'spread';
  const visible = isSpread ? sections.slice(index, index + pageSize) : sections;
  // A printed spread is an image of the book; the chapter heading stays for assistive technology.
  const openingVisible = !printed && visible.some(section => section.id === sections[0].id);
  const marker = chapter.label ?? chapter.number;
  const bookLink = returnTo ? {
    href: readerUrl(returnTo.book.id, returnTo.chapter.id, returnTo.sectionId, returnTo.mode),
    label: 'Lukuun – palaa lukukohtaan: ' + returnTo.chapter.title,
    subtitle: '← Palaa lukukohtaan', title: returnTo.chapter.title, short: 'Lukuun'
  } : {href: bookUrl(book.id), label: 'Materiaalit ja kirjan tiedot: ' + book.title,
    subtitle: '← ' + book.series + ' ' + book.grade,
    title: (marker !== undefined ? marker + ' · ' : '') + chapter.title, short: 'Kirja'};
  const options = '<div class="reader-options" id="reader-options" role="region" aria-labelledby="reader-options-title" hidden>' +
    '<div class="panel-heading"><h2 id="reader-options-title">Lukuasetukset</h2><button type="button" id="close-options" aria-label="Sulje lukuasetukset">Sulje</button></div>' +
    '<label for="reading-mode">Lukutapa</label><select id="reading-mode">' +
    [['auto','Automaattinen · ikkunan mukaan'],['spread','Aukeama · kaksi sivua'],['single','Yksi sivu'],['chapter','Koko luku']].map(([value,label]) =>
      '<option value="'+value+'"'+((isSpread ? pageLayout : 'chapter')===value?' selected':'')+'>'+label+'</option>').join('')+'</select>' +
    // A printed page is enlarged as a whole; text size belongs to the text view.
    (printed ? '<p class="setting-note">Sivun koko on alapalkissa. Tekstikoko ja sanakortit: Lue tekstinä.</p>'
    : '<div class="reader-setting"><span id="text-size-title">Tekstikoko</span><div class="control-group" role="group" aria-labelledby="text-size-title"><button type="button" data-font="-1" aria-label="Pienennä tekstiä"' +
    (fontSize === 16 ? ' disabled' : '') + '>A−</button><output id="font-size-label" aria-live="polite">' + Math.round(fontSize / 16 * 100) +
    '%</output><button type="button" data-font="1" aria-label="Suurenna tekstiä"' + (fontSize === 24 ? ' disabled' : '') + '>A+</button></div></div>') +
    '<div class="reader-option-actions"><button type="button" id="toggle-fullscreen" aria-pressed="false">Koko ruutu</button>' +
    '<a class="button" href="'+bookUrl(book.id)+'">Materiaalit ja lukukohta</a>'+
    '<button type="button" id="toggle-info" aria-expanded="false" aria-controls="reader-info">Ohjeet ja tiedot</button>' +
    (book.pdf ? '<a class="button" href="' + e(book.pdf.file) + '" download="' + e(book.pdf.filename) + '">Lataa kirja (PDF)</a>' : '') + '</div></div>';
  // Each chapter gets one of four accent colours in reading order (subject-neutral).
  const accent = Math.max(0, readingOrder(book).findIndex(item => item.id === chapter.id)) % 4;
  return '<div class="reader-page" data-page-size="' + pageSize + '" data-accent="' + accent + '"' + themeStyle(book) + '>' +
    (!openingVisible ? '<h1 class="sr-only">' + (marker !== undefined ? e(marker) + (chapter.label ? ' – ' : '. ') : '') + e(chapter.title) + '</h1>' : '') +
    '<header class="reader-controls"><a class="reader-book-link' + (returnTo ? ' is-reader-return' : '') + '" href="' + e(bookLink.href) + '" aria-label="' + e(bookLink.label) +
    '"><span>' + e(bookLink.subtitle) + '</span><strong>' + e(bookLink.title) + '</strong><span class="reader-book-short" aria-hidden="true">' + bookLink.short + '</span></a>' +
    '<button type="button" id="toggle-contents" aria-controls="chapter-nav" aria-expanded="false">Luvut</button>' +
    '<label class="sr-only" for="section-select">Luvun osa</label><select id="section-select">' +
    sections.map(section => '<option value="' + e(section.id) + '"' + (section.id === selectedSection ? ' selected' : '') + '>' +
      e(section.title.replace(/[*]/g, '').replace(/^Avausaukeama$/, 'Aloitus')) + '</option>').join('') + '</select>' +
    // On wide book pages the reading position sits here and the spread gets the bottom bar's height.
    (isSpread ? '<div class="reader-position-slot">' + (printed ? printedPosition(book, chapter.id, printed) : '') + '</div>' : '') +
    (printed ? pageZoomControl(pageZoom, 'top') : '') +
    (book.chapters.some(item => item.vocabulary) ? '<button type="button" id="toggle-vocabulary" aria-expanded="false" aria-controls="vocabulary-panel">Sanasto</button>' : '') +
    (workbookPanelView(book,chapter) ? '<button type="button" id="toggle-workbook" aria-expanded="false" aria-controls="workbook-panel">Työkirja</button>' : '') +
    '<button type="button" id="toggle-options" aria-label="Lukuasetukset" title="Lukuasetukset" aria-expanded="false" aria-controls="reader-options">' +
    '<span>Lukuasetukset</span><svg class="settings-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M3 6h18M3 18h18"/><circle cx="8" cy="6" r="3" fill="white"/><circle cx="16" cy="18" r="3" fill="white"/></svg></button>' + options + '</header>' +
    '<p class="reader-status sr-only" id="reader-status" role="status"></p>' +
    '<div class="reader-layout"><nav class="chapter-nav" id="chapter-nav" aria-label="Kirjan sisällysluettelo" hidden>' +
    '<div class="panel-heading"><h2>Sisällysluettelo</h2><button type="button" id="close-contents" aria-label="Sulje sisällysluettelo">Sulje</button>' +
    (book.returnMarks ? '<button type="button" class="return-marks-jump" id="jump-return-marks">Omat merkit</button>' : '') +
    textbookPageForm(book) + '</div>' +
    (book.returnMarks ? '<section class="return-marks" id="return-marks" aria-labelledby="return-marks-title"><h2 id="return-marks-title" tabindex="-1">Omat merkit</h2></section>' : '') +
    chapterBrowserView(book,chapter,sections,selectedSection,mode) +
    '<details class="contents-group"><summary>Materiaalit ja apusivut</summary><div class="contents-materials">' +
    supportLinks(book,mode) +
    '<a href="' + bookUrl(book.id) + '">Kirjan materiaalit ja tiedot</a><a href="#/library">Kirjastoon</a></div></details></nav>' +
    readerInfoView(book, chapter) + vocabularyView(chapter, book, mode) + workbookPanelView(book, chapter) +
    '<div class="reader-content" id="reader-content" tabindex="-1"><div class="reader-pages ' + (isSpread ? 'is-spread' : 'is-chapter') + (printed ? ' is-printed' : '') + (!printed && chapter.supportType === 'contents' ? ' is-contents' : '') + '"' +
      (printed ? ' data-zoom="' + e(String(pageZoom)) + '"' : '') +
      (isSpread && !printed && marker !== undefined ? ' data-chapter-tab="' + e(chapter.label ?? 'Luku ' + marker) + '"' : '') + '>' +
    (printed ? printedSpreadHtml(book, printed, sectionTitles(chapter, sections)) : readerSectionsHtml(book, chapter, sections, visible)) + '</div></div></div>' +
    (printed ? printedNavigation(book, chapter.id, printed, pageSize === 1, 'textbook', pageZoom) : pageNavigation(book,chapter,sections, index, isSpread, pageSize)) +
    '<dialog class="focused-section" id="focused-section" aria-labelledby="focused-title"></dialog></div>';
}
/** Workbook chapters as printed: the first chapter also holds the opening pages. */
export function workbookChapterRanges(book) {
  const proof = book.localProofs?.workbook, order = readingOrder(book);
  const starts = Object.entries(proof?.chapterPages || {}).map(([id, from]) => ({chapter: order.find(item => item.id === id), from}))
    .filter(item => item.chapter && Number.isInteger(item.from)).sort((a, b) => a.from - b.from);
  return starts.map((item, index) => ({...item, from: index ? item.from : 1, start: item.from,
    to: (starts[index + 1]?.from ?? (proof.pages + 1)) - 1}));
}
function workbookTaskLabel(proof, pages) {
  const numbers = [...new Set(Object.values(proof.tasks || {}).filter(task => pages.includes(task.page)).map(task => Number(task.number)))]
    .filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return '';
  return numbers.length === 1 ? 'Tehtävä ' + numbers[0] : 'Tehtävät ' + numbers[0] + '–' + numbers.at(-1);
}
const lowerHeadings = html => html.replace(/<(\/?)h2\b/g, '<$1h4');
/**
 * The workbook in the same reader as the textbook: printed spreads, the same top bar,
 * page turning, chapter browser, page size and full screen. Page tasks, textbook
 * sources and digital practice sit in one panel instead of a separate page.
 */
/** The printed task id of one page and task number, as the learner proof numbers them. */
export function workbookTaskId(book, page, number) {
  const tasks = book.localProofs?.workbook?.tasks || {};
  return Object.keys(tasks).find(id => tasks[id].page === page && tasks[id].number === String(number)) || '';
}
/**
 * One printed task, enlarged from its own page image. The teacher-written answer
 * is behind a button and only present in the local materials preview.
 */
export function workbookTaskView(book, pages, page, number) {
  const area = workbookTaskAreas(book, page).find(item => item.number === String(number));
  if (!area) return '';
  const id = workbookTaskId(book, page, number);
  const route = book.localProofs.workbook.tasks[id]?.route;
  const answer = book.localWorkbookAnswers?.[id];
  const order = pages.flatMap(item => workbookTaskAreas(book, item).map(task => ({page: item, number: task.number})));
  const at = order.findIndex(item => item.page === page && item.number === String(number));
  const step = (target, label, id) => '<a class="button task-link" id="' + id + '" href="' +
    e(workbookTaskUrl(book.id, target.page, target.number)) + '">' + label + ' · tehtävä ' + e(target.number) + '</a>';
  const navigation = order.length > 1 ? '<footer class="task-navigation" aria-label="Aukeaman tehtävät">' +
    (at > 0 ? step(order[at - 1], '←', 'task-previous') : '<span></span>') +
    (at + 1 < order.length ? step(order[at + 1], '→', 'task-next') : '<span></span>') + '</footer>' : '';
  const label = 'Työkirjan tehtävä ' + number + ' sivulla ' + page;
  return '<div class="focused-shell task-shell"><div class="focused-header"><header class="focused-toolbar">' +
    '<div class="focused-heading"><div class="folio-meta"><span>Työkirja s. ' + page + '</span>' +
    (route && route !== 'base' ? '<span class="folio-position">valittava</span>' : '') + '</div>' +
    '<h2 id="focused-title" tabindex="-1">Tehtävä ' + e(number) + (answer?.title ? ' · ' + e(answer.title) : '') + '</h2></div>' +
    '<button type="button" id="close-focused-section" aria-label="Takaisin aukeamaan" title="Takaisin aukeamaan">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header></div>' +
    '<div class="focused-content task-content">' + printedTaskImage(book, page, area, label) +
    (answer ? '<details class="task-answer"><summary>Näytä vastaus</summary><div class="task-answer-body">' +
      renderMarkdown(answer.markdown) + '<p class="muted">Opettajan aineiston vastaus. Vertaa omaa vastaustasi tähän; moneen tehtävään käy useampi vastaus.</p></div></details>'
      : '<p class="muted">Tälle tehtävälle ei ole vastausta tässä aineistoversiossa.</p>') +
    '</div>' + navigation + '</div>';
}
export function workbookReaderView(book, pages, {single = false, pageZoom = 100, pageLayout = 'auto', page = pages[0]} = {}) {
  const proof = printedPages(book, 'workbook');
  if (!proof) return '';
  const ranges = workbookChapterRanges(book);
  // A spread shared by two chapters belongs to the chapter of the page that was opened.
  const at = pages.includes(page) ? page : pages[0];
  const current = ranges.find(range => range.from <= at && at <= range.to) || ranges[0];
  const chapter = current?.chapter, marker = chapter ? chapter.label ?? chapter.number : undefined;
  const title = chapter ? (marker !== undefined ? marker + ' · ' : '') + chapter.title : 'Työkirja';
  const accent = Math.max(0, readingOrder(book).findIndex(item => item.id === chapter?.id)) % 4;
  const options = '<div class="reader-options" id="reader-options" role="region" aria-labelledby="reader-options-title" hidden>' +
    '<div class="panel-heading"><h2 id="reader-options-title">Lukuasetukset</h2><button type="button" id="close-options" aria-label="Sulje lukuasetukset">Sulje</button></div>' +
    '<label for="reading-mode">Lukutapa</label><select id="reading-mode">' +
    [['auto','Automaattinen · ikkunan mukaan'],['spread','Aukeama · kaksi sivua'],['single','Yksi sivu']].map(([value,label]) =>
      '<option value="'+value+'"'+(pageLayout===value?' selected':'')+'>'+label+'</option>').join('')+'</select>' +
    '<p class="setting-note">Sivun koko on alapalkissa.</p>' +
    '<div class="reader-option-actions"><button type="button" id="toggle-fullscreen" aria-pressed="false">Koko ruutu</button>' +
    '<a class="button" href="' + e(proof.file + '#page=' + pages[0]) + '" target="_blank" rel="noopener">Avaa sivu PDF:nä<span class="sr-only"> uuteen välilehteen</span></a>' +
    '<a class="button" href="'+bookUrl(book.id)+'">Materiaalit ja lukukohta</a></div></div>';
  const browser = '<p class="contents-eyebrow">Työkirjan kaikki luvut</p><div class="chapter-browser">' + ranges.map(range => {
    const active = range === current, own = range.chapter.label ?? range.chapter.number;
    const cards = [];
    for (let page = range.from; page <= range.to;) {
      const spread = spreadPages(proof.pages, page, single), label = workbookTaskLabel(proof, spread);
      cards.push('<li class="spread-preview-card"><div class="spread-preview printed-preview">' + printedThumbnailHtml(book, spread, 'workbook') + '</div>' +
        '<a class="spread-preview-link" href="' + e(workbookUrl(book.id, spread[0])) + '"' + (spread.includes(pages[0]) ? ' aria-current="location"' : '') + '>' +
        '<span class="preview-position">' + e(pageLabel(spread)) + '</span><strong>' + e(label || 'Sivut ilman tehtäviä') + '</strong></a></li>');
      page = spread.at(-1) + 1;
    }
    return '<details class="preview-chapter" name="reader-chapters"' + (active ? ' open' : '') + '><summary' + (active ? ' aria-current="page"' : '') + '>' +
      (own !== undefined ? '<span class="contents-marker">' + e(own) + '</span> ' : '') + e(range.chapter.title) + '</summary>' +
      '<div class="preview-chapter-body"><a class="chapter-start" href="' + e(workbookUrl(book.id, range.start)) + '">Avaa luvun alku · s. ' + range.start + '</a>' +
      '<ol class="spread-previews printed-previews">' + cards.join('') + '</ol></div></details>';
  }).join('') + '</div>';
  const pageForm = '<form id="workbook-reader-page" class="page-search"><label for="workbook-reader-input">Työkirjan sivu (1–' + proof.pages + ')</label><div>' +
    '<input id="workbook-reader-input" name="sivu" type="number" inputmode="numeric" required min="1" max="' + proof.pages + '"><button type="submit">Avaa</button></div></form>';
  const pagePanel = pages.map(page => {
    const image = proof.pageImages[page - 1];
    return '<section class="workbook-reader-page" aria-labelledby="workbook-panel-page-' + page + '"><h3 id="workbook-panel-page-' + page + '">Sivu ' + page + '</h3>' +
      '<h4>Tekstikirjasta tähän sivuun</h4>' + workbookSourceList(book, proof, page) + lowerHeadings(workbookPageTasks(proof, page, {bookId: book.id}) + drillPageLinks(book, page)) +
      '<details class="workbook-page-text" data-page-text="' + e(image.textFile) + '" data-page-number="' + page + '"><summary>Sivun teksti</summary>' +
      '<div data-page-text-content aria-live="polite"></div></details></section>';
  }).join('');
  const panel = '<aside class="workbook-panel" id="workbook-panel" aria-labelledby="workbook-panel-title" hidden>' +
    '<div class="panel-heading"><h2 id="workbook-panel-title">Tällä aukeamalla</h2><button type="button" id="close-workbook" aria-label="Sulje paneeli">Sulje</button></div>' +
    pagePanel + (chapter ? lowerHeadings(practiceLink(book, chapter)) : '') +
    '<p class="muted">Tekstikirjan linkki avaa saman kohdan tekstikirjan aukeamalla. Selaimen Takaisin palaa työkirjaan. Vastaa paperille tai vihkoon.</p></aside>';
  return '<div class="reader-page reader-workbook" data-page-size="' + (single ? 1 : 2) + '" data-accent="' + accent + '"' + themeStyle(book) + '>' +
    '<h1 class="sr-only" id="workbook-view-title" tabindex="-1">Työkirja ' + e(pageLabel(pages)) + (chapter ? ' – ' + e(chapter.title) : '') + '</h1>' +
    '<header class="reader-controls"><a class="reader-book-link" href="' + e(bookUrl(book.id)) + '" aria-label="' + e('Materiaalit ja kirjan tiedot: ' + book.title) +
    '"><span>' + e('← ' + book.series + ' ' + book.grade + ' · Työkirja') + '</span><strong>' + e(title) + '</strong><span class="reader-book-short" aria-hidden="true">Kirja</span></a>' +
    '<button type="button" id="toggle-contents" aria-controls="chapter-nav" aria-expanded="false">Luvut</button>' +
    '<label class="sr-only" for="section-select">Työkirjan luku</label><select id="section-select" data-workbook-chapters>' +
    ranges.map(range => '<option value="' + range.start + '"' + (range === current ? ' selected' : '') + '>' +
      e(((range.chapter.label ?? range.chapter.number) !== undefined ? (range.chapter.label ?? range.chapter.number) + ' · ' : '') + range.chapter.title) + '</option>').join('') + '</select>' +
    '<div class="reader-position-slot">' + workbookPosition(pages) + '</div>' + pageZoomControl(pageZoom, 'top') +
    '<button type="button" id="toggle-workbook" aria-expanded="false" aria-controls="workbook-panel">Tekstikirja ja tehtävät</button>' +
    '<button type="button" id="toggle-options" aria-label="Lukuasetukset" title="Lukuasetukset" aria-expanded="false" aria-controls="reader-options">' +
    '<span>Lukuasetukset</span><svg class="settings-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M3 6h18M3 18h18"/><circle cx="8" cy="6" r="3" fill="white"/><circle cx="16" cy="18" r="3" fill="white"/></svg></button>' + options + '</header>' +
    '<p class="reader-status sr-only" id="reader-status" role="status"></p>' +
    '<div class="reader-layout"><nav class="chapter-nav" id="chapter-nav" aria-label="Työkirjan sisällysluettelo" hidden>' +
    '<div class="panel-heading"><h2>Sisällysluettelo</h2><button type="button" id="close-contents" aria-label="Sulje sisällysluettelo">Sulje</button>' + pageForm + '</div>' +
    browser + '<details class="contents-group"><summary>Materiaalit</summary><div class="contents-materials">' +
    '<a href="' + e(bookUrl(book.id)) + '">Kirjan materiaalit ja tiedot</a><a href="#/library">Kirjastoon</a></div></details></nav>' + panel +
    '<div class="reader-content" id="reader-content" tabindex="-1"><div class="reader-pages is-spread is-printed" data-zoom="' + e(String(pageZoom)) + '">' +
    printedSpreadHtml(book, pages, {}, 'workbook') + '</div></div></div>' +
    printedNavigation(book, chapter?.id || '', pages, single, 'workbook', pageZoom) +
    '<dialog class="focused-section" id="focused-section" aria-labelledby="focused-title"></dialog></div>';
}
export function focusedSectionView(section, chapter, mode = 'spread', sections = [section], {book,practiceReturn = ''} = {}) {
  const title = section.title === 'Avausaukeama' ? chapter.title : section.title;
  const index = sections.findIndex(item => item.id === section.id);
  const marker = chapter.label ?? chapter.number;
  const chapterLabel = (marker === undefined ? '' : marker + ' · ') + chapter.title;
  const position = index >= 0 && sections.length > 1 ? 'Osio ' + (index+1) + ' / ' + sections.length : '';
  const backLabel = mode === 'chapter' ? 'Takaisin lukuun' : 'Takaisin aukeamaan';
  const navigation = index >= 0 && sections.length > 1 ? '<footer class="focused-navigation" aria-label="Luvun osioiden selaus">' +
    '<button type="button" id="focused-previous" data-focused-section="' + e(sections[index-1]?.id || '') + '" aria-label="Edellinen osio" title="Edellinen osio"' +
    (index === 0 ? ' disabled' : '') + '>' + navigationArrow('previous') + '</button>' +
    '<button type="button" id="focused-next" data-focused-section="' + e(sections[index+1]?.id || '') + '" aria-label="Seuraava osio" title="Seuraava osio"' +
    (index === sections.length-1 ? ' disabled' : '') + '>' + navigationArrow('next') + '</button></footer>' : '';
  return '<div class="focused-shell"><div class="focused-header"><header class="focused-toolbar"><div class="focused-heading"><div class="folio-meta">' +
    (chapter.title !== title ? '<span>' + e(chapterLabel) + '</span>' : '') +
    (position ? '<span class="folio-position">' + e(position) + '</span>' : '') +
    '</div><h2 id="focused-title" tabindex="-1">' + e(title.replace(/\*/g, '')) +
    '</h2></div><button type="button" id="close-focused-section" aria-label="' + backLabel + '" title="' + backLabel + '">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>' +
    practiceReturn + '</div><div class="focused-content">' + renderSection(section, { idPrefix: 'focused-', supportType: chapter.supportType, presentation: chapter.presentation, illustrationSlots: chapter.illustrationSlots, learningVisuals: chapter.learningVisuals, readerEdition: chapter.readerEdition, practiceLinks: practiceSectionLinks(book,chapter,section.id) }) + '</div>' + navigation + '</div>';
}
export function errorView(title, message, retry = false) {
  return '<div class="page error-state"><h1>' + e(title) + '</h1><p role="alert">' + e(message) +
    '</p><div class="actions">' + (retry ? '<button type="button" id="retry">Yritä uudelleen</button>' : '') +
    '<a href="#/library">Takaisin kirjastoon</a></div></div>';
}
