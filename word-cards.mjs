/** One in-flow reading aid; no storage, network, modal layer or learning score. */
export function installWordCards(root) {
  const document = root.ownerDocument;
  let current;
  function close({ restore = true } = {}) {
    if (!current) return;
    const { trigger, panel, positions } = current;
    current = undefined;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    panel.remove();
    if (restore && trigger.isConnected) {
      trigger.focus({ preventScroll: true });
      for (const [element, top, left] of positions) {
        if (element.isConnected) { element.scrollTop = top; element.scrollLeft = left; }
      }
    }
  }
  function open(trigger) {
    if (current?.trigger === trigger) { close(); return; }
    let data;
    try { data = JSON.parse(trigger.dataset.wordCard); } catch { return; }
    if (!data || typeof data.meaning !== 'string' || !data.meaning.trim() ||
        data.meaning.length > 240 || ['model','note'].some(key => data[key] !== undefined &&
        (typeof data[key] !== 'string' || data[key].length > 240))) return;
    close({ restore: false });
    const positions = [];
    for (let element = trigger.parentElement; element; element = element.parentElement) {
      positions.push([element, element.scrollTop, element.scrollLeft]);
    }
    const panel = document.createElement('section');
    panel.className = 'word-card';
    panel.id = 'active-word-card';
    panel.tabIndex = -1;
    panel.setAttribute('role', 'region');
    panel.setAttribute('lang', 'fi');
    panel.setAttribute('aria-labelledby', 'active-word-card-title');
    panel.setAttribute('aria-describedby', 'active-word-card-meaning');
    const top = document.createElement('div');
    top.className = 'word-card-header';
    const title = document.createElement('h3');
    title.id = 'active-word-card-title';
    title.textContent = trigger.textContent;
    if (data.language) title.setAttribute('lang', data.language);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'word-card-close';
    button.textContent = 'Sulje';
    button.setAttribute('aria-label', 'Sulje sanan merkitys');
    top.append(title, button);
    const meaning = document.createElement('p');
    meaning.id = 'active-word-card-meaning';
    meaning.className = 'word-card-meaning';
    meaning.textContent = data.meaning;
    panel.append(top, meaning);
    for (const [key, label] of [['model','Sanan malli: '],['note','']]) {
      if (!data[key]) continue;
      const paragraph = document.createElement('p');
      paragraph.className = 'word-card-' + key;
      if (key === 'model') {
        paragraph.append(document.createTextNode(label));
        const model = document.createElement('span');
        model.textContent = data[key];
        if (data.language) model.setAttribute('lang', data.language);
        paragraph.append(model);
      } else paragraph.textContent = data[key];
      panel.append(paragraph);
    }
    const host = trigger.closest('dd, td, li');
    if (host) host.append(panel);
    else if (trigger.closest('p')) trigger.closest('p').after(panel);
    else trigger.closest('.paper-body')?.append(panel);
    if (!panel.isConnected) return;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', panel.id);
    current = { trigger, panel, positions };
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
  function onClick(event) {
    const trigger = event.target.closest('.word-reference');
    if (trigger && root.contains(trigger)) {
      if (document.getSelection()?.toString()) return;
      event.preventDefault();
      event.stopPropagation();
      open(trigger);
    } else if (event.target.closest('.word-card-close')) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }
  function onKey(event) {
    if (event.key !== 'Escape' || !current) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }
  root.addEventListener('click', onClick, true);
  root.addEventListener('keydown', onKey, true);
  return { close, destroy() {
    close({ restore: false });
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('keydown', onKey, true);
  } };
}
