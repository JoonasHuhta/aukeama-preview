import {escapeHtml as e,renderMarkdown} from './content.mjs';
import {bookUrl,readerUrl,practiceUrl} from './routes.mjs';
import {createPracticeState,practiceFields,practiceStepFields,practiceActivities,practiceFileLimit} from './practice-state.mjs';

const textSizes=[100,125,150,175,200];
export function practiceLink(book,chapter) {
  return practiceActivities(book).filter(activity=>!chapter||chapter.id===activity.chapterId).map(activity=>
    '<a class="button" href="'+e(practiceUrl(book.id,activity.id))+'">Kokeile digityökirjaa: '+e(activity.title)+'</a>').join('');
}
export function practiceSectionLinks(book,chapter,sectionId) {
  return practiceActivities(book).filter(activity=>activity.chapterId===chapter.id).flatMap(activity=>{
  const sourceIds=activity.sources.filter(source=>source.sectionId===sectionId).map(source=>source.id);
  return activity.steps.filter(step=>step.sources.some(id=>sourceIds.includes(id))).map(step=>({
    href:practiceUrl(book.id,activity.id,step.id),
    title:step.title
  }));});
}
export function practiceInvitation(book) {
  const activities=practiceActivities(book);
  return activities.length?'<section class="practice-invitation" id="digitehtavat" tabindex="-1"><h2>Kokeile digityökirjaa</h2>'+activities.map(activity=>
    '<article><h3>'+e(activity.title)+'</h3><p>'+e(activity.intro)+'</p><a class="button" href="'+e(practiceUrl(book.id,activity.id))+'">Avaa harjoitus<span class="sr-only">: '+e(activity.title)+'</span></a></article>').join('')+'</section>':'';
}
function storageMessage(state) {
  return ({saved:'Tallennettu tähän selaimeen.',temporary:'Työ säilyy tässä välilehdessä. Ota työ talteen ennen sulkemista.',
    unavailable:'Selaimen tallennusta ei voitu lukea. Voit harjoitella ja ottaa työn tiedostona talteen.',
    failed:'Tallennus epäonnistui. Ota nykyinen työ tiedostona talteen.',
    conflict:'Työ on muuttunut toisessa välilehdessä. Ota tämä työ tiedostona talteen. Toisen välilehden tallenne säilyi.',
    'remove-failed':'Selaimen tallennetta ei voitu poistaa. Se voi yhä näkyä samalla laitteella.'})[state.status];
}
function feedback(field,checked) {
  if(!checked)return '';
  return e(({empty:'Kirjoita ensin hinta.',format:'Kirjoita hinta numeroina, esimerkiksi 3 tai 3,00. Euromerkin saa lisätä.',
    correct:field.check.correct,retry:field.check.retry})[checked.result]);
}
export function practiceSummary(book,activity,document,{idPrefix='',title='Oman työn yhteenveto',headingLevel=2}={}) {
  const id=e(idPrefix+'practice-summary'),titleId=e(idPrefix+'practice-summary-title');
  const heading=headingLevel===4?'h4':'h2',stepHeading=headingLevel===4?'h5':'h3';
  return '<section id="'+id+'" class="practice-summary" aria-labelledby="'+titleId+'"><'+heading+' id="'+titleId+'">'+e(title)+'</'+heading+'><p>'+e(book.title)+' · '+e(book.version)+' · '+e(activity.title)+
    '</p>'+activity.steps.map(step=>'<'+stepHeading+'>'+e(step.title)+'</'+stepHeading+'><dl>'+step.fields.map(field=>'<dt>'+e(field.label)+'</dt><dd'+(field.language&&document.answers[field.id]?' lang="'+e(field.language)+'"':'')+'>'+e(field.type==='check'?(document.answers[field.id]?'Kokeilin (oma merkintä)':'Ei merkintää'):
    document.answers[field.id]||'Ei vastausta')+'</dd>').join('')+'</dl>'+
    (step.continueFields?.length?'<p>Tämän vaiheen muutokset ovat samassa vastauksessa yllä.</p>':'')+
    (document.hints.includes(step.id)?'<p>Käytin vihjettä.</p>':'')+(document.models.includes(step.id)?'<p>Katsoin esimerkkiä.</p>':'')+
    step.fields.filter(f=>document.checks[f.id]).map(f=>'<p>Hintatarkistus · '+e(f.label)+': '+feedback(f,document.checks[f.id])+'</p>').join('')).join('')+
    '<p>Yhteenveto kuvaa omaa harjoittelua. Se ei ole arvosana tai todistus osaamisesta.</p></section>';
}
export function practiceReadableDocument(book,activity,document) {
  return '<!doctype html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Oma työ – '+e(activity.title)+'</title><style>'+ 
    'body{font:17px/1.6 system-ui,sans-serif;color:#20252b;margin:32px auto;padding:0 24px;max-width:76ch}'+
    'h1,h2,h3{color:#214780;line-height:1.3}h2{font-size:28px}h3{font-size:21px;margin-top:32px}'+
    'dt{font-weight:600;margin-top:18px}dd{margin:8px 0 24px;white-space:pre-wrap;overflow-wrap:anywhere}'+
    '.export-note{border-bottom:1px solid #d4d8dd;padding-bottom:20px}'+
    '@page{size:A4;margin:18mm}@media print{body{font-size:12pt;margin:0;padding:0;max-width:none}'+
    '.export-note{display:none}h2,h3,dt{break-after:avoid}dd{orphans:3;widows:3}}'+
    '</style></head><body><p class="export-note">Oma työ. Voit tulostaa tämän yhteenvedon selaimen Tulosta-toiminnolla. Työn jatkamiseen Aukeamassa tarvitaan erillinen JSON-vastaustiedosto.</p>'+
    '<main>'+practiceSummary(book,activity,document)+'</main></body></html>';
}
export function practiceView(book,activity,index,state,ui={}) {
  const step=activity.steps[index],value=state.document;
  const reuseLanguage=practiceFields(activity).find(f=>f.id===step.reuseField)?.language;
  const textSize=textSizes.includes(ui.textSize)?ui.textSize:100;
  return '<div class="page practice-page" data-text-size="'+textSize+'"><nav class="breadcrumbs" aria-label="Sijainti"><a href="'+e(bookUrl(book.id))+'">'+e(book.title)+' · Materiaalit</a></nav>'+
    '<header class="practice-heading"><p class="eyebrow">Työkirja · paikallinen kokeilu</p><h1>'+e(activity.title)+'</h1><p>'+e(activity.intro)+'</p></header>'+
    '<div class="practice-settings"><label for="practice-text-size">Tekstikoko</label><select id="practice-text-size">'+textSizes.map(size=>'<option value="'+size+'"'+(size===textSize?' selected':'')+'>'+size+' %</option>').join('')+'</select><a href="#practice-summary" data-practice-summary>Oman työn yhteenveto</a></div>'+
    '<nav class="practice-steps" aria-label="Harjoittelun vaiheet">'+activity.steps.map((s,i)=>'<a href="'+e(practiceUrl(book.id,activity.id,s.id))+'"'+
      (i===index?' aria-current="step"':'')+'><span aria-hidden="true">'+(i+1)+'</span>'+e(s.title)+'</a>').join('')+'</nav>'+
    '<div class="practice-saving"><p id="practice-save-status" role="status">'+storageMessage(state)+'</p><details><summary>Työn säilytys</summary><label class="practice-choice"><input id="practice-persist" type="checkbox"'+(state.persistent?' checked':'')+'> Tallenna tähän selaimeen</label>'+
    '<p>Samalla laitteella ja selainprofiililla muut voivat nähdä työn. Selain voi poistaa tallenteen. Eri osoitteissa tai laitteissa työ ei siirry automaattisesti. Nimeä tai tunnusta ei tarvita.</p></details></div>'+
    '<section class="practice-work" aria-labelledby="practice-step-title"><p class="muted">Vaihe '+(index+1)+' / '+activity.steps.length+'</p><h2 id="practice-step-title" tabindex="-1"><span class="practice-marker" aria-hidden="true">'+(index+1)+'</span>'+e(step.title)+'</h2><p>'+e(step.instruction)+'</p>'+
    '<div class="practice-columns"><div class="practice-source" role="group" aria-label="Tehtävän lähde"><details class="practice-source-panel" data-practice-source-panel'+
    (ui.sourceOpen===false?'':' open')+'><summary>Lähde ja tekstikirja</summary><div class="practice-source-content">'+step.sources.map(id=>{
      const source=activity.sources.find(s=>s.id===id);
      return '<section><h3>'+e(source.title)+'</h3><div class="practice-source-body">'+renderMarkdown(source.markdown,{dialogue:source.kind==='dialogue',dialogueLanguage:source.dialogueLanguage}).replace(/<a href="(#\/books\/[^\"]+\/read\/[^\"]+)"/g,'<a data-practice-source href="$1"')+'</div>'+
        '<a data-practice-source href="'+e(readerUrl(book.id,activity.chapterId,source.sectionId,'chapter',source.point))+'">Lue lähde tekstikirjassa</a></section>';
    }).join('')+'<p class="muted">Voit lukea tekstin. Äänitettä ei vielä ole.</p></div></details></div><div class="practice-response">'+
    (step.kind==='roles'?'<section class="practice-reuse"><h3>Sama oma tilauksesi</h3><p id="practice-reused-order"'+(reuseLanguage&&value.answers[step.reuseField]?' lang="'+e(reuseLanguage)+'"':'')+'>'+e(value.answers[step.reuseField]||'Voit käyttää paperille tehtyä tilaustasi tai palata kirjoittamaan oman tilauksen.')+'</p><a href="'+e(practiceUrl(book.id,activity.id,activity.steps[1].id))+'">Muokkaa omaa tilausta</a></section>'+
      step.roles.map((role,i)=>'<details class="practice-role"'+((ui.role||0)===i?' open':'')+'><summary>'+e(role.title)+'</summary><ol>'+role.lines.map(line=>'<li>'+e(line)+'</li>').join('')+'</ol></details>').join(''):'')+
    (step.continueFields?.length?'<p class="practice-continuity">Jatkat samaa vastausta. Aiempi tekstisi on valmiina alla.</p>':'')+
    '<form id="practice-form">'+practiceStepFields(activity,step).map(field=>{
      const id='practice-field-'+field.id;
      if(field.type==='check')return '<label class="practice-choice"><input id="'+id+'" data-practice-field="'+field.id+'" type="checkbox"'+(value.answers[field.id]?' checked':'')+'>'+e(field.label)+'</label>';
      return '<div class="practice-field"><label for="'+id+'">'+e(field.label)+'</label>'+(field.type==='money'?'<input id="'+id+'" data-practice-field="'+field.id+'" type="text" inputmode="decimal" maxlength="24" value="'+e(value.answers[field.id])+'"'+
        (field.check?' aria-describedby="practice-feedback-'+field.id+'"':'')+'>':'<textarea id="'+id+'" data-practice-field="'+field.id+'"'+(field.language?' lang="'+e(field.language)+'"':'')+' rows="'+(field.rows||4)+'" maxlength="2000">'+e(value.answers[field.id])+'</textarea>')+
        (field.check?'<button type="button" data-practice-check="'+field.id+'">Tarkista hinta</button><p id="practice-feedback-'+field.id+'" class="practice-feedback" role="status">'+feedback(field,value.checks[field.id])+'</p>':'')+'</div>';
    }).join('')+'</form>'+
    (step.kind==='roles'?'<p>Merkinnät ovat omia havaintojasi. Yksin valmistelu ei merkitse keskustelua käydyksi.</p>':'')+
    (step.hint?'<details data-practice-help="hints"><summary>Vihje</summary><p>'+e(step.hint)+'</p></details>':'')+
    (step.model?'<details data-practice-help="models"><summary>Näytä esimerkki</summary><p>'+e(step.model.text)+'</p><p>'+e(step.model.review)+'</p></details>':'')+
    '</div></div></section><nav class="practice-next" aria-label="Vaiheen vaihto">'+(index?'<a class="button" href="'+e(practiceUrl(book.id,activity.id,activity.steps[index-1].id))+'">← Edellinen vaihe</a>':'<a href="'+e(bookUrl(book.id))+'">Kirjan materiaaleihin</a>')+
    (index+1<activity.steps.length?'<a class="button primary" href="'+e(practiceUrl(book.id,activity.id,activity.steps[index+1].id))+'">Seuraava vaihe →</a>':'<a class="button" href="#practice-summary" data-practice-summary>Näytä oma yhteenveto</a>')+'</nav>'+
    '<section class="practice-transfer"><h2>Ota työ talteen</h2><p>Vastaustiedostosta voit jatkaa työtä tässä samassa sisältöversiossa. Luettavan yhteenvedon voit näyttää tai tulostaa. Tarkista ladattu tiedosto ennen sivun sulkemista.</p><div class="actions"><button id="practice-export" type="button">Lataa vastaustiedosto</button><button id="practice-readable" type="button">Lataa luettava yhteenveto</button><button id="practice-print" type="button">Tulosta yhteenveto</button></div>'+
    '<label for="practice-import">Tuo aiempi vastaustiedosto (JSON, enintään 64 kt)</label><input id="practice-import" type="file" accept=".json,application/json"><p id="practice-transfer-status" role="status" tabindex="-1"></p><div id="practice-import-preview"></div>'+
    '<details><summary>Poista tämän kokeilun työ</summary><p>Poistaa tämän sisältöversion vastaukset tästä näkymästä ja selaimesta. Ladatut tiedostot ja muut harjoitukset säilyvät.</p><button id="practice-clear" type="button">Poista tämän kokeilun vastaukset</button></details></section>'+
    '<div id="practice-summary-slot">'+practiceSummary(book,activity,value)+'</div></div>';
}

// Focus and the visible reading position travel together, including on a small screen.
export function focusPracticeTarget(root,id='') {
  const requested=id&&root.querySelector('#'+id);
  const target=requested||root.querySelector('#practice-step-title');
  if(!target)return;
  target.focus({preventScroll:true});
  const context=requested?(target.closest('.practice-field, .practice-choice')||target):
    (root.querySelector('.practice-work')||target);
  context.scrollIntoView({block:requested?'center':'start',inline:'nearest'});
}

export function createPracticeWorkspace(root,{getStorage,window:win}) {
  const stores=new Map();let current,returnTo,textSize=100;
  let sourceOpen=win.matchMedia?.('(min-width: 761px)')?.matches??true;
  const q=selector=>root.querySelector(selector);
  function download(text,type,filename) {
    const url=win.URL.createObjectURL(new win.Blob([text],{type})),link=win.document.createElement('a');
    link.href=url;link.download=filename;link.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),10000);
  }
  function refreshStatus(){const node=q('#practice-save-status');if(current&&node){const next=storageMessage(current.store.get());if(node.textContent!==next)node.textContent=next;}}
  function refreshSummary(){if(current&&q('#practice-summary-slot'))q('#practice-summary-slot').innerHTML=practiceSummary(current.book,current.activity,current.store.get().document);}
  // entry: arriving from outside the activity shows its title, intro and steps first.
  function mount(book,activity,stepId,{focus=true,entry=false}={}) {
    const index=stepId?activity.steps.findIndex(s=>s.id===stepId):0;if(index<0)return false;
    const key=[book.id,book.version,activity.id,activity.revision].join('/');
    if(!stores.has(key))stores.set(key,createPracticeState(getStorage,book,activity));
    current={book,activity,index,store:stores.get(key)};
    root.innerHTML=practiceView(book,activity,index,current.store.get(),{textSize,sourceOpen});
    const returnField=returnTo?.url===practiceUrl(book.id,activity.id,activity.steps[index].id)?returnTo.field:'';
    returnTo=undefined;
    const heading=entry&&!returnField&&q('.practice-heading h1');
    if(focus&&heading){heading.tabIndex=-1;heading.focus({preventScroll:true});win.scrollTo?.(0,0);}
    else if(focus)focusPracticeTarget(root,returnField);
    return true;
  }
  function active(){return current&&q('.practice-page');}
  root.addEventListener('input',event=>{
    if(!active()||!event.target.dataset.practiceField)return;
    const id=event.target.dataset.practiceField;
    current.store.set(id,event.target.type==='checkbox'?event.target.checked:event.target.value);
    const message=q('#practice-feedback-'+id);if(message)message.textContent='';
    refreshStatus();refreshSummary();
  });
  // Save messages are readable but not announced on every keystroke.
  root.addEventListener('change',async event=>{
    if(!active())return;
    if(event.target.id==='practice-text-size') {
      const selected=Number(event.target.value);
      if(textSizes.includes(selected)){
        textSize=selected;q('.practice-page').setAttribute('data-text-size',String(textSize));
      }
    } else if(event.target.id==='practice-persist') {
      current.store.persist(event.target.checked);event.target.checked=current.store.get().persistent;refreshStatus();
    } else if(event.target.id==='practice-import') {
      const owner=current,file=event.target.files?.[0];if(!file)return;
      const attempt={};owner.importAttempt=attempt;
      const isCurrent=()=>owner===current&&active()&&owner.importAttempt===attempt;
      const status=q('#practice-transfer-status');q('#practice-import-preview').replaceChildren();owner.pending=null;
      event.target.value='';status.textContent='Luetaan vastaustiedostoa…';
      try{
        if(file.size>practiceFileLimit)throw new Error('Tiedosto on liian suuri (enintään 64 kt).');
        const raw=await file.text();if(!isCurrent())return;
        owner.pending=owner.store.parse(raw);
        q('#practice-import-preview').innerHTML='<h3 id="practice-import-title" tabindex="-1">Tarkista tuotava työ</h3><p>Valittu tiedosto: <strong>'+e(file.name||'Vastaustiedosto')+'</strong></p><p>Tuonti korvaa tämän kokeilun nykyiset vastaukset. Voit ladata nykyisen työn ensin talteen.</p>'+
          practiceSummary(owner.book,owner.activity,owner.pending,{idPrefix:'import-',title:'Tuotavan työn yhteenveto',headingLevel:4})+
          '<div class="actions"><button id="practice-import-confirm" type="button">Korvaa tämän kokeilun työ</button><button id="practice-import-cancel" type="button">Peruuta tuonti</button></div>';
        status.textContent='Tiedosto tarkistettu. Hyväksy korvaaminen tai peruuta.';
        focusPracticeTarget(root,'practice-import-title');
      } catch(error){if(isCurrent())status.textContent=error instanceof SyntaxError?'Tiedosto ei ole kelvollinen JSON-vastaustiedosto. Nykyinen työ säilyi.':error.message;}
    }
  });
  root.addEventListener('toggle',event=>{
    if(!active())return;
    if(event.target.dataset.practiceSourcePanel!==undefined){sourceOpen=event.target.open;return;}
    if(!event.target.open||!event.target.dataset.practiceHelp)return;
    current.store.use(current.activity.steps[current.index].id,event.target.dataset.practiceHelp);refreshStatus();refreshSummary();
  },true);
  root.addEventListener('submit',event=>{if(event.target.id==='practice-form')event.preventDefault();});
  root.addEventListener('click',event=>{
    if(!active())return;
    const source=event.target.closest('[data-practice-source]');
    if(source&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0) {
      returnTo={bookId:current.book.id,version:current.book.version,url:practiceUrl(current.book.id,current.activity.id,current.activity.steps[current.index].id),
        field:current.field||'practice-field-'+practiceStepFields(current.activity,current.activity.steps[current.index])[0].id};
    }
    if(event.target.closest('[data-practice-summary]')){event.preventDefault();refreshSummary();q('#practice-summary-title').tabIndex=-1;q('#practice-summary-title').focus();q('#practice-summary').scrollIntoView();}
    const button=event.target.closest('button');if(!button)return;
    const owner=current;
    if(button.dataset.practiceCheck) {
      const id=button.dataset.practiceCheck,field=practiceFields(owner.activity).find(f=>f.id===id);
      owner.store.check(id);q('#practice-feedback-'+id).innerHTML=feedback(field,owner.store.get().document.checks[id]);refreshStatus();refreshSummary();
    } else if(button.id==='practice-export') {
      download(owner.store.export(),'application/json',owner.book.id+'-'+owner.activity.id+'-vastaukset.json');
      q('#practice-transfer-status').textContent='Lataus käynnistetty. Tarkista tiedosto latauksista; voit tuoda sen takaisin ennen sulkemista.';
      // Starting a download cannot prove that the file was saved; keep the unsaved-work warning.
    } else if(button.id==='practice-readable') {
      download(practiceReadableDocument(owner.book,owner.activity,owner.store.get().document),'text/html;charset=utf-8',owner.book.id+'-'+owner.activity.id+'-oma-tyo.html');
      q('#practice-transfer-status').textContent='Luettavan HTML-yhteenvedon lataus käynnistetty. Avaa tiedosto selaimessa lukemista ja tulostamista varten. Työn palauttamiseen tarvitset JSON-vastaustiedoston.';
    } else if(button.id==='practice-print'){
      refreshSummary();q('#practice-transfer-status').textContent='Tulostuspyyntö lähetetty selaimeen. Jos tulostusikkuna ei avaudu, voit ladata luettavan yhteenvedon.';
      win.setTimeout(()=>win.print(),0);
    }
    else if(button.id==='practice-clear') {
      if(win.confirm('Poistetaanko tämän kokeilun työ tästä näkymästä ja selaimesta? Ladatut tiedostot säilyvät.')) {
        const ok=owner.store.clear();if(ok)mount(owner.book,owner.activity,owner.activity.steps[owner.index].id);else refreshStatus();
      }
    } else if(button.id==='practice-import-cancel'){owner.importAttempt=undefined;owner.pending=null;q('#practice-import-preview').replaceChildren();q('#practice-transfer-status').textContent='Tuonti peruttu. Nykyinen työ säilyi.';focusPracticeTarget(root,'practice-import');}
    else if(button.id==='practice-import-confirm'&&owner.pending){owner.store.replace(owner.pending);mount(owner.book,owner.activity,owner.activity.steps[owner.index].id,{focus:false});q('#practice-transfer-status').textContent='Vastaukset tuotu. '+storageMessage(owner.store.get());focusPracticeTarget(root,'practice-transfer-status');}
  });
  root.addEventListener('focusin',event=>{if(active()&&event.target.dataset.practiceField)current.field=event.target.id;});
  win.addEventListener('beforeunload',event=>{if([...stores.values()].some(store=>store.get().dirty)){event.preventDefault();event.returnValue='';}});
  return {mount,returnLink(book){return returnTo?.bookId===book.id&&returnTo.version===book.version?
    '<div class="practice-return"><a class="button" href="'+e(returnTo.url)+'">← Takaisin omaan tehtävään</a><span>Oma vastauksesi säilyy avoimessa työtilassa.</span></div>':'';}};
}
