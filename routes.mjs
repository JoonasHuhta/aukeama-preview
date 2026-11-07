export function libraryUrl(query = '') {
  return '#/library' + (query ? '?q=' + encodeURIComponent(query) : '');
}
export function bookUrl(id, workbookPage, workbookHash) {
  const path = '#/books/' + encodeURIComponent(id);
  if (!workbookPage) return path;
  const query = new URLSearchParams({sivu:String(workbookPage)});
  if (workbookHash) query.set('vedos', workbookHash);
  return path + '?' + query;
}
export function examUrl(bookId) { return bookUrl(bookId)+'/exam'; }
export function teacherGuideUrl(bookId, guideId) { return bookUrl(bookId)+'/opettaja/'+encodeURIComponent(guideId); }
export function workbookUrl(bookId, page) { return bookUrl(bookId)+'/workbook'+(page ? '?sivu='+page : ''); }
export function textbookUrl(bookId, page) { return bookUrl(bookId)+'/textbook'+(page ? '?sivu='+page : ''); }
export function drillUrl(bookId, drillId, setId = '') {
  return bookUrl(bookId)+'/drill/'+encodeURIComponent(drillId)+(setId ? '?sarja='+encodeURIComponent(setId) : '');
}
export function practiceUrl(bookId,activityId,step='') {
  return bookUrl(bookId)+'/practice/'+encodeURIComponent(activityId)+(step?'?step='+encodeURIComponent(step):'');
}
export function readingOrder(book) {
  return [...(book.frontMatter || []), ...book.chapters, ...(book.backMatter || [])];
}
export function resolveReaderTarget(book, chapterId, section = '') {
  const redirect = section && book.sectionRedirects?.find(item => item.chapterId === chapterId && item.sectionId === section);
  const target = redirect && readingOrder(book).find(chapter => chapter.id === redirect.targetChapterId);
  return target?.sectionIds?.includes(redirect.targetSectionId)
    ? {chapterId: target.id, section: redirect.targetSectionId}
    : {chapterId, section};
}
export function readerUrl(bookId, chapterId, section = '', mode = 'spread', point = '', part = 1) {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (mode === 'chapter') params.set('view', mode);
  if (point && section) params.set('point', point);
  // A long section continues on later pages; "osa" names the continuation page.
  if (section && mode !== 'chapter' && Number.isInteger(part) && part > 1) params.set('osa', String(part));
  return bookUrl(bookId) + '/read/' + encodeURIComponent(chapterId) + (params.size ? '?' + params : '');
}
export function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  if (!path || path === '/' || path === '/library' || path === 'main') return { view: 'library', query: params.get('q') || '' };
  if (path === '/help') return { view: 'help' };
  try {
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'books' && parts.length === 2) {
      const page = params.get('sivu');
      const hash = params.get('vedos');
      if (page !== null && (params.getAll('sivu').length !== 1 || !/^[1-9]\d{0,5}$/.test(page))) return {view:'not-found'};
      if (hash !== null && (!page || params.getAll('vedos').length !== 1 || !/^[a-f0-9]{64}$/.test(hash))) return {view:'not-found'};
      return {view:'book', bookId:parts[1], ...(page ? {workbookPage:Number(page)} : {}), ...(hash ? {workbookHash:hash} : {})};
    }
    if (parts[0] === 'books' && parts[2] === 'exam' && parts.length === 3 && !params.size) return {view:'exam',bookId:parts[1]};
    if (parts[0] === 'books' && parts[2] === 'opettaja' && parts.length === 4 && !params.size && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[3]))
      return {view:'teacher-guide', bookId:parts[1], guideId:parts[3]};
    if (parts[0] === 'books' && ['workbook', 'textbook'].includes(parts[2]) && parts.length === 3) {
      const page = params.get('sivu'), task = params.get('tehtava');
      // A task is always read on its own page, so it is named only beside one.
      if ([...params.keys()].some(key => !['sivu', 'tehtava'].includes(key)) || params.getAll('sivu').length > 1 ||
          params.getAll('tehtava').length > 1 || (page !== null && !/^[1-9]\d{0,5}$/.test(page)) ||
          (task !== null && (parts[2] !== 'workbook' || page === null || !/^[1-9]\d?$/.test(task)))) return {view:'not-found'};
      return {view:parts[2], bookId:parts[1], ...(page ? {page:Number(page)} : {}), ...(task ? {task} : {})};
    }
    if (parts[0] === 'books' && parts[2] === 'drill' && parts.length === 4) {
      const set = params.get('sarja');
      if ([...params.keys()].some(key => key !== 'sarja') || params.getAll('sarja').length > 1 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[3]) || (set !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(set))) return {view:'not-found'};
      return {view:'drill', bookId:parts[1], drillId:parts[3], ...(set ? {setId:set} : {})};
    }
    if (parts[0] === 'books' && parts[2] === 'practice' && parts.length === 4) {
      const step=params.get('step')||'';
      if([...params.keys()].some(k=>k!=='step')||params.getAll('step').length>1||
        (step&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step)))return {view:'not-found'};
      return {view:'practice',bookId:parts[1],activityId:parts[3],step};
    }
    if (parts[0] === 'books' && parts[2] === 'read' && parts.length === 4) {
      const point = params.get('point');
      if (point !== null && (!params.get('section') || params.getAll('point').length !== 1 ||
          point.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(point))) return {view:'not-found'};
      const part = params.get('osa');
      if (part !== null && (!params.get('section') || params.getAll('osa').length !== 1 || !/^[2-9]$|^[1-9]\d$/.test(part))) return {view:'not-found'};
      // A printed page (sivu) names a printed spread; it never mixes with a section address.
      const page = params.get('sivu');
      if (page !== null && (params.getAll('sivu').length !== 1 || !/^[1-9]\d{0,2}$/.test(page) ||
          ['section', 'point', 'osa', 'view'].some(key => params.has(key)))) return {view:'not-found'};
      return { view: 'reader', bookId: parts[1], chapterId: parts[3], section: params.get('section') || '',
        mode: params.get('view') === 'chapter' ? 'chapter' : 'spread', ...(point ? {point} : {}), ...(part ? {part:Number(part)} : {}),
        ...(page ? {page:Number(page)} : {}) };
    }
  } catch { /* Malformed addresses are a normal not-found state. */ }
  return { view: 'not-found' };
}
// Authored references without a view choice inherit the reader's current mode.
// Explicit modes, other books and non-reader links retain normal browser behavior.
export function readerReferenceUrl(href, book, mode) {
  if (typeof href !== 'string' || !href.startsWith('#/books/')) return;
  const params = new URLSearchParams(href.split('?')[1] || '');
  if ([...params.keys()].some(key => !['section','point'].includes(key)) ||
      [...params.keys()].some(key => params.getAll(key).length !== 1)) return;
  const route = parseRoute(href);
  if (route.view !== 'reader' || route.bookId !== book.id) return;
  const target = resolveReaderTarget(book, route.chapterId, route.section);
  const chapter = readingOrder(book).find(item => item.id === target.chapterId);
  if (!chapter || (target.section && !chapter.sectionIds?.includes(target.section))) return;
  if (route.point && !chapter.sectionPoints?.[target.section]?.includes(route.point)) return;
  return readerUrl(book.id, target.chapterId, target.section, mode, route.point);
}
export function filterBooks(books, query) {
  const terms = query.trim().toLocaleLowerCase('fi').split(/\s+/).filter(Boolean);
  return books.filter(book => {
    const text = [book.title, book.description, book.subjectLabel, book.grade + '. luokka', book.statusLabel]
      .join(' ').toLocaleLowerCase('fi');
    return terms.every(term => text.includes(term));
  });
}
export function findSectionIndex(sections, id, mode, pageSize = 2) {
  const index = Math.max(0, sections.findIndex(section => section.id === id));
  return mode === 'spread' ? index - index % pageSize : index;
}
export function readerPageSize(chapter, singlePage = false, layout = 'auto', printed = false) {
  // The wide HTML contents table needs one panel. Printed contents are ordinary
  // facing pages and must follow the same layout preference as the rest of the book.
  if ((!printed && chapter?.supportType === 'contents') || layout === 'single') return 1;
  return layout === 'spread' ? 2 : singlePage ? 1 : 2;
}
// Printed textbook pages of the current local proof. The web spread and the paper
// page are different units, so only an attached, matching proof provides numbers.
export function textbookSectionPages(book) {
  const proof = book?.localProofs?.textbook;
  return Array.isArray(proof?.sectionPages) ? proof.sectionPages : [];
}
export function textbookPageSpan(book, chapterId, sectionIds) {
  const rows = textbookSectionPages(book).filter(row => row.chapter === chapterId && sectionIds.includes(row.section));
  if (!rows.length) return null;
  return {from: Math.min(...rows.map(row => row.page)), to: Math.max(...rows.map(row => row.endPage))};
}
export function textbookPageTarget(book, page) {
  const rows = textbookSectionPages(book), pages = book?.localProofs?.textbook?.pages;
  if (!Number.isInteger(page) || page < 1 || !rows.length || page > pages) return null;
  const exact = rows.filter(row => row.page <= page && page <= row.endPage);
  if (exact.length) return {page, exact: true, chapterId: exact[0].chapter, sectionId: exact[0].section,
    sections: exact.map(row => ({chapterId: row.chapter, sectionId: row.section}))};
  // Word lists and alignment pages are not reader sections: open the preceding section's chapter.
  const before = rows.filter(row => row.page <= page).at(-1) || rows[0];
  return {page, exact: false, chapterId: before.chapter, sectionId: '', sections: []};
}
export function formatPageSpan(span) {
  return span ? (span.from === span.to ? 's. ' + span.from : 's. ' + span.from + '–' + span.to) : '';
}
