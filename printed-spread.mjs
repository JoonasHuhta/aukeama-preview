import { escapeHtml as e } from './html.mjs';
import { readingOrder, textbookSectionPages, textbookPageTarget, readerUrl, bookUrl, workbookUrl } from './routes.mjs';

/*
 * The reader's Aukeama view as the printed textbook: a spread is a printed spread
 * (even page left, odd page right) and the only page numbers are the printed ones,
 * on the page images themselves. Interactive text lives in the text view (Koko luku).
 */
export function printedPages(book, kind = 'textbook') {
  const proof = book?.localProofs?.[kind];
  return Array.isArray(proof?.pageImages) && proof.pageImages.length === proof.pages ? proof : null;
}
export const hasPrintedSpreads = book => !!printedPages(book);

/** Pages shown together: page 1 alone, then 2–3, 4–5 …; one page on narrow screens. */
export function spreadPages(total, page, single = false) {
  const at = Math.min(Math.max(1, Math.trunc(page) || 1), total);
  if (single) return [at];
  if (at === 1) return [1];
  const left = at % 2 === 0 ? at : at - 1;
  return left + 1 <= total ? [left, left + 1] : [left];
}
/** The first page of the next or previous spread, or null at either end. */
export function turnedPage(total, pages, direction, single = false) {
  const page = direction > 0 ? pages.at(-1) + 1 : pages[0] - 1;
  if (page < 1 || page > total) return null;
  return spreadPages(total, page, single)[0];
}
export function printedSpreadUrl(bookId, chapterId, page) {
  return bookUrl(bookId) + '/read/' + encodeURIComponent(chapterId) + '?sivu=' + page;
}
/** One numbered task of the printed workbook, shown enlarged over its page. */
export function workbookTaskUrl(bookId, page, number) {
  return workbookUrl(bookId, page) + '&tehtava=' + encodeURIComponent(number);
}
export function workbookTaskAreas(book, page) {
  const areas = printedPages(book, 'workbook')?.taskRegions?.[page];
  return Array.isArray(areas) ? areas : [];
}

/** First and last printed page of each reader part, as the printed book lays them out. */
export function partPageRanges(book) {
  const proof = printedPages(book) || book?.localProofs?.textbook;
  const rows = textbookSectionPages(book);
  const starts = readingOrder(book).map(part => {
    const own = rows.filter(row => row.chapter === part.id);
    return own.length ? { id: part.id, from: Math.min(...own.map(row => row.page)) } : null;
  }).filter(Boolean).sort((a, b) => a.from - b.from);
  return starts.map((part, index) => ({ ...part, to: (starts[index + 1]?.from ?? (proof?.pages || part.from) + 1) - 1 }));
}
export function partOfPage(book, page) {
  return partPageRanges(book).find(part => part.from <= page && page <= part.to)?.id || textbookPageTarget(book, page)?.chapterId || null;
}
/** The printed page a reader section starts on, or the part's first page. */
export function sectionPage(book, chapterId, sectionId = '') {
  const rows = textbookSectionPages(book).filter(row => row.chapter === chapterId);
  const row = rows.find(item => item.section === sectionId) || rows[0];
  return row ? row.page : null;
}
/** Reader sections printed on these pages, in reading order. */
export function sectionsOnPages(book, pages) {
  const from = Math.min(...pages), to = Math.max(...pages);
  return textbookSectionPages(book).filter(row => row.page <= to && row.endPage >= from);
}
/** Spreads that show at least one page of a part, for the chapter thumbnails. */
export function partSpreads(book, partId, single = false) {
  const proof = printedPages(book), range = partPageRanges(book).find(part => part.id === partId);
  if (!proof || !range) return [];
  const spreads = [];
  for (let page = range.from; page <= range.to;) {
    const pages = spreadPages(proof.pages, page, single);
    spreads.push(pages);
    page = pages.at(-1) + 1;
  }
  return spreads;
}
export function pageLabel(pages) {
  return 's. ' + (pages.length > 1 ? pages[0] + '–' + pages.at(-1) : pages[0]);
}

const bookName = kind => kind === 'workbook' ? 'Työkirjan' : 'Tekstikirjan';
function image(proof, page, side, lazy = false, kind = 'textbook') {
  const item = proof.pageImages[page - 1];
  return '<img class="printed-page-image" src="' + e(item.file) + '" width="' + item.width + '" height="' + item.height + '"' +
    (lazy ? ' loading="lazy"' : '') + ' decoding="async" alt="' + (lazy ? '' : bookName(kind) + ' sivu ' + page) + '"' +
    (side ? ' data-side="' + side + '"' : '') + '>';
}

/**
 * Links over the printed page: each area where a reader section is printed opens
 * the same section as text. Pages without a reliable match get no links.
 */
export function printedRegionsHtml(book, page, titles = {}, kind = 'textbook') {
  const proof = printedPages(book, kind);
  const regions = kind === 'textbook' && Array.isArray(proof?.pageRegions?.[page]) ? proof.pageRegions[page] : [];
  const tasks = kind === 'workbook' ? workbookTaskAreas(book, page) : [];
  const links = Array.isArray(proof?.pageLinks?.[page]) ? proof.pageLinks[page] : [];
  if (!regions.length && !links.length && !tasks.length) return '';
  // Each printed task is its own area: pointing at it shows the area, opening it enlarges the task.
  const taskAreas = tasks.map(area => {
    const label = 'Avaa tehtävä ' + area.number + ' suurempana (s. ' + page + ')';
    return '<a class="printed-region printed-task" href="' + e(workbookTaskUrl(book.id, page, area.number)) + '" aria-label="' + e(label) + '">' +
      '<title>' + e(label) + '</title><rect x="' + Math.round(area.left * 1000) + '" y="' + Math.round(area.top * 1000) +
      '" width="' + Math.max(1, Math.round((area.right - area.left) * 1000)) + '" height="' + Math.max(1, Math.round((area.bottom - area.top) * 1000)) + '" rx="6"/></a>';
  }).join('');
  // The printed page's own page references ("s. 84") stay links, on top of the section areas.
  const pageLinks = links.map(link => {
    const label = 'Siirry sivulle ' + link.page;
    const href = kind === 'workbook' ? workbookUrl(book.id, link.page) : printedSpreadUrl(book.id, partOfPage(book, link.page) || readingOrder(book)[0]?.id, link.page);
    return '<a class="printed-page-link" href="' + e(href) + '" aria-label="' + e(label) + '"><title>' + e(label) + '</title>' +
      '<rect x="' + Math.round(link.left * 1000) + '" y="' + Math.round(link.top * 1000) + '" width="' + Math.max(1, Math.round(link.width * 1000)) +
      '" height="' + Math.max(1, Math.round(link.height * 1000)) + '"/></a>';
  }).join('');
  return '<svg class="printed-regions" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">' + taskAreas + regions.map(region => {
    const label = 'Lue tekstinä: ' + (titles[region.chapter + '/' + region.section] || 'tämä kohta') + ' (s. ' + page + ')';
    const top = Math.round(region.top * 1000), bottom = Math.round(region.bottom * 1000);
    return '<a class="printed-region" href="' + e(readerUrl(book.id, region.chapter, region.section, 'chapter')) + '" aria-label="' + e(label) + '">' +
      '<title>' + e(label) + '</title><rect x="30" y="' + Math.max(top, 8) + '" width="940" height="' + Math.max(1, Math.min(bottom, 992) - Math.max(top, 8)) + '" rx="6"/></a>';
  }).join('') + pageLinks + '</svg>';
}

/** The printed spread itself; the page numbers are those printed on the pages. */
export function printedSpreadHtml(book, pages, titles = {}, kind = 'textbook') {
  const proof = printedPages(book, kind);
  const sides = pages.length === 1 ? (pages[0] % 2 ? ['right'] : ['left']) : ['left', 'right'];
  return '<div class="printed-spread' + (pages.length === 1 ? ' is-single' : '') + '" role="group" aria-label="' + bookName(kind) + ' ' + e(pageLabel(pages)) + '">' +
    pages.map((page, index) => '<figure class="printed-page" data-page="' + page + '" data-side="' + sides[index] + '">' + image(proof, page, '', false, kind) +
      printedRegionsHtml(book, page, titles, kind) + '</figure>').join('') + '</div>';
}
/** Plain section titles of a loaded chapter for link names. */
export function sectionTitles(chapter, sections) {
  return Object.fromEntries(sections.map(section => [chapter.id + '/' + section.id,
    String(section.title).replace(/[*_`]/g, '').replace(/^Avausaukeama$/, 'Aloitus')]));
}
/** Small copies for the chapter browser: the very spread the link opens. */
export function printedThumbnailHtml(book, pages, kind = 'textbook') {
  const proof = printedPages(book, kind);
  return '<div class="printed-thumbnail' + (pages.length === 1 ? ' is-single' : '') + '" aria-hidden="true">' +
    pages.map(page => image(proof, page, '', true, kind)).join('') + '</div>';
}

/** Text links for the sections on this spread: the interactive text view of the same content. */
export function printedTextLinks(book, pages, titles = {}) {
  const rows = sectionsOnPages(book, pages);
  if (!rows.length) return '';
  return '<ul class="printed-text-links">' + rows.map(row => '<li><a href="' + e(readerUrl(book.id, row.chapter, row.section, 'chapter')) + '">' +
    e(titles[row.chapter + '/' + row.section] || 'Teksti') + '</a></li>').join('') + '</ul>';
}

export function printedNavigation(book, chapterId, pages, single = false, kind = 'textbook') {
  const proof = printedPages(book, kind);
  const previous = turnedPage(proof.pages, pages, -1, single), next = turnedPage(proof.pages, pages, 1, single);
  const unit = single ? 'sivu' : 'aukeama';
  const arrow = (direction, target) => '<button type="button" class="page-turn" data-turn="' + direction + '" id="' + (direction < 0 ? 'previous' : 'next') +
    '" aria-label="' + (direction < 0 ? 'Edellinen ' : 'Seuraava ') + unit + '" title="' + (direction < 0 ? 'Edellinen ' : 'Seuraava ') + unit + '"' +
    (target ? '' : ' disabled') + '><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' +
    (direction < 0 ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6') + '"/></svg></button>';
  return '<footer class="reader-navigation printed-navigation">' + arrow(-1, previous) +
    '<div class="reading-position">' + (kind === 'workbook' ? workbookPosition(pages) : printedPosition(book, chapterId, pages)) + '</div>' +
    arrow(1, next) + '</footer>';
}
/** "Työkirja s. 12–13": the same top-bar position as in the textbook. */
export function workbookPosition(pages) {
  return '<p><span class="printed-position">Työkirja ' + e(pageLabel(pages)) + '</span></p>';
}
/** "s. 18–19 · Lue tekstinä": the printed pages and the way to the same content as text. */
export function printedPosition(book, chapterId, pages) {
  const rows = sectionsOnPages(book, pages), first = rows.find(row => row.chapter === chapterId) || rows[0];
  const text = first ? '<a class="printed-text-link" href="' + e(readerUrl(book.id, first.chapter, first.section, 'chapter')) + '">Lue tekstinä</a>' : '';
  return '<p><span class="printed-position">' + e(pageLabel(pages)) + '</span>' +
    (text ? '<span class="paper-separator" aria-hidden="true"> · </span>' + text : '') + '</p>';
}

/** The printed task alone, cropped from its page image and scaled to the view. */
export function printedTaskImage(book, page, area, label) {
  const image = printedPages(book, 'workbook')?.pageImages?.[page - 1];
  if (!image) return '';
  const box = [area.left * image.width, area.top * image.height,
    (area.right - area.left) * image.width, (area.bottom - area.top) * image.height].map(value => Math.round(value));
  return '<svg class="printed-task-image" viewBox="' + box.join(' ') + '" preserveAspectRatio="xMidYMin meet" role="img" aria-label="' + e(label) + '">' +
    '<image href="' + e(image.file) + '" x="0" y="0" width="' + image.width + '" height="' + image.height + '"/></svg>';
}

/** Page size control of the printed views: steps, and fitting the width of the window. */
export const PAGE_ZOOMS = [100, 125, 150, 175, 200];
export function zoomLabel(zoom) { return zoom === 'fit' ? 'Leveys' : zoom + ' %'; }
export function zoomStep(zoom, direction) {
  // Fitting the width is its own setting; a step from it lands on the nearest size.
  const base = PAGE_ZOOMS.indexOf(zoom === 'fit' ? 100 : zoom);
  const at = zoom === 'fit' ? (direction > 0 ? base + 1 : base) : base + direction;
  return at < 0 || at >= PAGE_ZOOMS.length ? null : PAGE_ZOOMS[at];
}
/** Always within reach over the page itself, as a reader of a printed page expects. */
export function pageZoomControl(zoom) {
  return '<div class="page-zoom" role="group" aria-label="Sivun koko">' +
    '<button type="button" data-zoom="-1" aria-label="Pienennä sivua" title="Pienennä sivua"' + (zoomStep(zoom, -1) === null ? ' disabled' : '') + '>−</button>' +
    '<output class="page-zoom-label" aria-live="polite">' + e(zoomLabel(zoom)) + '</output>' +
    '<button type="button" data-zoom="1" aria-label="Suurenna sivua" title="Suurenna sivua"' + (zoomStep(zoom, 1) === null ? ' disabled' : '') + '>+</button>' +
    '<button type="button" data-zoom="fit" class="page-zoom-fit" aria-pressed="' + (zoom === 'fit') + '">Sovita leveyteen</button></div>';
}
