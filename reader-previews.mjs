import {escapeHtml as e,renderSection} from './content.mjs';
import {readingOrder,readerUrl,readerPageSize} from './routes.mjs';
import {hasPrintedSpreads,partSpreads,partOfPage,printedSpreadUrl,printedThumbnailHtml,sectionsOnPages,pageLabel} from './printed-spread.mjs';

export function chapterBrowserView(book,current,sections,selected,mode) {
  return '<p class="contents-eyebrow">Kirjan kaikki luvut</p><div class="chapter-browser">'+
    readingOrder(book).map(chapter=>{
      const active=chapter.id===current.id;
      const marker=chapter.label??chapter.number;
      return '<details class="preview-chapter" name="reader-chapters" data-preview-chapter="'+e(chapter.id)+'"'+(active?' open':'')+'>'+
        '<summary'+(active?' aria-current="page"':'')+'>'+
        (marker!==undefined?'<span class="contents-marker">'+e(marker)+'</span> ':'')+e(chapter.title)+'</summary>'+
        '<div class="preview-chapter-body"><a class="chapter-start" href="'+e(readerUrl(book.id,chapter.id,'',mode))+'">Avaa luvun alku</a>'+
        '<div class="chapter-preview-slot"><p class="muted">Esikatseluita ladataan…</p></div>'+
        (active?'<details class="contents-group"><summary>Osat tekstiluettelona</summary><ol class="section-links">'+sections.map(section=>
          '<li><a href="'+e(readerUrl(book.id,chapter.id,section.id,mode))+'"'+(section.id===selected?' aria-current="location"':'')+'>'+
          e(section.title.replace(/\*/g,'').replace(/^Avausaukeama$/,'Aloitus'))+'</a></li>').join('')+'</ol></details>':'')+
        '</div></details>';
    }).join('')+'</div>';
}

export function previewGroups(chapter,sections,selected,pageSize=2) {
  const size=readerPageSize(chapter,pageSize===1);
  const groups=[];
  for(let index=0;index<sections.length;index+=size) {
    const pages=sections.slice(index,index+size);
    groups.push({pages,selected:pages.some(page=>page.id===selected),label:(size===2?'Aukeama ':'Sivu ')+(groups.length+1)});
  }
  return groups;
}

function previewPage(section,chapter) {
  return renderSection(section,{
    chapter:section.id===chapter.sectionIds[0]?chapter:undefined,
    supportType:chapter.supportType,presentation:chapter.presentation,
    illustrationSlots:chapter.illustrationSlots,learningVisuals:chapter.learningVisuals,
    readerEdition:chapter.readerEdition,idPrefix:'thumbnail-'
  });
}

// These are miniature copies of the actual reader content. They stay inert,
// outside the link, and never participate in the reader's interactive tools.
export function createChapterBrowser(root,{loadSections,ResizeObserver:Observer}) {
  const document=root.ownerDocument;
  let context;
  const observer=new Observer(entries=>{
    for(const entry of entries) {
      const canvas=entry.target.firstElementChild;
      const width=canvas.classList.contains('preview-single')?600:1200;
      if(entry.contentRect.width>0)canvas.style.transform='scale('+(entry.contentRect.width/width)+')';
    }
  });
  // A printed book's thumbnails are its printed spreads, and each opens exactly that spread.
  function fillPrinted(detail,chapter,sections,owner) {
    const list=document.createElement('ol');
    list.className='spread-previews printed-previews';
    const titles=new Map(sections.map(section=>[section.id,section.title.replace(/\*/g,'').replace(/^Avausaukeama$/,'Aloitus')]));
    for(const pages of partSpreads(owner.book,chapter.id,owner.pageSize===1)) {
      const card=document.createElement('li');
      card.className='spread-preview-card';
      const frame=document.createElement('div');
      frame.className='spread-preview printed-preview';
      frame.innerHTML=printedThumbnailHtml(owner.book,pages);
      const link=document.createElement('a');
      link.className='spread-preview-link';
      const page=pages.find(item=>partOfPage(owner.book,item)===chapter.id)||pages[0];
      link.href=printedSpreadUrl(owner.book.id,partOfPage(owner.book,page)||chapter.id,page);
      if(owner.printed&&pages.includes(owner.printed[0]))link.setAttribute('aria-current','location');
      const label=document.createElement('span');
      label.className='preview-position';
      label.textContent=pageLabel(pages);
      const title=document.createElement('strong');
      title.textContent=sectionsOnPages(owner.book,pages).filter(row=>row.chapter===chapter.id).map(row=>titles.get(row.section)).filter(Boolean).join(' · ')||'Sanasto ja tukisivut';
      link.append(label,title);
      card.append(frame,link);
      list.append(card);
    }
    detail.querySelector('.chapter-preview-slot').replaceChildren(list);
    detail.dataset.previewLoaded='true';
  }
  function fill(detail,chapter,sections,owner) {
    if(owner.printed!==undefined&&hasPrintedSpreads(owner.book)){fillPrinted(detail,chapter,sections,owner);return;}
    const slot=detail.querySelector('.chapter-preview-slot');
    const list=document.createElement('ol');
    list.className='spread-previews';
    for(const group of previewGroups(chapter,sections,chapter.id===owner.chapter.id?owner.selected:'',owner.pageSize)) {
      const card=document.createElement('li');
      card.className='spread-preview-card';
      const frame=document.createElement('div');
      frame.className='spread-preview'+(group.pages.length===1?' is-single-preview':'');
      frame.setAttribute('aria-hidden','true');
      frame.setAttribute('inert','');
      const canvas=document.createElement('div');
      canvas.className='preview-canvas'+(group.pages.length===1?' preview-single':'');
      canvas.innerHTML=group.pages.map(section=>previewPage(section,chapter)).join('');
      for(const element of canvas.querySelectorAll('*')) {
        for(const attribute of [...element.attributes]) {
          if(['id','tabindex','for'].includes(attribute.name)||
            attribute.name.startsWith('data-')&&!['data-map-row','data-column-pair'].includes(attribute.name)) {
            element.removeAttribute(attribute.name);
          }
        }
        if(element.tagName==='IMG')element.setAttribute('loading','lazy');
      }
      frame.append(canvas);
      const link=document.createElement('a');
      link.className='spread-preview-link';
      link.href=readerUrl(owner.book.id,chapter.id,group.pages[0].id,owner.mode);
      if(group.selected)link.setAttribute('aria-current','location');
      const label=document.createElement('span');
      label.className='preview-position';
      label.textContent=group.label;
      const title=document.createElement('strong');
      title.textContent=group.pages.map(section=>section.title.replace(/\*/g,'').replace(/^Avausaukeama$/,'Aloitus')).join(' · ');
      link.append(label,title);
      card.append(frame,link);
      list.append(card);
      observer.observe(frame);
    }
    slot.replaceChildren(list);
    detail.dataset.previewLoaded='true';
  }
  async function load(detail) {
    const owner=context;
    if(!owner||detail.dataset.previewLoaded||detail.dataset.previewLoading)return;
    const chapter=readingOrder(owner.book).find(item=>item.id===detail.dataset.previewChapter);
    if(!chapter)return;
    detail.dataset.previewLoading='true';
    try {
      const loaded=await loadSections(owner.book,chapter,owner.abort.signal);
      if(context!==owner||owner.abort.signal.aborted||!detail.isConnected)return;
      if(loaded.book.id!==owner.book.id||loaded.book.version!==owner.book.version||
        loaded.book.sourceDigest!==owner.book.sourceDigest||loaded.chapter.id!==chapter.id) {
        throw new Error('Changed preview edition');
      }
      fill(detail,chapter,loaded.sections,owner);
    } catch(error) {
      if(context!==owner||owner.abort.signal.aborted||!detail.isConnected)return;
      const message=document.createElement('p');
      message.className='muted';
      message.textContent='Esikatselua ei saatu ladattua. Voit avata luvun alusta tai avata esikatselun uudelleen.';
      detail.querySelector('.chapter-preview-slot').replaceChildren(message);
    } finally {
      delete detail.dataset.previewLoading;
    }
  }
  root.addEventListener('toggle',event=>{
    if(event.target.matches?.('.preview-chapter')&&event.target.open)load(event.target);
  },true);
  return {
    clear() {context?.abort.abort();context=undefined;observer.disconnect();},
    mount(book,chapter,sections,selected,mode,pageSize,printed) {
      this.clear();
      // printed: the shown printed pages; null in a printed book's text view (thumbnails stay printed spreads).
      context={book,chapter,selected,mode,pageSize,printed:hasPrintedSpreads(book)?printed||null:undefined,abort:new AbortController()};
      const detail=[...root.querySelectorAll('.preview-chapter')].find(node=>node.dataset.previewChapter===chapter.id);
      if(detail)fill(detail,chapter,sections,context);
    },
    revealCurrent() {
      const panel=root.querySelector('#chapter-nav');
      const summary=panel?.querySelector('summary[aria-current="page"]');
      if(summary)panel.scrollTop=Math.max(0,summary.offsetTop-200);
      const selected=panel?.querySelector('.spread-preview-link[aria-current]')?.closest('.spread-preview-card');
      if(selected&&selected.getBoundingClientRect().bottom>panel.getBoundingClientRect().bottom) {
        panel.scrollTop+=selected.getBoundingClientRect().top-panel.getBoundingClientRect().top-80;
      }
    }
  };
}
