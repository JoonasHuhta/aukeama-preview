import {escapeHtml as e} from './html.mjs';
import {bookUrl,examUrl} from './routes.mjs';
import {validateEditorBank,newExamDraft,validateExamDraft,reviewExamImport,editExamDraft,composeExamProof,examBalance,swapCandidates,skillLabels} from './assessment-editor.mjs';

export function examLink(book) {
  return book.localAssessment ? '<section class="exam-invitation"><h2>Kokoa koe</h2><p>Valitse tehtävät, järjestä koepaperi ja säädä vastaustilaa. Paikallinen kokeilu sisältää '+book.localAssessment.tasks.length+' tehtäväluonnosta.</p><a class="button" href="'+examUrl(book.id)+'">Avaa koetyökalu</a></section>' : '';
}
const buttons = (action, label, id='', disabled=false) => '<button type="button" data-exam-action="'+action+'"'+(id?' data-task="'+e(id)+'"':'')+(disabled?' disabled':'')+'>'+e(label)+'</button>';
export function examPaper(proof, book) {
  const teacher = proof.audience === 'teacher';
  return '<article class="exam-paper" aria-label="'+(teacher?'Opettajan arviointiohje':'Oppilaan koepaperi')+'"><header class="exam-paper-heading">'+
    '<p class="exam-proof-label">Aukeama · '+(teacher?'Opettajan arviointiohje':'Oppilaan koepaperi')+' · Luonnos</p><h2>'+e(proof.title)+'</h2><p>'+e(book.title)+'</p>'+
    (!teacher?'<p class="exam-name-lines"><span>Nimi: ________________________</span> <span>Ryhmä: __________</span> <span>Päivä: __________</span></p>':'<p>Sisäinen tehtäväluonnos. Tarkista tehtävien soveltuvuus opetettuun sisältöön ja arviointiperusteet ennen käyttöä.</p>')+
    '<p>Yhteensä '+proof.totalPoints+' pistettä</p></header>'+
    (proof.items.length?proof.items.map((item,index)=>'<section class="exam-paper-task'+(item.pageBreakBefore&&index?' exam-page-break':'')+'">'+
      '<div class="exam-task-start"><h3><span class="exam-number">'+(index+1)+'</span> '+e(item.title)+' <span class="exam-points">/ '+item.points+' p</span></h3><p>'+e(item.instruction)+'</p>'+
      (item.stimulus?'<div class="exam-stimulus" lang="'+e(book.language||'sv')+'">'+e(item.stimulus)+'</div>':'')+'</div>'+
      '<ol class="exam-questions">'+item.questions.map((question,questionIndex)=>'<li'+(!teacher&&item.answerLines===1&&item.skill==='reading'?' class="exam-inline"':'')+'><p><strong class="exam-question-number">'+(index+1)+'.'+(questionIndex+1)+'</strong> '+e(question)+'</p>'+(!teacher?'<div class="exam-answer-space" role="img" aria-label="'+item.answerLines+(item.answerLines===1?' vastausrivi':' vastausriviä')+'">'+Array.from({length:item.answerLines},()=>'<div class="exam-answer-line" aria-hidden="true"></div>').join('')+'</div>':'')+'</li>').join('')+'</ol>'+
      (teacher?'<div class="exam-scoring"><h4>Arviointiperuste · tehtävä '+(index+1)+'</h4><p>'+e(item.scoringGuide)+'</p><p><strong>Tavoite:</strong> '+e(item.goal)+'</p><p><strong>Tuki:</strong> '+e(item.support)+'</p><p><strong>Vaativuus:</strong> '+e(item.demand)+'</p></div>':'')+'</section>').join(''):
      '<p class="exam-empty">Lisää ensimmäinen tehtävä vasemman puolen valikoimasta. Koepaperi rakentuu tähän.</p>')+'</article>';
}
/*
 * An exam usually covers a run of chapters (for example 4–5), so the selection is
 * filtered by a first and last chapter in book order. Either end may stay open.
 */
const bankChapters = (book, bank) => book.chapters.filter(c => bank.tasks.some(t => t.chapterId === c.id));
export function inChapterRange(book, bank, chapterId, from = '', to = '') {
  const ids = bankChapters(book, bank).map(c => c.id), at = ids.indexOf(chapterId);
  const start = from ? ids.indexOf(from) : 0, end = to ? ids.indexOf(to) : ids.length - 1;
  return at >= 0 && at >= Math.min(start, end) && at <= Math.max(start, end);
}
export function chapterRangeHtml(book, bank, from = '', to = '') {
  const options = (selected, empty) => '<option value="">' + empty + '</option>' + bankChapters(book, bank).map(c =>
    '<option value="' + e(c.id) + '"' + (selected === c.id ? ' selected' : '') + '>' + e((c.label ?? c.number ?? '') + ' · ' + c.title) + '</option>').join('');
  return '<label>Luvusta<select id="exam-from">' + options(from, 'Ensimmäisestä') + '</select></label>' +
    '<label>Lukuun<select id="exam-to">' + options(to, 'Viimeiseen') + '</select></label>';
}
/** Another draft of the same chapter and skill can take a chosen task's place. */
export function swapHtml(draft, bank, task) {
  const options = swapCandidates(draft, bank, task.id);
  return options.length ? '<label class="exam-swap">Vaihda saman luvun ja taidon tehtävään<select data-exam-swap="' + e(task.id) + '"><option value="">Valitse…</option>' +
    options.map(t => '<option value="' + e(t.id) + '">' + e(t.title) + ' · ' + t.points + ' p</option>').join('') + '</select></label>' : '';
}
/** Coverage of the chosen tasks and composition warnings. Sums and counts only. */
export function balanceHtml(balance, book) {
  if (!balance.chapters.length) return '<p>Valitse ensin tehtäviä.</p>';
  const chapterName = id => { const c = book.chapters.find(item => item.id === id); return (c.label ?? c.number ?? '') + ' · ' + c.title; };
  const count = n => n + (n === 1 ? ' tehtävä' : ' tehtävää');
  return '<h3 class="exam-balance-title">Mitä koe kattaa</h3><ul class="exam-balance">' +
    balance.chapters.map(row => '<li><span>' + e(chapterName(row.chapterId)) + '</span><span>' + count(row.tasks) + ' · ' + row.points + ' p</span></li>').join('') + '</ul>' +
    '<ul class="exam-balance">' + balance.skills.map(row => '<li><span>' + e(skillLabels[row.skill]) + '</span><span>' + row.points + ' p</span></li>').join('') + '</ul>' +
    (balance.warnings.length ? '<div class="exam-warnings" role="note"><p><strong>Tarkista koosteesta</strong></p><ul>' +
      balance.warnings.map(w => '<li data-warning="' + e(w.kind) + '">' + e(w.text) + '</li>').join('') + '</ul></div>' : '');
}
function taskCard(task, selected, book) {
  const chapter=book.chapters.find(c=>c.id===task.chapterId);
  return '<article class="exam-task-card" data-bank-task="'+e(task.id)+'"><p class="exam-task-meta">'+e((chapter.label??chapter.number??'')+' · '+chapter.title)+' · '+e(skillLabels[task.skill])+'</p><h3 tabindex="-1">'+e(task.title)+'</h3><p>'+e(task.goal)+'</p>'+
    '<p class="exam-task-meta">'+task.points+' p · noin '+task.minutes+' min</p><details><summary>Tehtävä, tuki ja arviointi</summary><p>'+e(task.instruction)+'</p>'+
    (task.stimulus?'<div class="exam-stimulus" lang="'+e(book.language||'sv')+'">'+e(task.stimulus)+'</div>':'')+
    '<ol>'+task.questions.map(q=>'<li>'+e(q)+'</li>').join('')+'</ol><p><strong>Vaativuus:</strong> '+e(task.demand)+'</p><p><strong>Tuki:</strong> '+e(task.support)+'</p><p><strong>Pisteytys:</strong> '+e(task.scoringGuide)+'</p></details>'+
    buttons('add',selected?'Lisätty kokeeseen':'Lisää kokeeseen',task.id,selected)+'</article>';
}
export function createExamWorkspace(root,{window:win}) {
  const sessions=new Map();
  let book,bank,state,pending,loadToken=0;
  const active=()=>root.querySelector('.exam-workspace');
  const say=message=>{const live=root.querySelector('#exam-status');if(live)live.textContent=message;};
  const proof=()=>composeExamProof(state.draft,bank,state.audience);
  function showPaper() {
    const result=proof();
    root.querySelector('#exam-paper-slot').innerHTML=examPaper(result,book);
    root.querySelector('#exam-total').textContent=result.items.length+(result.items.length===1?' tehtävä':' tehtävää')+' · '+result.totalPoints+' p · työarvio '+result.estimatedMinutes+' min';
    root.querySelector('#exam-coverage').innerHTML=balanceHtml(examBalance(state.draft,bank),book);
    root.querySelector('#exam-print').disabled=!result.items.length;
    root.querySelector('#exam-learner').setAttribute('aria-pressed',String(state.audience==='learner'));
    root.querySelector('#exam-teacher').setAttribute('aria-pressed',String(state.audience==='teacher'));
    root.querySelector('#exam-print').textContent=state.audience==='teacher'?'Tulosta opettajan ohje':'Tulosta oppilaan koe';
  }
  function showBank() {
    const tasks=bank.tasks.filter(t=>inChapterRange(book,bank,t.chapterId,state.from,state.to)&&(!state.skill||t.skill===state.skill));
    root.querySelector('#exam-task-list').innerHTML=tasks.map(t=>taskCard(t,state.draft.items.some(i=>i.taskId===t.id),book)).join('')||'<p>Rajauksella ei löytynyt tehtäviä. Vaihda lukua tai taitoa.</p>';
    root.querySelector('#exam-count').textContent=tasks.length+' tehtäväluonnosta';
  }
  function showSelection(focus) {
    root.querySelector('#exam-panel-selection').textContent='Valitut tehtävät ('+state.draft.items.length+')';
    root.querySelector('#exam-selected').innerHTML=state.draft.items.length?'<ol>'+state.draft.items.map((item,i)=>{
      const task=bank.tasks.find(t=>t.id===item.taskId);
      return '<li data-selected-task="'+e(item.taskId)+'"><h3>'+e(task.title)+'</h3><div class="exam-order-actions">'+buttons('up','Ylös',task.id,i===0)+buttons('down','Alas',task.id,i===state.draft.items.length-1)+buttons('remove','Poista',task.id)+'</div>'+
        '<label>Vastausrivejä / alakohta<select data-exam-lines="'+e(task.id)+'">'+Array.from({length:8},(_,n)=>'<option'+(n+1===item.answerLines?' selected':'')+'>'+(n+1)+'</option>').join('')+'</select></label>'+
        '<label class="exam-break"><input type="checkbox" data-exam-break="'+e(task.id)+'"'+(item.pageBreakBefore?' checked':'')+'> Aloita uudelta sivulta</label>'+swapHtml(state.draft,bank,task)+'</li>';
    }).join('')+'</ol>':'<p>Ei vielä valittuja tehtäviä.</p>';
    showPaper();
    if(focus)root.querySelector(focus)?.focus({preventScroll:true});
  }
  function update(action, message, focus) {
    try {
      const next=editExamDraft(state.draft,bank,action);
      if(JSON.stringify(next)===JSON.stringify(state.draft))return;
      if(action.type!=='title'||!state.titleEditing)state.history.push(state.draft);
      state.titleEditing=action.type==='title';
      if(state.history.length>30)state.history.shift();
      state.draft=next;pending=undefined;++loadToken;
      root.querySelector('#exam-import-review').innerHTML='';
      if(action.type==='title')showPaper();else{showSelection();showBank();}
      root.querySelector('#exam-undo').disabled=!state.history.length;
      if(action.type!=='title')root.querySelector(focus||'#exam-selection-title')?.focus({preventScroll:true});
      say(message);
    } catch(error){say(error.message);}
  }
  function mount(currentBook, {keepAudience=false}={}) {
    if(!currentBook.localAssessment)return false;
    try{validateEditorBank(currentBook.localAssessment,currentBook);}catch{return false;}
    book=currentBook;bank=book.localAssessment;pending=undefined;++loadToken;
    const key=book.id+'@'+bank.revision;
    if(!sessions.has(key))sessions.set(key,{draft:newExamDraft(bank),from:'',to:'',skill:'',panel:'bank',history:[]});
    state=sessions.get(key);
    if(!keepAudience)state.audience='learner';
    state.titleEditing=false;
    root.innerHTML='<div class="page exam-workspace"><header class="exam-screen-only"><a href="'+bookUrl(book.id)+'">← Kirjan materiaalit</a><p class="eyebrow">Opettajan työtila · paikallinen kokeilu</p><h1>Kokoa koe</h1><p>Valitse tehtävät, säädä vastaustila ja tarkista tuloste. Tehtävät ovat toimitettavia luonnoksia.</p></header>'+
      '<div class="exam-toolbar exam-screen-only"><label>Kokeen otsikko<input id="exam-title" maxlength="100" value="'+e(state.draft.title)+'"></label><div class="actions">'+buttons('export','Tallenna koeluonnos')+'<label class="button exam-file-label">Avaa koeluonnos<input id="exam-import" type="file" accept=".json,application/json"></label><button id="exam-undo" type="button" data-exam-action="undo"'+(!state.history.length?' disabled':'')+'>Kumoa viimeinen muutos</button></div>'+
      '<p class="muted">Työ säilyy tämän välilehden sisällä. Tallenna tiedosto ennen sivun päivittämistä tai sulkemista. Tiedosto sisältää tehtävävalinnat ja asettelun, ei oppilasvastauksia.</p><div id="exam-import-review"></div><p id="exam-status" role="status" aria-live="polite"></p></div>'+
      '<div class="exam-layout"><aside class="exam-sidebar exam-screen-only" aria-label="Tehtävien valinta"><div class="exam-panel-switch actions" role="group" aria-label="Tehtävävalikoima tai valittu koe"><button type="button" data-exam-action="bank-panel" id="exam-panel-bank">Tehtävävalikoima</button><button type="button" data-exam-action="selection-panel" id="exam-panel-selection">Valitut tehtävät</button></div><section id="exam-bank-panel"><h2>1. Valitse tehtävät</h2><div class="exam-filters">'+chapterRangeHtml(book,bank,state.from,state.to)+'<label>Taito<select id="exam-skill"><option value="">Kaikki taidot</option>'+Object.entries(skillLabels).map(([k,v])=>'<option value="'+k+'"'+(state.skill===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label></div><p id="exam-count" role="status"></p><div id="exam-task-list"></div></section>'+
      '<section id="exam-selection-panel"><h2 id="exam-selection-title" tabindex="-1">2. Järjestys ja vastaustila</h2><p>Pisteet seuraavat tehtävän arviointiohjetta. Vastausrivit ovat 10 mm korkeat tulosteessa.</p><div id="exam-selected"></div></section></aside>'+
      '<section class="exam-preview" aria-label="Kokeen esikatselu"><div class="exam-preview-tools exam-screen-only"><h2>3. Tarkista ja tulosta</h2><p id="exam-total"></p><div id="exam-coverage"></div><p class="muted">Ajat ovat testaamattomia työarvioita. Tämä valikoima ei arvioi kuuntelua tai suullista vuorovaikutusta.</p><div class="actions" role="group" aria-label="Tulosteen sisältö"><button type="button" id="exam-learner" data-exam-action="learner">Oppilaan koe</button><button type="button" id="exam-teacher" data-exam-action="teacher">Opettajan ohje</button></div><button type="button" id="exam-print" data-exam-action="print"></button><p class="muted">A4 pysty, mittakaava 100 %. Lopulliset sivunvaihdot ja PDF-tallennus näet selaimen tulostusikkunassa. Tarkista pitkien tehtävien sijoittuminen ja poista selaimen omat ylä- ja alatunnisteet tarvittaessa.</p></div><div id="exam-paper-slot"></div></section></div></div>';
    showBank();showSelection();showPanel();root.querySelector('h1')?.setAttribute('tabindex','-1');root.querySelector('h1')?.focus();return true;
  }
  function showPanel() {
    root.querySelector('#exam-bank-panel').hidden=state.panel!=='bank';
    root.querySelector('#exam-selection-panel').hidden=state.panel!=='selection';
    root.querySelector('#exam-panel-bank').setAttribute('aria-pressed',String(state.panel==='bank'));
    root.querySelector('#exam-panel-selection').setAttribute('aria-pressed',String(state.panel==='selection'));
  }
  root.addEventListener('input',event=>{
    if(active()&&event.target.id==='exam-title')update({type:'title',value:event.target.value.trim()||'Koe'},'Otsikko päivitetty.');
  });
  root.addEventListener('change',async event=>{
    if(!active())return;
    const input=event.target;
    if(input.id==='exam-from'||input.id==='exam-to'||input.id==='exam-skill') {state[{'exam-from':'from','exam-to':'to','exam-skill':'skill'}[input.id]]=input.value;showBank();}
    else if(input.id==='exam-title') {
      update({type:'title',value:input.value.trim()||'Koe'},'Otsikko päivitetty.');input.value=state.draft.title;state.titleEditing=false;
    } else if(input.dataset.examLines) update({type:'lines',taskId:input.dataset.examLines,value:Number(input.value)},'Vastaustila päivitetty.','[data-exam-lines="'+input.dataset.examLines+'"]');
    else if(input.dataset.examSwap&&input.value) update({type:'swap',taskId:input.dataset.examSwap,to:input.value},'Tehtävä vaihdettu samalle paikalle. Muutoksen voi kumota.','[data-exam-action="remove"][data-task="'+input.value+'"]');
    else if(input.dataset.examBreak) update({type:'break',taskId:input.dataset.examBreak,value:input.checked},'Sivunvaihto päivitetty.','[data-exam-break="'+input.dataset.examBreak+'"]');
    else if(input.id==='exam-import') {
      const file=input.files?.[0];input.value='';if(!file)return;
      const token=++loadToken,revision=bank.revision;
      pending=undefined;root.querySelector('#exam-import-review').innerHTML='';
      try {
        if(file.size>50000)throw new Error('Koetiedosto on liian suuri. Nykyinen koe säilyi.');
        const raw=await file.text();
        if(token!==loadToken||!active()||bank.revision!==revision)return;
        const review=reviewExamImport(raw,bank);pending=review.draft;
        const skipped=review.skipped.length?'<p>'+review.skipped.length+(review.skipped.length===1?' tehtävä on':' tehtävää on')+' muuttunut tallennuksen jälkeen, eikä '+(review.skipped.length===1?'sitä':'niitä')+' avata: '+e(review.skipped.join(', '))+'. Lisää korvaava tehtävä valikoimasta.</p>':'';
        root.querySelector('#exam-import-review').innerHTML='<p><strong>'+e(pending.title)+'</strong> · '+pending.items.length+' tehtävää. Korvaako tämä nykyisen koeluonnoksen?</p>'+skipped+buttons('accept-import','Ota käyttöön')+buttons('cancel-import','Peruuta');
        root.querySelector('[data-exam-action="accept-import"]')?.focus();say('Tiedosto tarkistettu. Nykyistä koetta ei ole vielä muutettu.');
      } catch(error){if(token!==loadToken||!active()||bank.revision!==revision)return;pending=undefined;root.querySelector('#exam-import-review').innerHTML='';say(error.message);}
    }
  });
  root.addEventListener('click',event=>{
    if(!active())return;
    const button=event.target.closest('[data-exam-action]');if(!button||button.disabled)return;
    const action=button.dataset.examAction,id=button.dataset.task;
    if(action==='add')update({type:'add',taskId:id},'Tehtävä lisätty. Järjestystä ja vastaustilaa voi muuttaa Valitut tehtävät -näkymässä.','[data-bank-task="'+id+'"] h3');
    else if(action==='remove')update({type:'remove',taskId:id},'Tehtävä poistettu. Muutoksen voi kumota.');
    else if(action==='up'||action==='down')update({type:'move',taskId:id,delta:action==='up'?-1:1},'Tehtävän järjestys päivitetty.','[data-exam-action="remove"][data-task="'+id+'"]');
    else if(action==='bank-panel'||action==='selection-panel'){state.panel=action==='bank-panel'?'bank':'selection';showPanel();}
    else if(action==='learner'||action==='teacher'){state.audience=action;showPaper();say(action==='teacher'?'Opettajan vastaukset ja arviointiperusteet näkyvissä.':'Oppilaan koepaperi näkyvissä.');}
    else if(action==='undo'&&state.history.length){state.draft=state.history.pop();pending=undefined;++loadToken;mount(book,{keepAudience:true});say('Viimeinen muutos kumottu.');if(state.panel==='selection')root.querySelector('#exam-selection-title')?.focus();}
    else if(action==='accept-import'&&pending){state.history.push(state.draft);state.draft=validateExamDraft(pending,bank);mount(book);say('Koeluonnos avattu. Edellisen luonnoksen voi palauttaa kumoamalla.');}
    else if(action==='cancel-import'){pending=undefined;++loadToken;root.querySelector('#exam-import-review').innerHTML='';root.querySelector('#exam-import')?.focus();say('Tuonti peruttu. Nykyinen koe säilyi.');}
    else if(action==='export'){
      try {
        const raw=JSON.stringify(validateExamDraft(state.draft,bank),null,2)+'\n';
        const url=win.URL.createObjectURL(new win.Blob([raw],{type:'application/json'}));
        const link=root.ownerDocument.createElement('a');link.href=url;link.download=bank.bookId+'-koeluonnos.json';link.click();
        win.setTimeout(()=>win.URL.revokeObjectURL(url),30000);say('Koeluonnoksen lataus pyydetty. Tarkista tiedosto selaimen latauksista.');
      }catch{say('Tiedoston tallennus ei onnistunut. Nykyinen koe säilyi.');}
    } else if(action==='print'){
      say('Tulostukseen valittu '+(state.audience==='teacher'?'opettajan arviointiohje.':'oppilaan koe ilman vastauksia.'));
      win.setTimeout(()=>{if(active())try{win.print();}catch{say('Tulostusikkunaa ei voitu avata. Kokeile selaimen Tulosta-toimintoa.');}},0);
    }
  });
  return {mount};
}
