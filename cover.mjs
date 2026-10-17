import { escapeHtml as e } from './content.mjs';

// Original abstract islands and a sound trace, not a geographical map.
export const coverArtwork = {
  islands: [
    [[0,255],[24,241],[42,244],[67,225],[94,230],[112,253],[101,270],[62,275],[26,268],[0,280]],
    [[146,220],[165,203],[187,209],[198,228],[188,245],[161,242]],
    [[217,263],[235,246],[262,249],[277,235],[300,242],[300,284],[273,296],[242,291]],
    [[77,314],[94,299],[117,303],[130,317],[113,330],[90,328]]
  ],
  sound: [[22,287],[36,287],[44,279],[52,299],[60,273],[68,291],[77,287],[144,287],[152,279],[160,293],[168,283],[178,287],[210,287]]
};

export function coverTitleLines(title) {
  const lines=[];
  for(const word of title.split(/\s+/)) {
    if(!lines.length || (lines.at(-1)+' '+word).length>20) lines.push(word);
    else lines[lines.length-1]+=' '+word;
  }
  return lines;
}

export function coverView(book) {
  if(!book.cover) return '<div class="book-cover" aria-hidden="true"><span>'+e(book.series)+
    '</span><strong>'+e(book.grade)+'</strong><small>'+e(book.subjectLabel)+'</small></div>';
  const points=path=>path.map(p=>p.join(',')).join(' ');
  return '<div class="book-cover book-cover-illustrated" aria-hidden="true">'+
    '<svg viewBox="0 0 300 400" focusable="false" aria-hidden="true">'+
    '<rect width="300" height="400" class="cover-paper"/>'+
    '<rect x="0" y="0" width="8" height="400" class="cover-edge"/>'+
    '<text x="26" y="43" class="cover-series">'+e(book.series)+'</text>'+
    '<text x="26" y="137" class="cover-grade">'+e(book.grade)+'</text>'+
    '<text x="26" y="171" class="cover-title">'+coverTitleLines(book.cover.title).map((line,index)=>
      '<tspan x="26" dy="'+(index?28:0)+'">'+e(line)+'</tspan>').join('')+'</text>'+
    coverArtwork.islands.map(shape=>'<polygon points="'+points(shape)+'" class="cover-island"/>').join('')+
    '<polyline points="'+points(coverArtwork.sound)+'" class="cover-sound"/>'+
    '<text x="26" y="363" class="cover-subject">'+e(book.subjectLabel)+'</text>'+
    '<text x="26" y="385" class="cover-publisher">Aukeama · tekstikirja</text></svg></div>';
}
