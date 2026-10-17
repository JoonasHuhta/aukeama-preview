export function libraryUrl(query = '') {
  return '#/library' + (query ? '?q=' + encodeURIComponent(query) : '');
}
export function bookUrl(id) {
  return '#/books/' + encodeURIComponent(id);
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
export function readerUrl(bookId, chapterId, section = '', mode = 'spread') {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (mode === 'chapter') params.set('view', mode);
  return bookUrl(bookId) + '/read/' + encodeURIComponent(chapterId) + (params.size ? '?' + params : '');
}
export function parseRoute(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  if (!path || path === '/' || path === '/library' || path === 'main') return { view: 'library', query: params.get('q') || '' };
  if (path === '/help') return { view: 'help' };
  try {
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'books' && parts.length === 2) return { view: 'book', bookId: parts[1] };
    if (parts[0] === 'books' && parts[2] === 'read' && parts.length === 4) {
      return { view: 'reader', bookId: parts[1], chapterId: parts[3], section: params.get('section') || '',
        mode: params.get('view') === 'chapter' ? 'chapter' : 'spread' };
    }
  } catch { /* Malformed addresses are a normal not-found state. */ }
  return { view: 'not-found' };
}
// Authored references without a view choice inherit the reader's current mode.
// Explicit modes, other books and non-reader links retain normal browser behavior.
export function readerReferenceUrl(href, book, mode) {
  if (typeof href !== 'string' || !href.startsWith('#/books/')) return;
  const params = new URLSearchParams(href.split('?')[1] || '');
  if ([...params.keys()].some(key => key !== 'section')) return;
  const route = parseRoute(href);
  if (route.view !== 'reader' || route.bookId !== book.id) return;
  const target = resolveReaderTarget(book, route.chapterId, route.section);
  const chapter = readingOrder(book).find(item => item.id === target.chapterId);
  if (!chapter || (target.section && !chapter.sectionIds?.includes(target.section))) return;
  return readerUrl(book.id, target.chapterId, target.section, mode);
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
export function readerPageSize(chapter, singlePage = false) {
  return singlePage || chapter?.supportType === 'contents' ? 1 : 2;
}
