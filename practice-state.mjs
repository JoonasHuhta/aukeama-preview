// Answers are optional local browser data; never included in URLs or sent to a server.
export const practiceFileLimit=64000;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function practiceFields(activity){return activity.steps.flatMap(step=>step.fields);}
export function practiceActivities(book){return book?.localPractices??(book?.localPractice?[book.localPractice]:[]);}
export function practiceStepFields(activity,step){
  const fields=practiceFields(activity);
  return [...(step.continueFields||[]).map(id=>fields.find(field=>field.id===id)),...step.fields];
}
const hasWork=document=>Object.values(document.answers).some(value=>value===true||typeof value==='string'&&value.length>0)||document.models.length>0||document.hints.length>0;
export function emptyPractice(book,activity) {
  return {schemaVersion:1,bookId:book.id,bookVersion:book.version,activityId:activity.id,revision:activity.revision,
    answers:Object.fromEntries(practiceFields(activity).map(f=>[f.id,f.type==='check'?false:''])),models:[],hints:[],checks:{}};
}
export function validatePractice(value,book,activity) {
  // Work saved under a reviewed compatible revision continues under the current one.
  if(plain(value)&&activity.legacyRevisions?.includes(value.revision))value={...value,revision:activity.revision};
  const empty=emptyPractice(book,activity), fields=practiceFields(activity);
  if(plain(value)&&value.bookId===empty.bookId&&value.bookVersion===empty.bookVersion&&typeof value.activityId==='string'&&value.activityId!==empty.activityId)
    throw new Error('Tiedosto on toisen harjoituksen vastaus. Avaa se oman harjoituksensa sivulla.');
  if(!plain(value)||Object.keys(value).some(k=>!own(empty,k))||Object.keys(empty).some(k=>!own(value,k))||
    ['schemaVersion','bookId','bookVersion','activityId','revision'].some(k=>value[k]!==empty[k]))throw new Error('Tiedosto kuuluu eri kirjaan tai sisältöversioon, tai sen muoto on virheellinen.');
  if(!plain(value.answers)||Object.keys(value.answers).length!==fields.length||fields.some(f=>!own(value.answers,f.id)||
    (f.type==='check'?typeof value.answers[f.id]!=='boolean':typeof value.answers[f.id]!=='string'||value.answers[f.id].length>(f.type==='money'?24:2000))))
    throw new Error('Vastauskohdat tai tekstin pituus eivät vastaa tätä kokeilua.');
  for(const key of ['models','hints'])if(!Array.isArray(value[key])||new Set(value[key]).size!==value[key].length||value[key].some(id=>
    !activity.steps.some(s=>s.id===id&&(key==='models'?s.model:s.hint))))throw new Error('Tukimerkintä on virheellinen.');
  if(!plain(value.checks)||Object.entries(value.checks).some(([id,checked])=>{
    const field=fields.find(f=>f.id===id&&f.check);
    return !field||!plain(checked)||Object.keys(checked).length!==2||checked.answer!==value.answers[id]||checked.result!==checkMoney(field,checked.answer);
  }))throw new Error('Hintatarkistus ei vastaa omaa vastausta.');
  return structuredClone(value);
}
export function checkMoney(field,answer) {
  if(!answer.trim())return 'empty';
  const match=/^(\d{1,3})(?:[,.](\d{1,2}))?\s*€?$/.exec(answer.trim());
  if(!match)return 'format';
  const cents=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  return cents===field.check.cents?'correct':'retry';
}
export function createPracticeState(getStorage,book,activity) {
  const key=['aukeama.practice.v1',book.id,activity.id,book.version,activity.revision].join('.');
  let document=emptyPractice(book,activity),persistent=false,status='temporary',dirty=false,lastRaw=null,conflict=false;
  try {
    const storage=getStorage();
    const raw=storage.getItem(key);
    if(raw){if(raw.length>practiceFileLimit)throw new Error('oversize');document=validatePractice(JSON.parse(raw),book,activity);persistent=true;status='saved';lastRaw=raw;}
    else for(const revision of activity.legacyRevisions||[]){
      // Copy, never move: the earlier key stays until the learner clears it.
      const earlier=storage.getItem(['aukeama.practice.v1',book.id,activity.id,book.version,revision].join('.'));
      if(!earlier||earlier.length>practiceFileLimit)continue;
      document=validatePractice(JSON.parse(earlier),book,activity);
      const next=JSON.stringify(document);storage.setItem(key,next);persistent=true;status='saved';lastRaw=next;break;
    }
  } catch {status='unavailable';}
  function save() {
    dirty=true;
    if(!persistent)return;
    try{
      const storage=getStorage();
      if(conflict||storage.getItem(key)!==lastRaw){conflict=true;status='conflict';return;}
      const next=JSON.stringify(document);storage.setItem(key,next);lastRaw=next;status='saved';dirty=false;
    }
    catch{status='failed';}
  }
  return {
    key,
    get:()=>({document:structuredClone(document),persistent,status,dirty}),
    set(id,value){
      const field=practiceFields(activity).find(f=>f.id===id);
      if(!field||(field.type==='check'?typeof value!=='boolean':typeof value!=='string'||value.length>(field.type==='money'?24:2000)))return false;
      if(document.answers[id]===value)return true;
      document.answers[id]=value;delete document.checks[id];save();return true;
    },
    use(stepId,kind){
      const step=activity.steps.find(s=>s.id===stepId);
      if(!step||!['models','hints'].includes(kind)||!(kind==='models'?step.model:step.hint))return;
      if(!document[kind].includes(stepId)){document[kind].push(stepId);save();}
    },
    check(id){const field=practiceFields(activity).find(f=>f.id===id&&f.check);if(!field)return;
      const result=checkMoney(field,document.answers[id]);document.checks[id]={answer:document.answers[id],result};save();return result;},
    persist(enabled){
      if(enabled){persistent=true;save();return status==='saved';}
      try{
        const storage=getStorage();
        if(conflict||storage.getItem(key)!==lastRaw){status='conflict';conflict=true;return false;}
        storage.removeItem(key);lastRaw=null;persistent=false;status='temporary';dirty=hasWork(document);return true;
      }
      catch{status='remove-failed';return false;}
    },
    clear(){
      try{
        const storage=getStorage();
        if(conflict||storage.getItem(key)!==lastRaw){conflict=true;status='conflict';dirty=hasWork(document);return false;}
        storage.removeItem(key);lastRaw=null;conflict=false;document=emptyPractice(book,activity);persistent=false;status='temporary';dirty=false;return true;
      }
      catch{status='remove-failed';return false;}
    },
    parse(raw){if(typeof raw!=='string'||raw.length>practiceFileLimit)throw new Error('Tiedosto on liian suuri (enintään 64 kt).');
      return validatePractice(JSON.parse(raw),book,activity);},
    replace(value){document=validatePractice(value,book,activity);save();},
    export:()=>JSON.stringify(document,null,2)+'\n'
  };
}
