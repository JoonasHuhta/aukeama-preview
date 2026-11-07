import { readingOrder } from './routes.mjs';

export const readingPositionKey = 'aukeama.reading-position.v1';
const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 160;
function valid(value) {
  return value?.schemaVersion === 1 && id(value.bookId) && id(value.chapterId) && id(value.sectionId) &&
    typeof value.version === 'string' && value.version.length > 0 && value.version.length <= 100 &&
    ['spread', 'chapter'].includes(value.mode);
}
function fields(value) {
  return { schemaVersion: 1, bookId: value.bookId, version: value.version,
    chapterId: value.chapterId, sectionId: value.sectionId, mode: value.mode };
}
export function resolveReadingPosition(books, position) {
  if (!valid(position)) return null;
  const book = books.find(item => item.id === position.bookId && item.version === position.version);
  const chapter = book && readingOrder(book).find(item => item.id === position.chapterId);
  if (!chapter?.sectionIds?.includes(position.sectionId)) return null;
  return { book, chapter, sectionId: position.sectionId, mode: position.mode };
}

/** A link's rendered source section can differ from the selected spread/chapter anchor. */
export function readingSourcePosition(book, chapterId, sectionId, mode) {
  const value = { schemaVersion: 1, bookId: book.id, version: book.version,
    chapterId, sectionId, mode };
  return resolveReadingPosition([book], value) ? fields(value) : null;
}

/** Only a single navigation location is retained, never answers or learner data. */
export function createReadingState(getStorage) {
  let position = null;
  let persistent = true;
  // A model in another chapter is a temporary lookup, not the new main task.
  let reference = null;
  try {
    const raw = getStorage().getItem(readingPositionKey);
    if (raw && raw.length <= 2048) {
      const value = JSON.parse(raw);
      if (valid(value)) position = fields(value);
    }
  } catch { persistent = false; }
  function save(value) {
    if (!valid(value)) return false;
    position = fields(value);
    try { getStorage().setItem(readingPositionKey, JSON.stringify(position)); persistent = true; }
    catch { persistent = false; }
    return persistent;
  }
  return {
    get: () => ({ position, persistent }),
    save,
    followReference(books, from, to) {
      const source = resolveReadingPosition(books, from);
      const target = resolveReadingPosition(books, to);
      if (!source || !target || source.book.id !== target.book.id ||
          source.book.version !== target.book.version || source.chapter.id === target.chapter.id) return false;
      const origin = reference && reference.targetChapterId === source.chapter.id
        ? resolveReadingPosition(books, reference.origin) : source;
      if (!origin || origin.book.id !== source.book.id || origin.book.version !== source.book.version ||
          !origin.book.chapters.some(chapter => chapter.id === origin.chapter.id)) return false;
      const home = readingSourcePosition(origin.book, origin.chapter.id, origin.sectionId, origin.mode);
      reference = target.chapter.id === origin.chapter.id ? null : { origin: home, targetChapterId: target.chapter.id };
      save(home);
      return true;
    },
    visit(books, value) {
      const current = resolveReadingPosition(books, value);
      if (!current) return null;
      const previous = resolveReadingPosition(books, position);
      const support = [...(current.book.frontMatter || []), ...(current.book.backMatter || [])]
        .some(part => part.id === current.chapter.id);
      if (reference) {
        const origin = resolveReadingPosition(books, reference.origin);
        if (origin?.book.id === current.book.id && origin.book.version === current.book.version &&
            (reference.targetChapterId === current.chapter.id || support)) return origin;
        reference = null;
      }
      if (support && previous?.book.id === current.book.id &&
          current.book.chapters.some(part => part.id === previous.chapter.id)) return previous;
      save(value);
      return null;
    },
    clear() {
      position = null;
      reference = null;
      try { getStorage().removeItem(readingPositionKey); return true; }
      catch { persistent = false; return false; }
    }
  };
}
