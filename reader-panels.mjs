// Non-modal reading aids: keep the page usable and never leave a panel over focus.
const panels = {
  contents: { panel: 'chapter-nav', button: 'toggle-contents', focus: 'close-contents', className: 'is-nav-open' },
  vocabulary: { panel: 'vocabulary-panel', button: 'toggle-vocabulary', focus: 'vocabulary-query', className: 'is-vocabulary-open' },
  info: { panel: 'reader-info', button: 'toggle-info', focus: 'close-info' },
  workbook: { panel: 'workbook-panel', button: 'toggle-workbook', focus: 'close-workbook' }
};

export function createReaderPanels(root, { beforeOpen = () => {} } = {}) {
  const find = id => root.querySelector('#' + id);
  function toggle(kind, force) {
    const config = panels[kind];
    if (!config) return;
    const panel = find(config.panel), button = find(config.button);
    if (!panel || !button) return;
    const open = force ?? panel.hidden;
    if (open) {
      // Options/word support may restore focus while closing. Do that before
      // exposing this panel so its focus-out handler cannot close it again.
      beforeOpen();
      for (const other of Object.keys(panels)) if (other !== kind) toggle(other, false);
    }
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (config.className) root.querySelector('.reader-layout')?.classList.toggle(config.className, open);
    if (open) (find(config.focus) || find(kind === 'vocabulary' ? 'close-vocabulary' : config.button))
      ?.focus({ preventScroll: true });
  }
  function dismissOutside(target, { restore = false } = {}) {
    for (const [kind, config] of Object.entries(panels)) {
      const panel = find(config.panel);
      if (!panel || panel.hidden || target.closest('#' + config.panel + ', #' + config.button)) continue;
      const hadFocus = panel.contains(root.ownerDocument.activeElement);
      toggle(kind, false);
      // Pointer clicks on non-focusable page areas need a visible focus target.
      // Keyboard focus moving to another control must not be pulled back.
      if (restore && hadFocus) find(config.button)?.focus({ preventScroll: true });
    }
  }
  return { toggle, dismissOutside };
}
