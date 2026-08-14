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

/**
 * Estimate the context tokens occupied by tool parameters/results.
 * Exact tokenizers vary by model and are unavailable in the browser, so the
 * badge deliberately marks this value as an estimate.
 */
export const estimateTokenCount = (value?: string | null): number => {
  let weightedTokens = 0
  for (const char of String(value || '')) {
    if (/\s/u.test(char)) weightedTokens += 0.1
    else if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char)) weightedTokens += 1
    else if (/[\p{L}\p{N}]/u.test(char)) weightedTokens += 0.25
    else weightedTokens += 0.5
  }
  return Math.ceil(weightedTokens)
}
