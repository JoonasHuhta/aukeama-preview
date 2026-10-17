import { escapeHtml as e, renderSection } from './content.mjs';
import { libraryUrl, bookUrl, readerUrl, readerPageSize, filterBooks, readingOrder } from './routes.mjs';
import { resolveReadingPosition } from './reading-state.mjs';
import { coverView as cover } from './cover.mjs';
import { searchVocabulary } from './vocabulary-search.mjs';

function chapterLinks(book, current = '', mode = 'spread') {
  const links = entries => '<ol class="chapter-links">' + entries.map(chapter =>
    '<li><a href="' + readerUrl(book.id, chapter.id, '', mode) + '"' +
    (chapter.id === current ? ' aria-current="page"' : '') + '><span class="chapter-index">' +
    (chapter.label !== undefined ? e(chapter.label) : chapter.number !== undefined ? e(chapter.number) + '.' : '') + '</span><span>' + e(chapter.title) + '</span></a></li>').join('') + '</ol>';
  return links([...(book.frontMatter || []), ...book.chapters]) +
    (book.backMatter?.length ? '<h3>Apusivut</h3>' + links(book.backMatter) : '');
}
function breadcrumbs(book, reader = false) {
  return '<nav class="breadcrumbs" aria-label="Sijainti"><ol><li><a href="#/library">Kirjasto</a></li><li>' +
    (reader ? '<a href="' + bookUrl(book.id) + '">' + e(book.title) + '</a>' : '<span aria-current="page">' + e(book.title) + '</span>') +
    '</li>' + (reader ? '<li><span aria-current="page">Tekstikirja</span></li>' : '') + '</ol></nav>';
}
function pageNavigation(sections, index, isSpread, pageSize) {
  if (!isSpread) return '<footer class="reader-navigation chapter-navigation"><div class="chapter-reading-note">' +
    '<strong>Koko luku</strong><span>Vieritä sisältöä</span></div>' +
    '<button type="button" data-mode="spread" id="return-to-spread">Aukeamatilaan</button></footer>';
  const count = isSpread ? Math.ceil(sections.length / pageSize) : 1;
  const position = isSpread ? Math.floor(index / pageSize) + 1 : 1;
  const label = isSpread ? (pageSize === 1 ? 'Sivu' : 'Aukeama') + ' ' + position + ' / ' + count : 'Koko luku';
  const unit = pageSize === 1 ? 'sivu' : 'aukeama';
  const arrow = direction => '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="' +
    (direction === 'previous' ? 'M14 5 7 12 14 19' : 'M10 5 17 12 10 19') + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return '<footer class="reader-navigation"><button type="button" class="page-turn" data-turn="-1" id="previous" aria-label="Edellinen ' + unit + '" title="Edellinen ' + unit + '"' +
    (!isSpread || index === 0 ? ' disabled' : '') + '>' + arrow('previous') + '</button>' +
    '<div class="reading-position"><p>' + label + '</p><progress max="' + count + '" value="' + position +
    '" aria-label="Luvun lukukohta"></progress></div><button type="button" class="page-turn" data-turn="1" id="next" aria-label="Seuraava ' + unit + '" title="Seuraava ' + unit + '"' +
    (!isSpread || index + pageSize >= sections.length ? ' disabled' : '') + '>' + arrow('next') + '</button></footer>';
}
export function resultList(books, query) {
  const result = filterBooks(books, query);
  return '<div class="results-heading"><h2>Kirjat</h2><p class="muted" role="status">' + result.length +
    (result.length === 1 ? ' kirja' : ' kirjaa') + '</p></div>' +
    (result.length ? '<ul class="book-list">' + result.map(book =>
      '<li><article class="book-row">' + cover(book) + '<div class="book-summary"><h3><a href="' + bookUrl(book.id) + '">' + e(book.title) +
      '</a></h3><p class="muted">' + e(book.subjectLabel) + ' · ' + e(book.grade) + '. luokka · ' + e(book.statusLabel) +
      '</p><p>' + e(book.description) + '</p></div><div class="row-actions"><a class="button primary" href="' +
      readerUrl(book.id, readingOrder(book)[0].id) + '" aria-label="Avaa tekstikirja: ' + e(book.title) + '">Avaa tekstikirja</a>' +
      (book.pdf ? '<a class="button" href="' + e(book.pdf.file) + '" download="' + e(book.pdf.filename) +
        '" aria-label="Lataa PDF-esikatselu: ' + e(book.title) + '">PDF-esikatselu</a>' : '') + '<a href="' + bookUrl(book.id) +
      '">Kirjan tiedot</a></div></article></li>').join('') + '</ul>' :
      '<div class="empty-state"><p>Haulla ei löytynyt kirjoja.</p><a href="' + libraryUrl() + '">Tyhjennä haku</a></div>');
}
export function resumeView(books, state = {}) {
  const resume = resolveReadingPosition(books, state.position);
  if (!resume) return '';
  const { book, chapter, sectionId, mode } = resume;
  const marker = chapter.label ?? chapter.number;
  return '<section class="resume-reading" aria-labelledby="resume-title"><div><h2 id="resume-title">Jatka lukemista</h2>' +
    '<h3>' + e(book.title) + '</h3><p>' + (marker !== undefined ? e(marker) + ' · ' : '') + e(chapter.title) +
    ' · Osio ' + (chapter.sectionIds.indexOf(sectionId) + 1) + ' / ' + chapter.sectionIds.length + '</p>' +
    '<p class="muted resume-note">' + (state.persistent === false ?
      'Selain ei salli lukukohdan tallentamista. Kohta säilyy vain tämän välilehden ajan.' :
      'Lukukohta säilyy vain tässä selaimessa. Tyhjennä se yhteiskäyttöisellä koneella.') + '</p></div>' +
    '<div class="resume-actions"><a class="button primary" href="' + readerUrl(book.id, chapter.id, sectionId, mode) +
    '">Jatka tästä</a><button type="button" id="clear-reading-position">Tyhjennä lukukohta</button></div></section>';
}
export function libraryView(books, query, state) {
  return '<div class="page"><h1>Kirjasto</h1><form class="search-form" role="search" id="book-search"><label for="search">Hae kirjoja</label>' +
    '<div class="search-row"><input type="search" id="search" name="q" value="' + e(query) +
    '" placeholder="Kirjan nimi, oppiaine tai luokka"><button class="primary" type="submit">Hae</button></div></form>' +
    '<div id="resume-slot">' + resumeView(books, state) + '</div><p id="library-status" class="muted" role="status"></p>' +
    '<div id="book-results">' + resultList(books, query) + '</div></div>';
}
export function helpView() {
  return '<div class="page help-page"><h1>Ohje</h1><h2>Avaa materiaali</h2>' +
    '<p>Hae kirjaa nimen, oppiaineen tai luokan mukaan. Avaa tekstikirja suoraan kirjastosta. ' +
    'Kirjan tiedoista löydät sisällysluettelon ja materiaalien saatavuuden.</p>' +
    '<p>PDF-esikatselun voi ladata, kun linkki näkyy kirjan kohdalla. Materiaalien saatavuus näkyy kirjan tiedoissa. ' +
    'Käsikirjoitusmerkintä tarkoittaa keskeneräistä oppimateriaalia, ei hyväksyttyä julkaisua.</p>' +
    '<h2>Lue ja selaa</h2><p>Luvut-painike avaa sisällysluettelon. Luvun osan voi valita myös yläpalkista. ' +
    'Edellinen ja Seuraava selaavat saman luvun sivuja. Tietokoneella voit käyttää myös nuolinäppäimiä, ' +
    'puhelimella vaakapyyhkäisyä. Pitkää sivua vieritetään sivun sisällä.</p>' +
    '<p>Asetuksista voit vaihtaa aukeaman ja koko luvun välillä, suurentaa tekstiä sekä avata sanaston, ' +
    'koko ruudun tilan ja kirjan Infon. Leveällä näytöllä nämä toiminnot näkyvät suoraan yläpalkissa.</p>' +
    '<p>Avaa osio näyttää yhden sisältöosan erillisessä näkymässä. Voit avata sen myös otsikosta tai sivun tyhjästä reunasta. ' +
    'Tekstiä voi valita normaalisti. Palaa Takaisin-painikkeesta tai Esc-näppäimellä; lukukohta ja vieritys säilyvät.</p>' +
    '<h2>Lukukohta ja selaimen tallennus</h2><p>Viimeksi avattu lukukohta ja tekstikoko tallennetaan vain ' +
    'tähän selaimeen, jos selain sallii tallennuksen. Tietoja ei lähetetä palvelimelle eikä synkronoida ' +
    'eri laitteisiin. Oppilaan vastauksia tai henkilötietoja ei tallenneta tähän lukukohtatoimintoon.</p>' +
    '<p>Jatka tästä avaa viimeksi käytetyn kirjan, luvun ja sisältöosan samalla lukutavalla. ' +
    'Jos kirja, painos tai osio ei enää löydy, jatkamispainiketta ei näytetä.</p>' +
    '<p>Yhteiskäyttöisellä koneella valitse kirjastosta Tyhjennä lukukohta. Tämä poistaa vain lukukohdan, ' +
    'ei tekstikoon asetusta. Jos tallennus on estetty, lukija toimii silti.</p>' +
    '<a class="button" href="#/library">Takaisin kirjastoon</a></div>';
}
export function bookView(book) {
  return '<div class="page">' + breadcrumbs(book) + '<div class="book-heading">' + cover(book) +
    '<div><h1>' + e(book.title) + '</h1><p class="muted">' + e(book.subjectLabel) + ' · ' + e(book.grade) +
    '. luokka · ' + e(book.statusLabel) + '</p><p>' + e(book.description) +
    '</p><div class="actions"><a class="button primary" href="' + readerUrl(book.id, readingOrder(book)[0].id) +
    '">Avaa kirja</a><a href="#book-contents">Sisällysluettelo</a>' +
    (book.pdf ? '<a class="button" href="' + e(book.pdf.file) + '" download="' + e(book.pdf.filename) + '">Lataa PDF-esikatselu</a>' : '') + '</div></div></div>' +
    '<div class="book-body"><div><h2>Materiaalit</h2><ul class="material-list">' + book.materials.map(material =>
      '<li><div><strong>' + e(material.title) + '</strong><small>' + e(material.statusLabel) +
      '</small></div>' + (material.type === 'reader' && ['draft', 'published'].includes(material.status) ?
        '<a class="button" href="' + readerUrl(book.id, readingOrder(book)[0].id) + '">Avaa tekstikirja</a>' : '') +
      '</li>').join('') + '</ul><section id="book-contents" tabindex="-1"><h2>Sisällysluettelo</h2>' + chapterLinks(book) +
    '</section></div><aside aria-label="Kirjan tiedot"><h2>Tiedot</h2><dl class="metadata">' +
    '<div><dt>Versio</dt><dd>' + e(book.version) + '</dd></div><div><dt>Opetussuunnitelma</dt><dd>' + e(book.curriculum) +
    '</dd></div><div><dt>' + (book.status === 'published' ? 'Lisenssi' : 'Lisenssisuunnitelma') + '</dt><dd>' + e(book.license) + '</dd></div></dl>' +
    (['draft', 'editorial-pass-1'].includes(book.status) ? '<div class="draft-note"><p>Käsikirjoitus. Kieli, kuvitus ja äänitteet ovat vielä viimeistelemättä.</p></div>' : '') + '</aside></div></div>';
}
export function vocabularyResultsView(book, chapter, query = '', scope = 'chapter') {
  const entries = searchVocabulary(book, chapter, query, scope);
  const vocabulary = chapter.vocabulary || book.chapters.find(item => item.vocabulary)?.vocabulary;
  return '<p role="status" id="vocabulary-count">' + entries.length + ' hakutulosta</p>' +
    (entries.length ? '<dl class="vocabulary-list">' + entries.map(entry =>
      '<div><dt lang="' + e(vocabulary.sourceLanguage) + '">' + e(entry.form) + '</dt><dd lang="' +
      e(vocabulary.targetLanguage) + '">' + entry.meanings.map(e).join('; ') + '</dd><dd class="vocabulary-references">' +
      entry.references.map(ref => scope === 'book' ? '<a href="' + readerUrl(book.id,ref.chapterId) + '">' +
        e(ref.chapterTitle) + ' — ' + e(ref.groupTitle) + '</a>' : '<span>' + e(ref.groupTitle) + '</span>').join('') +
      '</dd></div>').join('') + '</dl>' : '<p>Haulla ei löytynyt sanoja. Kokeile lyhyempää sanaa tai vaihda haku koko kirjaan.</p>');
}
export function vocabularyView(chapter, book = {chapters:[chapter]}) {
  if (!chapter.vocabulary && !book.chapters.some(item => item.vocabulary)) return '';
  return '<aside class="vocabulary-panel" id="vocabulary-panel" aria-labelledby="vocabulary-title" hidden>' +
    '<div class="panel-heading"><h2 id="vocabulary-title">Sanasto</h2><button type="button" id="close-vocabulary" aria-label="Sulje sanasto">Sulje</button></div>' +
    '<div class="vocabulary-search"><label for="vocabulary-query">Hae sanaa tai merkitystä</label>' +
    '<input type="search" id="vocabulary-query" placeholder="Ruotsiksi tai suomeksi" autocomplete="off">' +
    '<label for="vocabulary-scope">Hakualue</label><select id="vocabulary-scope"><option value="chapter"' + (!chapter.vocabulary ? ' disabled' : '') + '>Tämä luku</option>' +
    '<option value="book"' + (!chapter.vocabulary ? ' selected' : '') + '>Koko kirja</option></select></div>' +
    '<p class="vocabulary-intro" id="vocabulary-note">' + e(chapter.vocabulary?.note || 'Sanat ja ilmaukset kirjan luvuista.') + '</p>' +
    '<div id="vocabulary-results">' + vocabularyResultsView(book,chapter,'',chapter.vocabulary ? 'chapter' : 'book') + '</div></aside>';
}
export function readerInfoView(book, chapter) {
  return '<aside class="reader-info-panel" id="reader-info" aria-labelledby="reader-info-title" hidden>' +
    '<div class="panel-heading"><h2 id="reader-info-title">Ohjeet ja kirjan tiedot</h2>' +
    '<button type="button" id="close-info" aria-label="Sulje info">Sulje</button></div>' +
    '<h3>Lukeminen</h3><ul><li>Luvut avaa sisällysluettelon ja luvunvaihdon. Luvun osa siirtää suoraan valittuun kohtaan.</li>' +
    '<li>Aukeama näyttää kaksi sisältösivua, kapealla näytöllä yhden. Pitkää sivua vieritetään sen sisällä. Koko luku näyttää kaikki osat peräkkäin: vieritä sisältöä ja palaa sivuselaukseen alapalkin Aukeamatilaan-painikkeesta.</li>' +
    '<li>A− ja A+ muuttavat tekstikokoa välillä 100–150 %. Asetukset kokoaa ohjaimet pienemmällä näytöllä. Koko ruutu laajentaa lukutilan; poistu sen painikkeesta tai Esc-näppäimellä.</li>' +
    (book.chapters.some(item => item.vocabulary) ? '<li>Sanastosta voit hakea ruotsin sanoilla tai suomenkielisillä merkityksillä. Valitse Tämä luku tai Koko kirja. Sanan yhteydessä näkyy sen sanastorooli; koko kirjan haku ei muuta kaikkia sanoja opeteltaviksi. Sulje tai Esc palauttaa lukemiseen.</li>' : '') +
    (book.pdf ? '<li>PDF lataa koko tekstikirjan tämänhetkisen esikatselun.</li>' : '') +
    '<li>Edellinen ja Seuraava selaavat vain nykyisen luvun sivuja. Myös nuolinäppäimet ja vaakapyyhkäisy selaavat; kirjoittamista ja tekstin valintaa ne eivät keskeytä.</li><li>Info suljetaan Sulje-painikkeella tai Esc-näppäimellä. Lukukohta ei muutu.</li></ul>' +
    '<h3>Nykyinen aineisto</h3><p>' + e(book.title) + ' · ' + e(book.statusLabel) + '</p>' +
    '<p>Versio: ' + e(book.version) + '</p><ul>' + book.materials.map(material =>
      '<li>' + e(material.title) + ' — ' + e(material.statusLabel) + '</li>').join('') + '</ul>' +
    '<p><a href="' + bookUrl(book.id) + '">Kirjan tiedot ja lisenssi' + (book.status === 'published' ? '' : 'suunnitelma') + '</a></p></aside>';
}
export function readerView(book, chapter, sections, index, mode, fontSize, selectedSection = sections[index].id, pageSize = 2) {
  pageSize = readerPageSize(chapter, pageSize === 1);
  const isSpread = mode === 'spread';
  const visible = isSpread ? sections.slice(index, index + pageSize) : sections;
  const entries = readingOrder(book);
  const chapterIndex = entries.findIndex(item => item.id === chapter.id);
  const openingVisible = visible.some(section => section.id === sections[0].id);
  const marker = chapter.label ?? chapter.number;
  const options = '<div class="reader-options" id="reader-options">' +
    '<label class="sr-only" for="reading-mode">Lukutapa</label><select id="reading-mode"><option value="spread"' + (isSpread ? ' selected' : '') +
    '>Aukeama</option><option value="chapter"' + (!isSpread ? ' selected' : '') + '>Koko luku</option></select>' +
    '<div class="control-group" role="group" aria-label="Tekstikoko"><button type="button" data-font="-1" aria-label="Pienennä tekstiä"' +
    (fontSize === 16 ? ' disabled' : '') + '>A−</button><output id="font-size-label" aria-live="polite">' + Math.round(fontSize / 16 * 100) +
    '%</output><button type="button" data-font="1" aria-label="Suurenna tekstiä"' + (fontSize === 24 ? ' disabled' : '') + '>A+</button></div>' +
    (book.chapters.some(item => item.vocabulary) ? '<button type="button" id="toggle-vocabulary" aria-expanded="false" aria-controls="vocabulary-panel">Sanasto</button>' : '') +
    '<button type="button" id="toggle-fullscreen" aria-pressed="false">Koko ruutu</button>' +
    '<button type="button" id="toggle-info" aria-expanded="false" aria-controls="reader-info">Info</button>' +
    (book.pdf ? '<a class="button" href="' + e(book.pdf.file) + '" download="' + e(book.pdf.filename) + '">PDF</a>' : '') + '</div>';
  return '<div class="reader-page" data-page-size="' + pageSize + '">' +
    (!openingVisible ? '<h1 class="sr-only">' + (marker !== undefined ? e(marker) + (chapter.label ? ' – ' : '. ') : '') + e(chapter.title) + '</h1>' : '') +
    '<header class="reader-controls"><a class="reader-book-link" href="' + bookUrl(book.id) + '" aria-label="Kirjan tiedot: ' + e(book.title) +
    '"><span>' + e(book.series) + ' ' + e(book.grade) + '</span><strong>' + (marker !== undefined ? e(marker) + ' · ' : '') + e(chapter.title) + '</strong></a>' +
    '<button type="button" id="toggle-contents" aria-controls="chapter-nav" aria-expanded="false">Luvut</button>' +
    '<label class="sr-only" for="section-select">Luvun osa</label><select id="section-select">' +
    sections.map(section => '<option value="' + e(section.id) + '"' + (section.id === selectedSection ? ' selected' : '') + '>' +
      e(section.title.replace(/[*]/g, '').replace(/^Avausaukeama$/, 'Aloitus')) + '</option>').join('') + '</select>' +
    '<button type="button" id="toggle-options" aria-expanded="false" aria-controls="reader-options">Asetukset</button>' + options + '</header>' +
    '<p class="reader-status sr-only" id="reader-status" role="status"></p>' +
    '<div class="reader-layout"><nav class="chapter-nav" id="chapter-nav" aria-label="Kirjan sisällysluettelo" hidden>' +
    '<div class="panel-heading"><h2>Sisällysluettelo</h2><button type="button" id="close-contents" aria-label="Sulje sisällysluettelo">Sulje</button></div>' +
    '<div class="chapter-switch">' +
    (entries[chapterIndex - 1] ? '<a class="button" href="' + readerUrl(book.id, entries[chapterIndex - 1].id, '', mode) + '">' +
      (entries[chapterIndex - 1].kind === 'back-matter' ? 'Edellinen apusivu' : 'Edellinen luku') + '</a>' : '') +
    (entries[chapterIndex + 1] ? '<a class="button" href="' + readerUrl(book.id, entries[chapterIndex + 1].id, '', mode) + '">' +
      (chapter.kind === 'front-matter' ? 'Aloita lukeminen' : entries[chapterIndex + 1].kind === 'back-matter' ? 'Seuraava apusivu' : 'Seuraava luku') + '</a>' : '') + '</div>' +
    chapterLinks(book, chapter.id, mode) + '</nav>' +
    readerInfoView(book, chapter) + vocabularyView(chapter, book) +
    '<div class="reader-content" id="reader-content" tabindex="-1"><div class="reader-pages ' + (isSpread ? 'is-spread' : 'is-chapter') + (chapter.supportType === 'contents' ? ' is-contents' : '') + '">' +
    visible.map(section => renderSection(section, {
      chapter: section.id === sections[0].id ? chapter : undefined,
      supportType: chapter.supportType,
      focusable: chapter.supportType !== 'contents',
      pageLabel: 'Sisältösivu ' + (sections.indexOf(section) + 1) + ': ' + section.title
    })).join('') + '</div></div></div>' +
    pageNavigation(sections, index, isSpread, pageSize) +
    '<dialog class="focused-section" id="focused-section" aria-labelledby="focused-title"></dialog></div>';
}
export function focusedSectionView(section, chapter, mode = 'spread') {
  const title = section.title === 'Avausaukeama' ? chapter.title : section.title;
  return '<div class="focused-shell"><header class="focused-toolbar"><h2 id="focused-title">' + e(title.replace(/\*/g, '')) +
    '</h2><button type="button" id="close-focused-section">' + (mode === 'chapter' ? 'Takaisin lukuun' : 'Takaisin aukeamaan') + '</button></header>' +
    '<div class="focused-content">' + renderSection(section, { idPrefix: 'focused-', supportType: chapter.supportType }) + '</div></div>';
}
export function errorView(title, message, retry = false) {
  return '<div class="page error-state"><h1>' + e(title) + '</h1><p role="alert">' + e(message) +
    '</p><div class="actions">' + (retry ? '<button type="button" id="retry">Yritä uudelleen</button>' : '') +
    '<a href="#/library">Takaisin kirjastoon</a></div></div>';
}
