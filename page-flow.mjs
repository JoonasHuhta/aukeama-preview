// Book-like pagination for the spread reader. The chapter's sections flow from page
// to page like a printed book: a new section starts below the previous one when it
// fits, and a long section continues on the next page instead of scrolling inside
// its page. A heading starts a group (a task, a model, a scene) that is kept whole
// when it fits on a page; a taller group breaks between its blocks, and a heading
// never ends a page. Blocks kept together (an opening before its first heading) break
// too when they cannot fit one page. Only a single block taller than a page scrolls.

/**
 * Pack measured blocks into pages.
 * @param {number[]} heights block heights in px (including the space above the next block)
 * @param {{headings?: boolean[], keep?: boolean[], starts?: boolean[], breaks?: boolean[]}} rules
 *   headings: the block is a heading; keep: the block must stay with the next block;
 *   starts: the block starts a new group (e.g. a section); breaks: always start a new page here.
 * @param {number} available usable page height in px
 * @returns {Array<[number, number]>} [from, to) block ranges, one per page
 */
export function packBlocks(heights, rules, available) {
  if (Array.isArray(rules)) {
    // Single section: everything before the first heading keeps with it.
    const headings = rules, first = headings.indexOf(true);
    rules = {headings, keep: headings.map((heading, i) => heading || (first >= 0 && i < first))};
  }
  const n = heights.length;
  if (!n) return [[0, 0]];
  const headings = rules.headings || [], keep = rules.keep || headings, starts = rules.starts || [], breaks = rules.breaks || [];
  const groups = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (breaks[i] || starts[i] || (headings[i] && !keep[i - 1])) { groups.push([start, i]); start = i; }
  }
  groups.push([start, n]);
  const pages = [];
  let from = 0, used = 0;
  const close = at => { if (at > from) { pages.push([from, at]); from = at; used = 0; } };
  for (const [a, b] of groups) {
    if (breaks[a]) close(a);
    const size = heights.slice(a, b).reduce((sum, h) => sum + h, 0);
    if (used + size <= available) { used += size; continue; }
    if (size <= available) { close(a); used = size; continue; }
    // A group taller than a page breaks between blocks; a kept block stays with the next.
    for (let i = a; i < b; i++) {
      if (i > from && keep[i - 1]) {
        if (used + heights[i] <= available || (i - 1 === from && headings[i - 1])) { used += heights[i]; continue; }
        // It does not fit: carry the kept block (a heading) to the next page with its block.
        let back = i - 1;
        while (back > from && keep[back - 1]) back--;
        if (back > from) { close(back); used = heights.slice(back, i + 1).reduce((sum, h) => sum + h, 0); continue; }
        // The whole page is one kept chain (an opening, a long intro): rather than let the
        // page scroll, break it. A heading still moves on with its block when possible.
        if (headings[i - 1] && i - 1 > from && heights[i - 1] + heights[i] <= available) { close(i - 1); used = heights[i - 1] + heights[i]; continue; }
        if (!headings[i - 1]) { close(i); used = heights[i]; continue; }
        used += heights[i]; continue;
      }
      let need = heights[i];
      for (let j = i; keep[j] && j + 1 < n; j++) need += heights[j + 1];
      if (used > 0 && used + need > available) close(i);
      used += heights[i];
    }
  }
  close(n);
  return pages.length ? pages : [[0, n]];
}

/** The pages of each section in reading order: section id -> [page index, ...]. */
export function sectionPageIndex(pages) {
  const index = new Map();
  pages.forEach((page, pageIndex) => page.fragments.forEach(fragment => {
    if (!index.has(fragment.section)) index.set(fragment.section, []);
    index.get(fragment.section).push(pageIndex);
  }));
  return index;
}

/** The spread that shows a section's given part (1 = the page where it starts). */
export function spreadOf(pages, sectionId, part = 1, pageSize = 2) {
  const list = sectionPageIndex(pages).get(sectionId) || [0];
  const page = list[Math.min(Math.max(part, 1), list.length) - 1];
  return Math.floor(page / pageSize);
}

/** Group a flat list of page ranges into page fragments by section. */
export function pagesFromRanges(ranges, blockSections) {
  return ranges.map(([from, to]) => {
    const fragments = [];
    for (let i = from; i < to; i++) {
      const section = blockSections[i];
      const last = fragments.at(-1);
      if (last && last.section === section) last.to = i + 1;
      else fragments.push({section, from: i, to: i + 1});
    }
    return {from, to, fragments};
  });
}

/** The latest measurement, for checking the pagination in a browser. */
export let lastMeasure = null;

// A long block is cut into pieces of about a third of a page, so that the packer can
// fill the rest of a page before it (a scene's introduction, a word list's letter) and
// carry on onto the next page without a half-empty page.
const pieceOf = available => Math.max(120, Math.floor(available / 3));
// Space kept for the "continues" marks at the top and bottom of a page.
const MARK_SPACE = 100;
const SPLITTABLE = new Set(['DIV', 'SECTION', 'ASIDE', 'DL', 'OL', 'UL']);
const isHeading = element => /^H[2-4]$/.test(element.tagName);
const hidden = rect => rect.width === 0 && rect.height === 0;

/**
 * Split a block that is taller than a page into page-sized pieces. Stacked children
 * are packed like page blocks; side-by-side children (a dialogue beside its word
 * help) split the tallest column and keep the others with the first piece.
 * Pieces are shallow copies of the block, so its layout classes still apply.
 */
/** A long table continues on the next page between rows; its header row repeats. */
function splitTable(table, available, height) {
  const rows = [...table.tBodies].flatMap(body => [...body.rows]);
  const head = table.tHead, caption = table.caption;
  const top = table.getBoundingClientRect().top;
  const headSize = rows.length ? rows[0].getBoundingClientRect().top - top : 0;
  const room = Math.min(available, pieceOf(available)) - headSize;
  if (rows.length < 2 || room < 60) return [{node: table, height, heading: false}];
  const sizes = rows.map((row, i) => (i + 1 < rows.length ? rows[i + 1].getBoundingClientRect().top : table.getBoundingClientRect().bottom) - row.getBoundingClientRect().top);
  const groups = [];
  let from = 0, used = 0;
  sizes.forEach((size, i) => { if (i > from && used + size > room) { groups.push([from, i]); from = i; used = 0; } used += size; });
  groups.push([from, rows.length]);
  if (groups.length < 2) return [{node: table, height, heading: false}];
  return groups.map(([a, b], index) => {
    const copy = table.cloneNode(false);
    copy.dataset.flowPiece = '';
    if (index > 0) copy.removeAttribute('id');
    if (caption) copy.append(index === 0 ? caption : caption.cloneNode(true));
    if (head) copy.append(index === 0 ? head : head.cloneNode(true));
    let body = null, parent = null;
    for (const row of rows.slice(a, b)) {
      if (row.parentElement !== parent) { parent = row.parentElement; body = parent.cloneNode(false); copy.append(body); }
      body.append(row);
    }
    return {node: copy, height: headSize + sizes.slice(a, b).reduce((sum, size) => sum + size, 0), heading: false};
  });
}

function splitBlock(element, available, height) {
  const children = [...element.children];
  if (element.tagName === 'TABLE') return splitTable(element, available, height);
  // A wrapper around one long child (a scrolling table frame, a comparison box) splits
  // that child and repeats itself around each piece.
  if (SPLITTABLE.has(element.tagName) && children.length === 1 && !hidden(children[0].getBoundingClientRect())) {
    const inner = children[0].getBoundingClientRect().height;
    const pieces = splitBlock(children[0], available - Math.max(0, height - inner), inner);
    if (pieces.length < 2) {
      if (pieces[0].node !== children[0]) element.replaceChild(pieces[0].node, children[0]);
      return [{node: element, height, heading: isHeading(element)}];
    }
    return pieces.map((piece, index) => {
      const copy = element.cloneNode(false);
      copy.dataset.flowPiece = '';
      if (index > 0) copy.removeAttribute('id');
      copy.append(piece.node);
      return {node: copy, height: piece.height + Math.max(0, height - inner), heading: false};
    });
  }
  if (!SPLITTABLE.has(element.tagName) || children.length < 2) return [{node: element, height, heading: isHeading(element)}];
  // A wrapper with display: contents (a scene's word help) places its own children in
  // this block's layout, so its children are units of this block too.
  const leaves = [];
  children.forEach((child, order) => {
    const rect = child.getBoundingClientRect();
    if (hidden(rect) && child.children.length) [...child.children].forEach((inner, innerOrder) =>
      leaves.push({node: inner, wrapper: child, order: order + innerOrder / 1000, rect: inner.getBoundingClientRect()}));
    else leaves.push({node: child, order, rect});
  });
  const shown = leaves.filter(leaf => !hidden(leaf.rect)).sort((a, b) => a.rect.top - b.rect.top);
  const stacked = shown.every((leaf, i) => i === 0 || leaf.rect.top >= shown[i - 1].rect.bottom - 2);
  const bottom = element.getBoundingClientRect().bottom;
  if (!stacked) {
    let tallest = 0;
    const rects = children.map(child => child.getBoundingClientRect());
    rects.forEach((rect, i) => { if (rect.height > rects[tallest].height) tallest = i; });
    const pieces = splitBlock(children[tallest], available, rects[tallest].height);
    if (pieces.length < 2) {
      // The column may already be a rebuilt copy holding the moved content: put it back in place.
      if (pieces[0].node !== children[tallest]) element.replaceChild(pieces[0].node, children[tallest]);
      return [{node: element, height, heading: false}];
    }
    return pieces.map((piece, index) => {
      const copy = element.cloneNode(false);
      copy.dataset.flowPiece = '';
      if (index > 0) copy.removeAttribute('id');
      if (index === 0) children.forEach((child, i) => copy.append(i === tallest ? piece.node : child));
      else copy.append(piece.node);
      return {node: copy, height: piece.height, heading: false};
    });
  }
  // Units in visual order; hidden leaves (empty) travel with the first piece. A grid can
  // place children in another order than the source (a scene's word help above its
  // dialogue), so the pieces keep the visual order and flow as one column.
  const units = [];
  const reordered = shown.some((leaf, i) => i > 0 && leaf.order < shown[i - 1].order);
  shown.forEach((leaf, i) => {
    const own = Math.max(0, (i + 1 < shown.length ? shown[i + 1].rect.top : bottom) - leaf.rect.top);
    const parts = own > available && !leaf.wrapper ? splitBlock(leaf.node, available, own) : [{node: leaf.node, height: own, heading: isHeading(leaf.node)}];
    parts.forEach((part, j) => units.push({...part, wrapper: leaf.wrapper, order: (reordered ? i : leaf.order) + j / 1e6}));
  });
  const moved = units.some(unit => !unit.wrapper && !children.includes(unit.node));
  let ranges = packBlocks(units.map(unit => unit.height), units.map(unit => unit.heading), pieceOf(available));
  // Nothing to split here: keep the block itself, or one rebuilt copy when a nested
  // split already moved content into new pieces (the original would have lost it).
  if (ranges.length < 2 && !moved) return [{node: element, height, heading: false}];
  if (ranges.length < 2) ranges = [[0, units.length]];
  const empty = leaves.filter(leaf => hidden(leaf.rect));
  let counted = 0;
  return ranges.map(([from, to], index) => {
    const copy = element.cloneNode(false);
    copy.dataset.flowPiece = '';
    if (index > 0) copy.removeAttribute('id');
    if (reordered) copy.classList.add('is-split-flow');
    // A continued numbered list keeps its numbering.
    if (element.tagName === 'OL' && index > 0) copy.setAttribute('start', String((Number(element.getAttribute('start')) || 1) + counted));
    const part = units.slice(from, to).concat(index === 0 ? empty.map(leaf => ({...leaf, height: 0})) : []).sort((a, b) => a.order - b.order);
    counted += part.filter(unit => unit.node.tagName === 'LI').length;
    // Consecutive units of one wrapper share a wrapper copy; an interrupted run starts a new one.
    let source = null, current = null;
    const used = new Set();
    for (const unit of part) {
      if (!unit.wrapper) { copy.append(unit.node); source = current = null; continue; }
      if (unit.wrapper !== source) {
        current = unit.wrapper.cloneNode(false);
        if (index > 0 || used.has(unit.wrapper)) current.removeAttribute('id');
        used.add(unit.wrapper);
        source = unit.wrapper;
        copy.append(current);
      }
      current.append(unit.node);
    }
    return {node: copy, height: part.reduce((sum, unit) => sum + unit.height, 0), heading: false};
  });
}

function blockHeights(blocks) {
  const rects = blocks.map(block => block.getBoundingClientRect());
  const last = blocks.at(-1);
  const end = last ? rects.at(-1).bottom + parseFloat(getComputedStyle(last).marginBottom || 0) : 0;
  return blocks.map((block, i) => Math.max(0, (i + 1 < blocks.length ? rects[i + 1].top : end) - rects[i].top));
}

/** Measure the whole chapter as one flowing page and split it into pages. */
export function measureSections(pagesElement, html, shrink = 0) {
  const slot = pagesElement.querySelector(':scope > .flow-page, :scope > .paper-section');
  if (!slot) return null;
  const style = getComputedStyle(slot);
  const available = slot.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - MARK_SPACE;
  // Pieces of a long block may be cut a little shorter than a page (room for continuation marks).
  const pieceSize = available - shrink;
  const box = document.createElement('div');
  box.className = pagesElement.className.replace(/\bis-flowing\b/, '') + ' is-flowing flow-measure';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<div class="flow-page"></div>';
  const page = box.firstElementChild;
  page.style.width = slot.getBoundingClientRect().width + 'px';
  page.innerHTML = html;
  pagesElement.parentElement.append(box);
  const sections = [...page.querySelectorAll(':scope > .paper-section')].map(element => ({
    id: element.dataset.sectionId, element, body: element.querySelector(':scope > .paper-body'),
    title: element.querySelector('h2')?.textContent?.trim() || ''}));
  // All positions are read before any block is split or moved.
  const original = sections.flatMap(section => [...section.body.children]);
  const heights = blockHeights(original);
  let k = 0;
  for (const section of sections) {
    const units = [];
    for (const child of [...section.body.children]) {
      const own = heights[k++];
      if (own > pieceSize) units.push(...splitBlock(child, pieceSize, own));
      else units.push({node: child, height: own});
    }
    section.blocks = units.map(unit => unit.node);
    section.body.replaceChildren(...section.blocks);
  }
  // Lay out the split pieces once more; a piece that is still too tall (its estimate
  // missed a side column) is split again, at most twice. Then pack by real heights.
  let blocks = sections.flatMap(section => section.blocks);
  let finalHeights = blockHeights(blocks);
  for (let round = 0; round < 2 && finalHeights.some(h => h > pieceSize); round++) {
    let at = 0;
    for (const section of sections) {
      const units = [];
      for (const block of section.blocks) {
        const own = finalHeights[at++];
        units.push(...(own > pieceSize ? splitBlock(block, pieceSize, own).map(unit => unit.node) : [block]));
      }
      section.blocks = units;
      section.body.replaceChildren(...units);
    }
    blocks = sections.flatMap(section => section.blocks);
    finalHeights = blockHeights(blocks);
  }
  const sectionOf = sections.flatMap((section, index) => section.blocks.map(() => index));
  const headings = blocks.map(isHeading);
  const firstHeading = sections.map(section => section.blocks.findIndex(isHeading));
  let offset = 0;
  const keep = [], starts = [], breaks = [];
  sections.forEach((section, index) => {
    section.blocks.forEach((block, j) => {
      keep.push(headings[offset + j] || (firstHeading[index] >= 0 && j < firstHeading[index]));
      starts.push(j === 0);
      // The chapter opening is a page of its own, like a printed chapter start.
      breaks.push(j === 0 && index === 1 && sections[0].element.classList.contains('section-opening'));
    });
    offset += section.blocks.length;
  });
  const rules = {headings, keep, starts, breaks}, blockSections = sectionOf.map(index => sections[index].id);
  const pages = pagesFromRanges(packBlocks(finalHeights, rules, available), blockSections);
  return {box, page, sections, blocks, pages, available, heights: finalHeights, rules, blockSections,
    pageHeight: slot.clientHeight};
}

function fragmentElement(section, blocks, {continued, part, parts}) {
  const shell = section.element.cloneNode(false);
  const body = section.body.cloneNode(false);
  if (part > 1) {
    shell.id = section.element.id + '-osa-' + part;
    shell.removeAttribute('aria-labelledby');
    shell.setAttribute('aria-label', (section.title || 'Osio') + ' (jatkuu, osa ' + part + '/' + parts + ')');
  }
  if (continued) {
    const open = section.element.querySelector('.section-open') || section.blocks.find(block => block.matches?.('.section-open'));
    if (open && !blocks.includes(open)) body.append(open.cloneNode(true));
    const mark = document.createElement('p');
    mark.className = 'page-continued';
    mark.textContent = (section.title || 'Osio') + ' – jatkuu';
    body.append(mark);
  }
  body.append(...blocks);
  shell.append(body);
  shell.classList.add('is-fragment');
  return shell;
}

/** One page as it is shown: its section fragments and the continuation marks. */
function buildPage(pageIndex, pages, bySection, pagesOf, blocks, clone = false, folioText = defaultFolio) {
  const page = pages[pageIndex];
  const element = document.createElement('div');
  element.className = 'flow-page';
  page.fragments.forEach((fragment, j) => {
    const section = bySection.get(fragment.section);
    const list = pagesOf.get(fragment.section);
    const sectionPart = list.indexOf(pageIndex) + 1;
    const own = blocks.slice(fragment.from, fragment.to);
    element.append(fragmentElement(section, clone ? own.map(block => block.cloneNode(true)) : own,
      {continued: j === 0 && sectionPart > 1, part: sectionPart, parts: list.length}));
  });
  const list = pagesOf.get(page.fragments.at(-1).section);
  if (list.at(-1) > pageIndex) {
    const mark = document.createElement('p');
    mark.className = 'page-continues';
    mark.textContent = 'Jatkuu seuraavalla sivulla →';
    element.append(mark);
  }
  // One page number in the outer bottom corner, like a printed book. It sits in the page
  // margin, so it never takes room from the content.
  const number = folioText(pageFolioPosition(pageIndex, pages, pagesOf));
  if (number) {
    const folio = document.createElement('p');
    folio.className = 'page-folio';
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = number.label + ' ';
    folio.append(label, number.text);
    element.append(folio);
  }
  return element;
}

/**
 * Where a screen page starts: its first section and how far into that section
 * (0 at the section start, below 1 at its end), measured in blocks.
 */
export function pageFolioPosition(pageIndex, pages, pagesOf) {
  const first = pages[pageIndex].fragments[0];
  const own = pagesOf.get(first.section).flatMap(index => pages[index].fragments.filter(fragment => fragment.section === first.section));
  const from = Math.min(...own.map(fragment => fragment.from)), to = Math.max(...own.map(fragment => fragment.to));
  return {pageIndex, section: first.section, fraction: to > from ? (first.from - from) / (to - from) : 0};
}
/** Without a printed book the screen page is numbered on its own. */
function defaultFolio({pageIndex}) {
  return {text: String(pageIndex + 1), label: 'Sivu'};
}
/**
 * The printed page a screen page starts on. A section spanning several printed pages
 * is divided evenly by its blocks: an estimate, never past the section's last page.
 */
export function printedFolio(span, fraction) {
  if (!span) return null;
  const count = span.to - span.from + 1;
  return Math.min(span.to, span.from + Math.floor(Math.max(0, fraction) * count));
}

/**
 * Check the packed pages as they will be shown (with their continuation marks) and
 * pack again a little tighter when a page of several blocks would still overflow.
 * A page whose own block is taller than the page cannot be helped and is left to scroll.
 */
function verifiedPages(measured, bySection) {
  let {pages} = measured;
  const rules = {...measured.rules, breaks: [...measured.rules.breaks]};
  let single = 0, first = 0;
  // Each round moves the last block of the first overflowing page onto the next page.
  // Pages before it do not change, so checking resumes from that page.
  for (let round = 0; round < 40; round++) {
    const pagesOf = sectionPageIndex(pages);
    let fix = -1;
    for (let index = first; index < pages.length && fix < 0; index++) {
      const page = pages[index];
      // The measuring box lets pages grow to their content: compare that with the page.
      const probe = buildPage(index, pages, bySection, pagesOf, measured.blocks, true);
      probe.style.width = measured.page.style.width;
      measured.box.append(probe);
      const over = probe.offsetHeight - measured.pageHeight;
      probe.remove();
      if (over <= 1) continue;
      if (page.to - page.from < 2) {
        // One split piece per page: only splitting it smaller helps (see paginateSpread).
        // A large overflow is a picture or map taller than the page and is left to scroll.
        if (over <= 80 && measured.blocks[page.from].dataset?.flowPiece !== undefined) single = Math.max(single, over);
        continue;
      }
      let at = page.to - 1;
      while (at - 1 > page.from && rules.headings[at - 1]) at--;
      if (at > page.from && !rules.breaks[at]) { fix = at; first = index; }
    }
    if (fix < 0) break;
    rules.breaks[fix] = true;
    pages = pagesFromRanges(packBlocks(measured.heights, rules, measured.available), measured.blockSections);
  }
  return {pages, available: measured.available, single};
}

/**
 * Paginate the visible spread container. target = {section, part, point}.
 * Returns {pages, spread, spreads, sectionIds, first} or null when measuring is impossible.
 */
// The last chapter's pagination: turning a page in the same chapter, at the same page
// size, reuses it instead of measuring the whole chapter again.
let cached = null;
function textKey(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return text.length + ':' + hash.toString(36);
}

export function paginateSpread(pagesElement, html, {pageSize = 2, target = {}, folio = defaultFolio} = {}) {
  const slot = pagesElement.querySelector(':scope > .flow-page, :scope > .paper-section');
  const box = slot?.getBoundingClientRect();
  const key = box && [textKey(html), Math.round(box.width), slot.clientHeight, pageSize, document.documentElement.style.fontSize, getComputedStyle(slot).fontSize].join('|');
  let measured, checked, bySection;
  if (cached && key && cached.key === key) ({measured, checked, bySection} = cached);
  else {
    measured = measureSections(pagesElement, html);
    if (!measured) return null;
    bySection = new Map(measured.sections.map(section => [section.id, section]));
    checked = verifiedPages(measured, bySection);
    if (checked.single > 1) {
      // A page-sized piece plus its continuation marks did not fit: split once more, smaller.
      measured.box.remove();
      measured = measureSections(pagesElement, html, checked.single + 4);
      bySection = new Map(measured.sections.map(section => [section.id, section]));
      checked = verifiedPages(measured, bySection);
    }
    measured.box.remove();
    cached = key ? {key, measured, checked, bySection} : null;
  }
  const {blocks} = measured;
  const pages = checked.pages;
  measured.available = checked.available;
  const pagesOf = sectionPageIndex(pages);
  let part = target.part || 1;
  // A content point (a link to one task or model) opens the page that holds it.
  if (target.point) {
    const selector = '[data-content-point="' + CSS.escape(target.point) + '"]';
    const at = blocks.findIndex(block => block.matches?.(selector) || block.querySelector?.(selector));
    const pageIndex = pages.findIndex(page => page.from <= at && at < page.to);
    const list = pagesOf.get(target.section) || [];
    if (at >= 0 && list.includes(pageIndex)) part = list.indexOf(pageIndex) + 1;
  }
  const spreads = Math.max(1, Math.ceil(pages.length / pageSize));
  const spread = Math.min(spreads - 1, spreadOf(pages, target.section, part, pageSize));
  const shown = pages.slice(spread * pageSize, spread * pageSize + pageSize);
  // Pages are built from copies, so the measured chapter stays intact for the next turn.
  const pageElements = shown.map((page, i) => buildPage(spread * pageSize + i, pages, bySection, pagesOf, blocks, true, folio));
  if (pageElements.length < pageSize) {
    const blank = document.createElement('div');
    blank.className = 'flow-page paper-blank';
    blank.setAttribute('aria-hidden', 'true');
    pageElements.push(blank);
  }
  lastMeasure = {available: Math.round(measured.available), pages: pages.map(page => page.fragments.map(f => f.section + ':' + f.from + '-' + f.to)),
    heights: measured.heights.map(Math.round)};
  pagesElement.replaceChildren(...pageElements);
  pagesElement.classList.add('is-flowing');
  // Where each spread starts, as a section and its part: the address of the spread.
  const starts = Array.from({length: spreads}, (_, index) => {
    const fragment = pages[index * pageSize].fragments[0];
    return {section: fragment.section, part: pagesOf.get(fragment.section).indexOf(index * pageSize) + 1};
  });
  // The printed pages the shown screen pages start on, for the position in the top bar.
  const paperPages = shown.map((page, i) => folio(pageFolioPosition(spread * pageSize + i, pages, pagesOf))?.page).filter(Number.isInteger);
  return {pages, spread, spreads, starts, first: starts[spread], paperPages,
    sectionIds: [...new Set(shown.flatMap(page => page.fragments.map(fragment => fragment.section)))]};
}
