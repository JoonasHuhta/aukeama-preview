import {bindSpatialDiagram,cellKey} from './spatial-model.mjs';
import {escapeHtml as e} from './html.mjs';

export function decorateSpatialDiagram(html,markdown,config,id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid diagram DOM ID');
  const map=bindSpatialDiagram(markdown,config);
  const width=Math.max(560,map.columns.length*137+12),height=Math.max(360,map.rows.length*110+36);
  const xy=point=>({x:75+point.x*137,y:75+point.y*110});
  const nodeWidth=point=>Math.max(100,Math.min(146,point.label.split(',')[0].length*11+24));
  const line=([a,b])=>{const p=xy(a),q=xy(b);return '<path d="M'+p.x+' '+p.y+'L'+q.x+' '+q.y+'"/>';};
  const route=map.route.map(xy);
  const last=route.at(-1),before=route.at(-2),dx=Math.sign(last.x-before.x),dy=Math.sign(last.y-before.y);
  const end={x:last.x-dx*(nodeWidth(map.route.at(-1))/2+2),y:last.y-dy*33};
  const path=route.map((point,i)=>i===route.length-1?'L'+end.x+' '+end.y:(i?'L':'M')+point.x+' '+point.y).join(' ');
  const nodes=map.points.filter(point=>!point.empty).map(point=>{
    const p=xy(point),start=point===map.route[0],walking=point.y===map.walkway&&!map.route.includes(point);
    const lines=point.label.split(/,\s*/);
    const wide=nodeWidth(point);
    return '<g class="route-place'+(start?' route-start':walking?' route-walkway':'')+'" data-cell="'+e(cellKey(point))+'"'+(map.route.includes(point)?' data-route-stop':'')+'><rect x="'+(p.x-wide/2)+'" y="'+(p.y-31)+'" width="'+wide+'" height="62" rx="8"/>'+lines.map((label,i)=>'<text x="'+p.x+'" y="'+(p.y+(i-(lines.length-1)/2)*23)+'" dominant-baseline="central">'+e(label)+'</text>').join('')+'</g>';
  }).join('');
  const graphic='<figure class="route-diagram" tabindex="-1" aria-label="'+e(map.title)+'">'+
    '<figcaption class="diagram-heading"><span>'+e(map.title)+'</span><button type="button" data-route-center hidden>Aloitus näkyviin</button></figcaption>'+
    '<p class="diagram-pan-hint">Tarvittaessa siirrä karttaa sivusuunnassa. Paikkojen sijainti ei muutu.</p>'+
    '<div class="diagram-pan" tabindex="0" role="region" aria-label="Reittikuva – vieritettävä alue">'+
    '<svg class="route-drawing" viewBox="0 0 '+width+' '+height+'" role="img" aria-labelledby="'+id+'-title '+id+'-description">'+
    '<title id="'+id+'-title">'+e(map.title)+'</title><desc id="'+id+'-description">Aloituspaikka on '+e(map.route[0].label)+'. Tarkat paikat ovat myös avattavassa taulukossa. Sanallinen kuvaus on kartan jälkeen.</desc>'+
    '<defs><marker id="'+id+'-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0 0L10 5L0 10Z"/></marker></defs>'+
    '<g class="route-corridors">'+map.edges.map(line).join('')+'</g><g class="route-ink" data-route-ink hidden><path d="'+path+'" marker-end="url(#'+id+'-arrow)"/></g>'+nodes+'</svg></div></figure>';
  const spatial=/<p class="map-pan-hint">[\s\S]*?<div class="table-wrap spatial-map"[\s\S]*?<\/table><\/div>/g;
  if ([...html.matchAll(spatial)].length!==1) throw new Error('Diagram needs exactly one rendered spatial table');
  const trigger='<details class="extra-help"><summary>'+e(config.check_title)+'</summary>';
  if (html.split(trigger).length!==2) throw new Error('Diagram answer disclosure is missing or ambiguous');
  const result=html.replace(spatial,table=>'<details class="map-grid"><summary>Taulukko ja koordinaatit</summary>'+table+'</details>');
  const answerStart=result.indexOf(trigger),after=result.indexOf('</div></details>',answerStart);
  if (after<0) throw new Error('Diagram answer body is missing');
  const jump='<button type="button" class="route-return" data-route-return hidden>Katso korostettu reitti kartalla</button>';
  return graphic+(result.slice(0,after)+jump+result.slice(after))
    .replace(trigger,'<details class="extra-help" data-route-check><summary>'+e(config.check_title)+'</summary>');
}
