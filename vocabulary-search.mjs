// Search the delivered vocabulary, not a second copy of the book's word list.
const normalized = value => String(value).normalize('NFC').toLocaleLowerCase('sv').trim();

export function searchVocabulary(book, chapter, query = '', scope = 'chapter') {
  // Copied question marks and model ellipses are not part of a lookup word.
  const terms = normalized(query).replace(/[?!.,;:…]/gu, ' ').split(/\s+/u).filter(Boolean);
  const entries = new Map();
  const chapters = scope === 'book' ? book.chapters : [chapter];
  for (const source of chapters || []) {
    for (const group of source.vocabulary?.groups || []) {
      for (const entry of group.entries) {
        const key = normalized(entry.form);
        if (!entries.has(key)) entries.set(key, {form:entry.form, meanings:[], references:[]});
        const item = entries.get(key);
        if (!item.meanings.includes(entry.meaning)) item.meanings.push(entry.meaning);
        item.references.push({chapterId:source.id, chapterTitle:source.title, groupTitle:group.title});
      }
    }
  }
  return [...entries.values()].filter(entry => {
    const text = normalized([entry.form, ...entry.meanings].join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a,b) => a.form.localeCompare(b.form, 'sv'));
}
