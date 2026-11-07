import {escapeHtml as e} from './html.mjs';

function validate(visual) {
  const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=160;
  if(visual?.kind!=='backpack-comparison'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(visual.id)||
      !text(visual.heading)||!text(visual.title)||!Array.isArray(visual.columns)||visual.columns.length!==3||!visual.columns.every(text)||
      !Array.isArray(visual.items)||visual.items.length!==3||visual.items.some(item=>!text(item.label)||
        !Array.isArray(item.properties)||item.properties.length!==3||!item.properties.every(text)||
        !['blue','green'].includes(item.body)||![1,2].includes(item.pockets?.count)||!['light','dark'].includes(item.pockets?.paint)||
        !['circle','star'].includes(item.reflector)))throw new Error('Invalid learning visual model');
}

function backpack(item) {
  const pockets=item.pockets.count===1?[[54,52]]:[[40,34],[86,34]];
  return '<svg class="backpack-drawing" viewBox="0 0 160 190" aria-hidden="true" focusable="false">'+
    '<path class="bag-handle" d="M60 34V24C60 2 100 2 100 24V34"/>'+
    '<rect class="bag-body bag-'+item.body+'" x="26" y="30" width="108" height="142" rx="30"/>'+
    pockets.map(([x,width])=>'<rect class="bag-pocket bag-pocket-'+item.pockets.paint+'" x="'+x+'" y="102" width="'+width+'" height="46" rx="6"/>').join('')+
    (item.reflector==='circle'?'<circle class="bag-reflector" cx="111" cy="65" r="12"/>':
      '<polygon class="bag-reflector" points="111,50 115,60 126,61 118,68 120,80 111,74 101,80 104,68 96,61 107,60"/>')+'</svg>';
}

export function learningVisualFigure(visual) {
  validate(visual);
  return '<figure class="learning-visual" data-learning-visual="'+e(visual.id)+'"><figcaption>'+e(visual.title)+
    '</figcaption><ul class="learning-visual-items">'+visual.items.map(item=>'<li class="learning-visual-item">'+
      '<strong class="visual-item-label">'+e(item.label)+'</strong>'+backpack(item)+'<dl>'+item.properties.map((value,i)=>
        '<div><dt>'+e(visual.columns[i])+'</dt><dd>'+e(value)+'</dd></div>').join('')+'</dl></li>').join('')+'</ul></figure>';
}

export function decorateLearningVisuals(html,visuals,sectionId) {
  for(const visual of visuals||[]) {
    if(visual.section!==sectionId)continue;
    validate(visual);
    const headings=[...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].filter(match=>match[1]===e(visual.heading));
    if(headings.length!==1)throw new Error('Missing or ambiguous learning visual heading');
    const heading=headings[0],start=heading.index+heading[0].length,next=html.indexOf('<h3',start);
    const end=next<0?html.length:next,source=html.slice(start,end);
    const tables=[...source.matchAll(/<div class="table-wrap"[^>]*><table\b[\s\S]*?<\/table><\/div>/g)];
    if(tables.length!==1)throw new Error('Learning visual needs one source table after its heading');
    const table=tables[0],at=start+table.index;
    // The original table is still a selectable, printable text alternative; no answer panel is moved.
    html=html.slice(0,at)+learningVisualFigure(visual)+'<details class="visual-source-table"><summary>Taulukko tekstinä</summary>'+table[0]+'</details>'+html.slice(at+table[0].length);
  }
  return html;
}
