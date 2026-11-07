// Local editorial proofs only. The approved-only composeExam contract is separate.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
function need(ok, message) { if (!ok) throw new Error(message); }
function keys(value, allowed) { need(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'Tuntemattomia tai puuttuvia tietokenttiä.'); }
export const skillLabels = { reading: 'Luetun ymmärtäminen', writing: 'Kirjallinen tuottaminen' };

export function validateEditorBank(bank, book) {
  keys(bank, ['schemaVersion','status','bookId','bookVersion','revision','tasks']);
  need(bank.schemaVersion === 1 && bank.status === 'draft' && bank.bookId === book.id && bank.bookVersion === book.version && /^[a-f0-9]{64}$/.test(bank.revision), 'Koetehtävien painossidonta ei täsmää.');
  need(Array.isArray(bank.tasks) && bank.tasks.length > 0 && bank.tasks.length <= 100, 'Tehtävävalikoima puuttuu tai on liian suuri.');
  const seen = new Set();
  for (const task of bank.tasks) {
    keys(task, ['id','version','chapterId','title','skill','goal','demand','support','instruction','stimulus','questions','points','minutes','answerLines','scoringGuide']);
    need(id(task.id) && !seen.has(task.id) && id(task.version), 'Tehtävän tunniste ei ole yksilöllinen.'); seen.add(task.id);
    need(book.chapters.some(c => c.id === task.chapterId) && Object.hasOwn(skillLabels, task.skill), 'Tuntematon luku tai taito.');
    for (const field of ['title','goal','demand','support','instruction','scoringGuide']) need(text(task[field], field === 'scoringGuide' ? 2000 : 700), 'Tehtävän ' + field + ' puuttuu.');
    need(typeof task.stimulus === 'string' && task.stimulus.length <= 2000, 'Aineisto on liian pitkä.');
    need(Array.isArray(task.questions) && task.questions.length > 0 && task.questions.length <= 8 && task.questions.every(q => text(q, 400)), 'Tehtävän alakohdat puuttuvat.');
    need(Number.isInteger(task.points) && task.points > 0 && task.points <= 30 && Number.isInteger(task.minutes) && task.minutes > 0 && task.minutes <= 30, 'Virheellinen piste- tai aika-arvio.');
    need(Number.isInteger(task.answerLines) && task.answerLines >= 1 && task.answerLines <= 8, 'Virheellinen vastaustila.');
  }
  return bank;
}
export function newExamDraft(bank) {
  return {schemaVersion:1,kind:'aukeama-exam-proof',bookId:bank.bookId,bookVersion:bank.bookVersion,revision:bank.revision,title:'Koe',items:[]};
}
export function validateExamDraft(value, bank) {
  keys(value, ['schemaVersion','kind','bookId','bookVersion','revision','title','items']);
  need(value.schemaVersion === 1 && value.kind === 'aukeama-exam-proof' && value.bookId === bank.bookId && value.bookVersion === bank.bookVersion && value.revision === bank.revision, 'Tiedosto kuuluu eri kirjaan tai tehtäväversioon. Nykyinen koe säilyi.');
  need(text(value.title, 100) && Array.isArray(value.items) && value.items.length <= 30, 'Tarkista kokeen otsikko ja tehtävämäärä (enintään 30).');
  const seen = new Set();
  for (const item of value.items) {
    keys(item, ['taskId','taskVersion','answerLines','pageBreakBefore']);
    need(bank.tasks.some(t => t.id === item.taskId && t.version === item.taskVersion) && !seen.has(item.taskId), 'Tuntematon, vanhentunut tai toistuva tehtävä.'); seen.add(item.taskId);
    need(Number.isInteger(item.answerLines) && item.answerLines >= 1 && item.answerLines <= 8 && typeof item.pageBreakBefore === 'boolean', 'Vastausrivejä saa olla 1–8 alakohtaa kohden.');
  }
  // Return owned values, never imported task text, answers or approval metadata.
  return {...value, items:value.items.map(item => ({...item}))};
}
export function importExamDraft(raw, bank) {
  need(typeof raw === 'string' && raw.length <= 50000, 'Koetiedosto on liian suuri.');
  let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('Tiedosto ei ole luettava koeluonnos. Nykyinen koe säilyi.'); }
  return validateExamDraft(parsed, bank);
}
export function editExamDraft(draft, bank, action) {
  const next = validateExamDraft(draft, bank);
  const index = next.items.findIndex(i => i.taskId === action.taskId);
  if (action.type === 'add') {
    const task = bank.tasks.find(t => t.id === action.taskId);
    need(task && index < 0, 'Tehtävä on jo kokeessa tai puuttuu.');
    next.items.push({taskId:task.id,taskVersion:task.version,answerLines:task.answerLines,pageBreakBefore:false});
  } else if (action.type === 'title') next.title = action.value;
  else {
    need(index >= 0, 'Tehtävää ei löydy kokeesta.');
    if (action.type === 'remove') next.items.splice(index, 1);
    else if (action.type === 'move') {
      need(action.delta === -1 || action.delta === 1, 'Virheellinen siirto.');
      const target = index + action.delta;
      if (target >= 0 && target < next.items.length) [next.items[index],next.items[target]] = [next.items[target],next.items[index]];
    } else if (action.type === 'lines') next.items[index].answerLines = action.value;
    else if (action.type === 'break') next.items[index].pageBreakBefore = action.value;
    else throw new Error('Tuntematon toiminto.');
  }
  return validateExamDraft(next, bank);
}
export function composeExamProof(draft, bank, audience = 'learner') {
  need(['learner','teacher'].includes(audience), 'Tuntematon tulosteen tyyppi.');
  const valid = validateExamDraft(draft, bank);
  const items = valid.items.map(item => {
    const task = bank.tasks.find(t => t.id === item.taskId);
    // Explicit allowlist keeps answers out of the learner view model and DOM.
    const result = {...item,title:task.title,instruction:task.instruction,stimulus:task.stimulus,questions:[...task.questions],points:task.points};
    if (audience === 'teacher') Object.assign(result,{goal:task.goal,support:task.support,demand:task.demand,scoringGuide:task.scoringGuide});
    return result;
  });
  const tasks = valid.items.map(item => bank.tasks.find(t => t.id === item.taskId));
  return {title:valid.title,audience,items,totalPoints:tasks.reduce((n,t)=>n+t.points,0),estimatedMinutes:tasks.reduce((n,t)=>n+t.minutes,0),skills:[...new Set(tasks.map(t=>t.skill))]};
}
