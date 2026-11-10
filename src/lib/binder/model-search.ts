export type ModelChoice = {
  id: string
  slug: string
  title: string
  maker: string
}

/** Models for a type-to-search box. A chosen make narrows the list. The current model stays first. */
export function filterModels<T extends ModelChoice>(
  trucks: readonly T[],
  make: string,
  query: string,
  selectedId?: string | null,
  limit = 12,
): T[] {
  const scoped = make ? trucks.filter((truck) => truck.maker === make) : [...trucks]
  const q = query.trim().toLowerCase()
  const matched = q
    ? scoped.filter((truck) => `${truck.maker} ${truck.title} ${truck.slug}`.toLowerCase().includes(q))
    : scoped
  return [...matched]
    .sort((a, b) => {
      if (selectedId && a.id === selectedId) return -1
      if (selectedId && b.id === selectedId) return 1
      return `${a.maker} ${a.title}`.localeCompare(`${b.maker} ${b.title}`)
    })
    .slice(0, limit)
}
