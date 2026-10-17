/** One visible role per local card group. No answers or learner state are stored. */
export function closeOtherRoleCards(card) {
  if (!card?.matches?.('details.role-card[open]')) return;
  const group = card.parentElement;
  if (!group?.classList.contains('role-cards')) return;
  for (const sibling of group.children) {
    if (sibling !== card && sibling.matches('details.role-card[open]')) sibling.open = false;
  }
  // Closing a tall preceding card must not strand the active summary offscreen.
  const summary = card.querySelector?.('summary');
  if (summary && card.ownerDocument?.activeElement === summary) {
    summary.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
  }
}
