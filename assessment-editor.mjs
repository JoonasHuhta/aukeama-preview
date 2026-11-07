// Local editorial proofs only. The approved-only composeExam contract is separate.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
function need(ok, message) { if (!ok) throw new Error(message); }
function keys(value, allowed) { need(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'Tuntemattomia tai puuttuvia tietokenttiä.'); }
export const skillLabels = { reading: 'Luetun ymmärtäminen', writing: 'Kirjallinen tuottaminen' };

export function validateEditorBank(bank, book) {
  keys(bank, ['schemaVersion','status','bookId','bookVersion','revision','taskRevisions','tasks']);
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
  need(object(bank.taskRevisions) && Object.keys(bank.taskRevisions).length === bank.tasks.length &&
    bank.tasks.every(task => /^[a-f0-9]{64}$/.test(bank.taskRevisions[task.id] || '')), 'Tehtävien versiotunnisteet puuttuvat.');
  return bank;
}
/*
 * Draft format 2 pins every chosen task to its own revision (task text plus the
 * chapter source it was written from). New tasks in the selection therefore do
 * not invalidate a saved exam; a changed task does, and only that task.
 * Format 1 pinned the whole selection and is read only when that still matches.
 */
export function newExamDraft(bank) {
  return {schemaVersion:2,kind:'aukeama-exam-proof',bookId:bank.bookId,bookVersion:bank.bookVersion,title:'Koe',items:[]};
}
function upgradeDraft(value, bank) {
  if (!object(value) || value.schemaVersion !== 1) return value;
  keys(value, ['schemaVersion','kind','bookId','bookVersion','revision','title','items']);
  need(value.revision === bank.revision, 'Tiedosto kuuluu eri kirjaan tai tehtäväversioon. Nykyinen koe säilyi.');
  const {revision, ...rest} = value;
  return {...rest, schemaVersion:2, items:Array.isArray(value.items) ? value.items.map(item => object(item)
    ? {taskId:item.taskId,taskVersion:item.taskVersion,taskRevision:bank.taskRevisions[item.taskId],answerLines:item.answerLines,pageBreakBefore:item.pageBreakBefore} : item) : value.items};
}
export function validateExamDraft(input, bank) {
  const value = upgradeDraft(input, bank);
  keys(value, ['schemaVersion','kind','bookId','bookVersion','title','items']);
  need(value.schemaVersion === 2 && value.kind === 'aukeama-exam-proof' && value.bookId === bank.bookId && value.bookVersion === bank.bookVersion, 'Tiedosto kuuluu eri kirjaan tai tehtäväversioon. Nykyinen koe säilyi.');
  need(text(value.title, 100) && Array.isArray(value.items) && value.items.length <= 30, 'Tarkista kokeen otsikko ja tehtävämäärä (enintään 30).');
  const seen = new Set();
  for (const item of value.items) {
    keys(item, ['taskId','taskVersion','taskRevision','answerLines','pageBreakBefore']);
    need(bank.tasks.some(t => t.id === item.taskId && t.version === item.taskVersion) && bank.taskRevisions[item.taskId] === item.taskRevision && !seen.has(item.taskId), 'Tuntematon, vanhentunut tai toistuva tehtävä.'); seen.add(item.taskId);
    need(Number.isInteger(item.answerLines) && item.answerLines >= 1 && item.answerLines <= 8 && typeof item.pageBreakBefore === 'boolean', 'Vastausrivejä saa olla 1–8 alakohtaa kohden.');
  }
  // Return owned values, never imported task text, answers or approval metadata.
  return {...value, items:value.items.map(item => ({...item}))};
}
function parseDraft(raw) {
  need(typeof raw === 'string' && raw.length <= 50000, 'Koetiedosto on liian suuri.');
  try { return JSON.parse(raw); } catch { throw new Error('Tiedosto ei ole luettava koeluonnos. Nykyinen koe säilyi.'); }
}
export function importExamDraft(raw, bank) {
  return validateExamDraft(parseDraft(raw), bank);
}
/**
 * Reads a saved exam for review before it replaces the current one. Tasks that have
 * changed or left the selection since saving are named and left out; everything
 * else in the file must still be valid. Nothing from the file is trusted as task text.
 */
export function reviewExamImport(raw, bank) {
  const parsed = upgradeDraft(parseDraft(raw), bank);
  if (!object(parsed) || parsed.schemaVersion !== 2 || !Array.isArray(parsed.items)) return {draft:validateExamDraft(parsed, bank), skipped:[]};
  const current = item => object(item) && bank.tasks.some(t => t.id === item.taskId && t.version === item.taskVersion) && bank.taskRevisions[item.taskId] === item.taskRevision;
  const skipped = parsed.items.filter(item => !current(item)).map(item => String(object(item) && item.taskId || '?').slice(0, 80));
  need(!parsed.items.length || skipped.length < parsed.items.length, 'Tiedoston tehtävät ovat muuttuneet tallennuksen jälkeen. Nykyinen koe säilyi.');
  return {draft:validateExamDraft({...parsed, items:parsed.items.filter(current)}, bank), skipped};
}
export function editExamDraft(draft, bank, action) {
  const next = validateExamDraft(draft, bank);
  const index = next.items.findIndex(i => i.taskId === action.taskId);
  if (action.type === 'add') {
    const task = bank.tasks.find(t => t.id === action.taskId);
    need(task && index < 0, 'Tehtävä on jo kokeessa tai puuttuu.');
    next.items.push({taskId:task.id,taskVersion:task.version,taskRevision:bank.taskRevisions[task.id],answerLines:task.answerLines,pageBreakBefore:false});
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

export const LESSON_MINUTES = 45;
/**
 * What the chosen tasks cover, and plain warnings about the composition. Counts
 * and sums only: no difficulty level, no recommendation of what pupils should know.
 */
export function examBalance(draft, bank) {
  const tasks = validateExamDraft(draft, bank).items.map(item => bank.tasks.find(t => t.id === item.taskId));
  const group = key => [...tasks.reduce((map, task) => {
    const row = map.get(task[key]) || {[key]:task[key],tasks:0,points:0};
    row.tasks += 1; row.points += task.points; return map.set(task[key], row);
  }, new Map()).values()];
  const total = tasks.reduce((n, t) => n + t.points, 0), minutes = tasks.reduce((n, t) => n + t.minutes, 0);
  const chapters = group('chapterId'), skills = group('skill'), warnings = [];
  if (tasks.length >= 2 && skills.length === 1)
    warnings.push({kind:'one-skill',text:'Kaikki tehtävät ovat samaa taitoa: '+skillLabels[skills[0].skill].toLowerCase()+'.'});
  const largest = tasks.reduce((max, t) => t.points > (max?.points || 0) ? t : max, null);
  // With two tasks one is always the larger; the note matters once a paper has several.
  if (tasks.length >= 3 && largest.points * 2 > total)
    warnings.push({kind:'one-task',text:'Tehtävä ”'+largest.title+'” tuo yli puolet pisteistä ('+largest.points+'/'+total+' p).'});
  if (minutes > LESSON_MINUTES)
    warnings.push({kind:'time',text:'Työarvio '+minutes+' min ylittää '+LESSON_MINUTES+' minuutin oppitunnin.'});
  return {chapters, skills, totalPoints:total, estimatedMinutes:minutes, warnings};
}
