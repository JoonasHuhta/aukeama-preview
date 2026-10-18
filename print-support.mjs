// Expand only the current reader's learning support for browser printing.
// The complete, independently paginated book is available as the PDF.
export function installPrintSupport(root, events) {
  let saved;
  function beforePrint() {
    if (saved) return;
    saved = [...root.querySelectorAll('.extra-help, .role-card')].map(element => [element, element.open]);
    for (const [element] of saved) element.open = true;
  }
  function afterPrint() {
    if (!saved) return;
    for (const [element, open] of saved) if (element.isConnected) element.open = open;
    saved = undefined;
  }
  events.addEventListener('beforeprint', beforePrint);
  events.addEventListener('afterprint', afterPrint);
  return { get active() { return saved !== undefined; } };
}

export function focusAfterPositionClear(root) {
  const search = root.querySelector('#search');
  // A single-book search may be inside a closed disclosure.
  const target = search?.closest('details:not([open])')?.querySelector('summary') || search;
  target?.focus({ preventScroll: true });
}
