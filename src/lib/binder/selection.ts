export function applySelection(
  selected: ReadonlySet<string>,
  action: 'all' | 'clear' | 'toggle',
  ids: readonly string[],
  id?: string,
): Set<string> {
  if (action === 'clear') return new Set()
  if (action === 'all') return new Set(ids)
  const next = new Set(selected)
  if (!id) return next
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
