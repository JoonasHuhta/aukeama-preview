import {escapeHtml as e} from './html.mjs';

export function editionMapHtml(map,id) {
  if(!/^[a-z0-9-]+$/.test(id))throw new Error('Invalid edition map ID');
  const room=row=>map.rooms.find(r=>r.row===row);
  const center=row=>{const [x,y,w,h]=room(row).rect;return [(x+w/2)*100,(y+h/2)*100];};
  const lines=map.links.map(([a,b])=>{const p=center(a),q=center(b);return '<path d="M'+p.join(' ')+' L'+q.join(' ')+'"/>';}).join('');
  const entrance=room(map.entryRow),entry=center(map.entryRow),bottom=(entrance.rect[1]+entrance.rect[3])*100;
  const rooms=map.rooms.map(r=>'<div class="edition-map-room'+(r.upper?' upper-room':'')+'" data-map-row="'+r.row+'">'+
    '<strong>'+e((r.upper?'Yläkerta: ':'')+r.label)+'</strong><p>'+e(r.items)+'</p></div>').join('');
  return '<figure class="edition-map edition-map-'+e(map.id)+'" aria-labelledby="'+id+'-title"><figcaption id="'+id+'-title">'+e(map.title)+'</figcaption>'+
    '<p class="map-reading-note">Sisään alhaalta. Yhteysviivat eivät ole vastausreitti. Kaavio ei ole mittakaavassa.</p>'+
    '<div class="edition-map-pan" tabindex="0" role="region" aria-label="Talon kartta – tarvittaessa vieritettävä alue"><div class="edition-map-canvas">'+
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g>'+lines+'<path d="M'+entry[0]+' 99 L'+entry[0]+' '+bottom+'"/></g></svg>'+rooms+
    '<span class="edition-map-entry">Ulko-ovi ↑</span></div></div></figure>';
}

export function editionMapCss(map) {
  if(!map)return '';
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(map.id)||map.rooms.some(r=>!Number.isInteger(r.row)||r.row<0||
      r.rect.length!==4||r.rect.some(n=>!Number.isFinite(n)||n<0||n>1)))throw new Error('Invalid edition map CSS');
  const prefix='.edition-map-'+map.id;
  const rules=map.rooms.map(r=>prefix+' .edition-map-room[data-map-row="'+r.row+'"]{'+
    'left:'+r.rect[0]*100+'%;top:'+r.rect[1]*100+'%;width:'+r.rect[2]*100+'%;height:'+r.rect[3]*100+'%}');
  const entry=map.rooms.find(r=>r.row===map.entryRow);
  if(!entry)throw new Error('Missing edition map CSS entrance');
  rules.push(prefix+' .edition-map-entry{left:'+(entry.rect[0]+entry.rect[2]/2)*100+'%}');
  return '\n'+rules.join('\n')+'\n';
}
