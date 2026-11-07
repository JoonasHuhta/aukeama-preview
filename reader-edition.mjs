import {escapeHtml as e} from './html.mjs';
import {editionMapHtml} from './chapter-map.mjs';

export function readerEditionFamily(edition,section) {
  const family=edition?.sections?.find(item=>item.id===section.id)?.family;
  return ['opening','scene','practice','source','closing'].includes(family)?family:null;
}

export function decorateReaderComparison(body,section,comparison) {
  if(!comparison||comparison.section!==section.id)return body;
  const boundary=title=>{
    const found=[...body.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].filter(m=>m[1]===e(title));
    if(found.length!==1)throw new Error('Missing or ambiguous comparison heading');
    return found[0].index;
  };
  const start=boundary(comparison.sourceHeading),middle=boundary(comparison.rolesHeading),end=boundary(comparison.afterHeading);
  if(start>=middle||middle>=end)throw new Error('Reordered comparison source');
  let work=body.slice(middle,end);
  const lists=[...work.matchAll(/<ul>([\s\S]*?)<\/ul>/g)].filter(list=>{
    const items=[...list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)];
    return items.length===comparison.owners.length&&items.every((item,i)=>item[1].startsWith(e(comparison.owners[i])+': '));
  });
  if(lists.length!==1)throw new Error('Missing or ambiguous comparison owner list');
  const list=lists[0],items=[...list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)];
  const cards='<div class="role-cards" role="group" aria-label="Omistajien kuvaukset">'+items.map((item,i)=>
    '<details class="role-card"><summary>'+e(comparison.owners[i])+'</summary><div class="role-card-body"><p>'+
    item[1].slice((e(comparison.owners[i])+': ').length)+'</p></div></details>').join('')+'</div>';
  work=work.slice(0,list.index)+cards+work.slice(list.index+list[0].length);
  return body.slice(0,start)+'<div class="reader-comparison"><aside class="reader-comparison-source" tabindex="0" aria-label="'+e(comparison.sourceHeading)+'">'+
    body.slice(start,middle)+'</aside><div class="reader-comparison-work">'+work+'</div></div><div class="reader-comparison-after">'+body.slice(end)+'</div>';
}

export function decorateReaderSourceRepeat(body,repeat,sourceHtml,idPrefix='') {
  const id='reader-repeat-'+idPrefix+repeat.id;
  const work=body.replace(/<a href="([^"]+)"/g,(tag,href)=>
    href===e(repeat.source.href)?tag+' data-reader-repeat-target="'+e(id)+'"':tag);
  const source='<details class="reader-source-repeat" id="'+e(id)+'"><summary>'+e(repeat.source.title)+
    '</summary><div class="reader-repeat-body">'+sourceHtml+'<p class="reader-repeat-origin"><a href="'+e(repeat.source.href)+
    '">Avaa alkuperäinen aineisto</a></p></div></details>';
  return '<div class="reader-repeat-task"><aside class="reader-repeat-aside" aria-label="Tehtävän aineisto">'+source+
    '</aside><div class="reader-repeat-work">'+work+'</div></div>';
}

// Original hrefs remain usable when opening in another tab or without the enhancement.
export function installReaderSourceRepeats(root) {
  root.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const link=event.target.closest?.('a[data-reader-repeat-target]');
    if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
    const paper=link.closest('.paper-section');
    const target=[...paper?.querySelectorAll('details.reader-source-repeat')||[]]
      .find(element=>element.id===link.dataset.readerRepeatTarget);
    if(!target)return;
    event.preventDefault();target.open=true;
    const summary=target.querySelector('summary');
    summary.focus({preventScroll:true});summary.scrollIntoView({block:'nearest',inline:'nearest'});
  });
}

export function decorateReaderEdition(body,section,edition,idPrefix='') {
  const map=edition?.map;
  if(!map)return body;
  if(section.id===map.sourceSection) {
    const heading=new RegExp('<h3 data-content-point="'+map.sourcePoint+'"[^>]*>[^]*?</h3>','g');
    if([...body.matchAll(heading)].length!==1)throw new Error('Reader map source heading changed');
    return body.replace(heading,match=>match+editionMapHtml(map,idPrefix+'reader-source-'+map.id));
  }
  if(section.id!==map.taskSection)return body;
  const table='<div class="table-wrap"><table><thead><tr>'+map.table.headers.map(v=>'<th scope="col">'+e(v)+'</th>').join('')+
    '</tr></thead><tbody>'+map.table.rows.map(row=>'<tr>'+row.map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const source=editionMapHtml(map,idPrefix+'reader-task-'+map.id)+
    '<details class="extra-help"><summary>Avaa sama taulukkokartta</summary>'+table+'</details>';
  return '<div class="reader-map-task"><aside class="reader-task-source" aria-label="Tehtävän kartta">'+source+
    '</aside><div class="reader-task-work">'+body+'</div></div>';
}
