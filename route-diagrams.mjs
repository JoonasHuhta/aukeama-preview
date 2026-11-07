// Scope controls to one rendered source section, including independent dialog copies.
export function centerRouteMap(figure, wholeRoute = false) {
  const pan=figure?.querySelector('.diagram-pan');
  const places=[...figure?.querySelectorAll(wholeRoute?'[data-route-stop]':'.route-start')||[]];
  if (!pan?.clientWidth || !places.length) return false;
  const bounds=pan.getBoundingClientRect(),boxes=places.map(place=>place.getBoundingClientRect());
  let left=Math.min(...boxes.map(box=>box.left)),right=Math.max(...boxes.map(box=>box.right));
  if (wholeRoute && right-left>pan.clientWidth) {
    const start=figure.querySelector('.route-start').getBoundingClientRect();
    left=start.left; right=start.right;
  }
  pan.scrollLeft+=(left+right)/2-bounds.left-pan.clientWidth/2;
  return true;
}

export function installRouteDiagrams(root, {isPrinting=()=>false}={}) {
  const centered=new WeakSet();
  function sync(check) {
    const section=check.closest('.paper-section');
    const ink=section?.querySelector('[data-route-ink]');
    if (ink) ink.toggleAttribute('hidden',!check.open);
  }
  function refresh() {
    for (const figure of root.querySelectorAll('.route-diagram')) {
      const section=figure.closest('.paper-section');
      const check=section?.querySelector('[data-route-check]');
      if (!check) continue;
      const pan=figure.querySelector('.diagram-pan');
      figure.querySelector('[data-route-center]').hidden=pan.scrollWidth<=pan.clientWidth+1;
      check.querySelector('[data-route-return]').hidden=false;
      sync(check);
      if (!centered.has(figure) && centerRouteMap(figure)) centered.add(figure);
    }
  }
  root.addEventListener('toggle',event=>{
    if (event.target.matches?.('[data-route-check]') && !isPrinting()) sync(event.target);
  },true);
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-route-center], [data-route-return]');
    if (!button || !root.contains(button)) return;
    const figure=button.closest('.paper-section')?.querySelector('.route-diagram');
    if (!figure) return;
    if (button.hasAttribute('data-route-return')) {
      figure.scrollIntoView({block:'nearest',inline:'nearest'});
      centerRouteMap(figure,true);
      figure.focus({preventScroll:true});
    } else centerRouteMap(figure);
  });
  return {refresh};
}
