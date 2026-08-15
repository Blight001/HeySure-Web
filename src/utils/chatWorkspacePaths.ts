export const normalizeSelectionPath = (path: string) => {
  const raw = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  return raw.endsWith('/') ? raw.replace(/\/+$/g, '') + '/' : raw
}

export const isSelectableFilePath = (path: string, root: string) => {
  if (!root) return true
  const normalized = normalizeSelectionPath(path).replace(/\/+$/g, '')
  return normalized === root || normalized.startsWith(`${root}/`)
}

export const toAiWorkspacePath = (path: string, root: string) => {
  const normalized = normalizeSelectionPath(path)
  if (!root) return normalized
  const withoutTrailing = normalized.replace(/\/+$/g, '')
  if (withoutTrailing === root) return normalized.endsWith('/') ? './' : '.'
  if (withoutTrailing.startsWith(`${root}/`)) {
    const relative = withoutTrailing.slice(root.length + 1)
    return normalized.endsWith('/') ? `${relative}/` : relative
  }
  return normalized
}
