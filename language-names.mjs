// Finnish names for the languages a book teaches, so that shared UI text never
// hard-codes one subject ("ruotsi"). Unknown codes fall back to a neutral wording.
const NAMES = {
  sv: {name: 'ruotsi', genitive: 'ruotsin', adverb: 'ruotsiksi', adjective: 'ruotsinkielinen'},
  fi: {name: 'suomi', genitive: 'suomen', adverb: 'suomeksi', adjective: 'suomenkielinen'},
  en: {name: 'englanti', genitive: 'englannin', adverb: 'englanniksi', adjective: 'englanninkielinen'},
  de: {name: 'saksa', genitive: 'saksan', adverb: 'saksaksi', adjective: 'saksankielinen'},
  fr: {name: 'ranska', genitive: 'ranskan', adverb: 'ranskaksi', adjective: 'ranskankielinen'},
  es: {name: 'espanja', genitive: 'espanjan', adverb: 'espanjaksi', adjective: 'espanjankielinen'}
};
const FALLBACK = {source: {name: 'kohdekieli', genitive: 'kohdekielen', adverb: 'kohdekielellä', adjective: 'kohdekielinen'},
  target: {name: 'selityskieli', genitive: 'selityskielen', adverb: 'selityskielellä', adjective: 'selityskielinen'}};
export function languageName(code, role = 'source') {
  const base = String(code || '').toLowerCase().split('-')[0];
  return NAMES[base] || FALLBACK[role] || FALLBACK.source;
}
export const capitalize = text => text.charAt(0).toLocaleUpperCase('fi') + text.slice(1);
