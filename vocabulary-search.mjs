// Search the delivered vocabulary, not a second copy of the book's word list.
const normalized = value => String(value).normalize('NFC').toLocaleLowerCase().trim();
const queryTerms = value => normalized(value).replace(/[?!.,;:…]/gu, ' ').split(/\s+/u).filter(Boolean);
export const hasVocabularyQuery = value => queryTerms(value).length > 0;

export function searchVocabulary(book, chapter, query = '', scope = 'chapter') {
  return searchSupport(book, chapter, query, scope, false);
}

/** Reader lookup includes declared phrases; the word-only API preserves teaching roles. */
export function searchReadingSupport(book, chapter, query = '', scope = 'chapter') {
  return searchSupport(book, chapter, query, scope, true);
}

function searchSupport(book, chapter, query, scope, includePhrases) {
  // Copied question marks and model ellipses are not part of a lookup word.
  const terms = queryTerms(query);
  const entries = new Map();
  const chapters = scope === 'book' ? book.chapters : [chapter];
  // Alphabetical order follows the taught language (å/ä/ö differ between Swedish and German).
  const language = (chapters || []).find(source => source?.vocabulary)?.vocabulary.sourceLanguage || undefined;
  for (const source of chapters || []) {
    const groups = [...(source.vocabulary?.groups || [])];
    if (includePhrases && source.vocabulary?.phrases?.length) {
      groups.push({title:'Käyttöfraasit', entries:source.vocabulary.phrases});
    }
    for (const group of groups) {
      for (const entry of group.entries) {
        const key = normalized(entry.form);
        if (!entries.has(key)) entries.set(key, {form:entry.form, meanings:[], references:[], ...(entry.forms ? {forms:entry.forms} : {})});
        const item = entries.get(key);
        if (!item.meanings.includes(entry.meaning)) item.meanings.push(entry.meaning);
        item.references.push({chapterId:source.id, chapterTitle:source.title, groupTitle:group.title});
      }
    }
  }
  return [...entries.values()].filter(entry => {
    // Inflected forms find their base word: "böcker" finds "en bok".
    const text = normalized([entry.form, ...(entry.forms || []), ...entry.meanings].join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a,b) => a.form.localeCompare(b.form, language));
}
