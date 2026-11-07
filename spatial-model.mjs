// Editorial diagram bindings. Coordinates and labels always come from the authored grid.
const plain=value=>typeof value==='string' && value.trim()===value && value.length>0 && value.length<=160 && !/[\x00-\x1f\x7f]/.test(value);
const keys=(value,allowed)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>allowed.includes(key));
const cells=line=>line.trim().slice(1,-1).split('|').map(value=>value.trim());
export const cellKey=point=>point.column+':'+point.row;

export function validateDiagramConfig(config) {
  if (!keys(config,['walkway_row','check_title','route']) || !plain(config.walkway_row) || !plain(config.check_title) ||
      !Array.isArray(config.route) || config.route.length<2 || config.route.length>24) throw new Error('Invalid diagram binding');
  for (const point of config.route) {
    if (!keys(point,['column','row','expected']) || ![point.column,point.row,point.expected].every(plain)) throw new Error('Invalid diagram coordinate');
  }
  if (new Set(config.route.map(cellKey)).size!==config.route.length) throw new Error('Repeated diagram route point');
  return config;
}

export function readSpatialGrid(markdown) {
  const source=markdown.replace(/\r\n?/g,'\n');
  const blocks=[...source.matchAll(/^:::spatial-table (.{1,160})\n([\s\S]*?)^:::[\t ]*$/gm)];
  if (blocks.length!==1 || (source.match(/^:::spatial-table\b/gm)||[]).length!==1) throw new Error('Diagram needs exactly one spatial table');
  const block=blocks[0],lines=block[2].split('\n').filter(line=>line.trim());
  const headers=cells(lines[0]||'');
  if (lines.length<3 || lines.length>14 || headers.length<2 || headers.length>12 ||
      !/^\|[\s:|-]+\|$/.test(lines[1]) || lines.some(line=>!/^\|.*\|$/.test(line)) ||
      lines.slice(2).some(line=>cells(line).length!==headers.length)) throw new Error('Diagram needs a rectangular spatial table');
  const columns=headers.slice(1),rows=lines.slice(2).map(line=>cells(line));
  if (!columns.every(plain) || !rows.every(row=>plain(row[0])) || new Set(columns).size!==columns.length ||
      new Set(rows.map(row=>row[0])).size!==rows.length) throw new Error('Diagram needs unique row and column labels');
  const points=rows.flatMap((row,y)=>row.slice(1).map((label,x)=>({column:columns[x],row:row[0],label,x,y,empty:!label||/^[-–—]$/.test(label)})));
  return {title:block[1],columns,rows:rows.map(row=>row[0]),points,block:block[0]};
}

export function bindSpatialDiagram(markdown,config) {
  validateDiagramConfig(config);
  const grid=readSpatialGrid(markdown),walkway=grid.rows.indexOf(config.walkway_row);
  if (walkway<0) throw new Error('Diagram walkway row is missing');
  const byKey=new Map(grid.points.map(point=>[cellKey(point),point]));
  const edges=[];
  const add=(a,b)=>{if(a && b && !a.empty && !b.empty) edges.push([a,b]);};
  // One explicit walking row, with contiguous vertical branches, not diagonal shortcuts.
  for (let x=0;x<grid.columns.length;x++) {
    const at=y=>grid.points.find(point=>point.x===x&&point.y===y);
    if (x) add(at(walkway),grid.points.find(point=>point.x===x-1&&point.y===walkway));
    for (const step of [-1,1]) {
      let y=walkway;
      while (at(y) && !at(y).empty && at(y+step) && !at(y+step).empty) {add(at(y),at(y+step));y+=step;}
    }
  }
  const route=config.route.map(point=>{
    const actual=byKey.get(cellKey(point));
    if (!actual || actual.empty || actual.label!==point.expected) throw new Error('Diagram source changed at '+cellKey(point));
    return actual;
  });
  for (let i=1;i<route.length;i++) {
    if (!edges.some(([a,b])=>(a===route[i-1]&&b===route[i])||(b===route[i-1]&&a===route[i]))) throw new Error('Diagram route leaves the authored walking grid');
  }
  return {...grid,walkway,edges,route};
}
