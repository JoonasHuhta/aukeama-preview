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
