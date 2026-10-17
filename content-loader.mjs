import {parseChapter} from './content.mjs';
import {readingOrder,resolveReaderTarget} from './routes.mjs';

export async function fetchCatalog(baseUrl, {signal, fetcher=fetch}={}) {
  const response=await fetcher(new URL('catalog.json',baseUrl),{signal,cache:'no-store'});
  if (!response.ok) throw new Error('Catalog request failed');
  const catalog=await response.json();
  if (catalog.schemaVersion!==1 || !Array.isArray(catalog.books)) throw new Error('Invalid catalog');
  return catalog.books;
}

export function createContentLoader({baseUrl,fetcher=fetch}={}) {
  const cache=new Map();
  async function read(book,chapter,signal) {
    signal?.throwIfAborted();
    const key=JSON.stringify([book.id,book.version,book.sourceDigest,chapter.file,chapter.dialogueLanguage]);
    if (cache.has(key)) return cache.get(key);
    const response=await fetcher(new URL(chapter.file,baseUrl),{signal,cache:'no-store'});
    if (!response.ok) throw Object.assign(new Error('Chapter request failed'),{status:response.status});
    const text=await response.text();
    signal?.throwIfAborted();
    const sections=parseChapter(text,{sectionIds:chapter.sectionIds,dialogueLanguage:chapter.dialogueLanguage});
    cache.set(key,sections);
    return sections;
  }
  return {
    clear(){cache.clear();},
    async load(book,chapter,{signal,section=''}={}) {
      function locate(currentBook) {
        const target=resolveReaderTarget(currentBook,chapter.id,section);
        const currentChapter=readingOrder(currentBook).find(item=>item.id===target.chapterId);
        if (!currentChapter) throw new Error('Chapter no longer in catalog');
        return {book:currentBook,chapter:currentChapter,section:target.section};
      }
      const initial=locate(book);
      try {return {...initial,sections:await read(initial.book,initial.chapter,signal)};}
      catch(error) {
        if (error.name==='AbortError' || ![404,410].includes(error.status)) throw error;
        // One bounded refresh, never a retry loop or a guessed content path.
        const books=await fetchCatalog(baseUrl,{signal,fetcher});
        signal?.throwIfAborted();
        const currentBook=books.find(item=>item.id===book.id);
        if (!currentBook) throw new Error('Chapter no longer in catalog');
        const current=locate(currentBook);
        const sections=await read(current.book,current.chapter,signal);
        return {...current,sections,books};
      }
    }
  };
}
