import { escapeHtml as e } from './html.mjs';

/*
 * Who makes Aukeama and how to reach them. Kept in one place so the front page,
 * the authors page and the footer cannot drift apart. Only channels that exist.
 */
export const FEEDBACK_URL = 'https://discord.gg/HMJpQwsAb';
export const AUTHORS = [{
  name: 'Joonas Huhta',
  role: 'Kirjoittaja ja toimittaja',
  bio: 'Opettaja, mediakasvattaja ja pelinkehittäjä, yli kymmenen vuotta luokanopettajana. ' +
    'Kirjoittaa ja toimittaa Aukeaman kirjat ja rakentaa palvelun. Kokeilee kirjaa omassa opetuksessaan ' +
    'ja korjaa sitä sen mukaan, mikä luokassa toimii.',
  links: [
    ['LinkedIn', 'https://www.linkedin.com/in/joonas-huhta-2821a3260/'],
    ['Facebook', 'https://www.facebook.com/profile.php?id=1333874361'],
  ],
}];

export const external = (label, href, className = '') => '<a' + (className ? ' class="' + className + '"' : '') +
  ' href="' + e(href) + '" target="_blank" rel="noopener">' + e(label) + '<span class="sr-only"> (avautuu uuteen välilehteen)</span></a>';

/*
 * A quiet way to send feedback from where the reader is. The reference (book,
 * page, task) travels in data-feedback; the app copies it with the address to the
 * clipboard before Discord opens, so the message can say exactly which spot is meant.
 * Without script it is an ordinary link to the feedback channel.
 */
export const feedbackReference = (...parts) => parts.filter(Boolean).join(' · ');
const FEEDBACK_ICON = '<svg class="feedback-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 5h16v11H9l-5 4z"/></svg>';
export function feedbackLink(reference, {place = 'bar', label = 'Palaute'} = {}) {
  return '<a class="feedback-link feedback-' + e(place) + '" href="' + e(FEEDBACK_URL) + '" target="_blank" rel="noopener" data-feedback="' + e(reference) + '"' +
    ' title="Anna palautetta tästä kohdasta">' + FEEDBACK_ICON + '<span class="feedback-label">' + e(label) + '</span>' +
    '<span class="sr-only"> tästä kohdasta (Discord avautuu uuteen välilehteen, kohdan tiedot kopioidaan leikepöydälle)</span></a>';
}
/** Text copied for the feedback message: the reference and the exact address. */
export const feedbackClipboardText = (reference, href) => reference + '\n' + href + '\n\n';

export function authorsView() {
  return '<div class="page authors-page"><p class="hero-eyebrow">Opettajalta opettajille</p><h1>Tekijät</h1>' +
    '<p class="authors-lead">Aukeama on opettajan aloittama oppikirjahanke. Painopiste on nyt kuudennen luokan ruotsissa; ' +
    'saksa ja mahdollisesti englanti ovat suunnitelmissa.</p>' +
    AUTHORS.map(author => '<section class="author-card" aria-labelledby="author-' + e(author.name.replace(/\W+/g, '-').toLowerCase()) + '">' +
      '<h2 id="author-' + e(author.name.replace(/\W+/g, '-').toLowerCase()) + '">' + e(author.name) + '</h2>' +
      '<p class="author-role">' + e(author.role) + '</p><p>' + e(author.bio) + '</p>' +
      '<p class="author-links">' + author.links.map(([label, href]) => external(label, href)).join('') + '</p></section>').join('') +
    '<section aria-labelledby="authors-how"><h2 id="authors-how">Miten kirja tehdään</h2>' +
    '<p>Kirja on koottu osista: luvut, tehtävät ja harjoitukset ovat erillisiä palasia, ja painettu kirja ja verkkoversio tehdään samoista lähteistä. ' +
    'Siksi korjaus palautteen pohjalta päivittyy nopeasti kumpaankin, ja kokonaisuutta voi sovittaa koulun tai alueen tarpeisiin.</p>' +
    '<p>Työssä on käytetty tekoälyä: tekstien ja tehtävien luonnostelussa, taitossa, tarkistuksissa ja verkkopalvelun koodissa. ' +
    'Tekoälyn tarkistus ei korvaa ihmisen tekemää kielentarkistusta. Vastuu sisällöstä on tekijällä.</p>' +
    '<p>Nykyinen kirja on käsikirjoitus. Ruotsin kielen ihmistarkistus ja äänitteet ovat vielä kesken.</p></section>' +
    '<section aria-labelledby="authors-join"><h2 id="authors-join">Kokeile ja vaikuta</h2>' +
    '<p>Kokeile lukua luokassasi ja kerro, mikä toimi ja mikä ei. Palaute ohjaa sitä, mitä kirjassa korjataan seuraavaksi.</p>' +
    '<p>Jos koulusi tai alueesi tarvitsee omanlaisensa kokonaisuuden, ota yhteyttä.</p>' +
    '<p class="author-links">' + external('Anna palautetta Discordissa', FEEDBACK_URL, 'button primary') + '</p></section></div>';
}
