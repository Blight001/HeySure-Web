/** Format token counts with compact decimal units for dense chat UI. */
export const formatTokenCount = (value?: number | null): string => {
  const count = Math.max(0, Number(value) || 0)
  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ]
  const unit = units.find(item => count >= item.threshold)
  if (!unit) return String(Math.floor(count))
  const scaled = count / unit.threshold
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  return `${Number(scaled.toFixed(decimals))}${unit.suffix}`
}
