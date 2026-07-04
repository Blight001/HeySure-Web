// Resolve a stored AI avatar value to a displayable URL.
//
// Preset AI avatars are served by the backend at /ai_avatars/ai_avatarsN.png.
// Stored value may be a filename like "ai_avatars3.png", full path, or external.
// Default is the first avatar.
export function resolveAiAvatarUrl(avatar?: string | null): string {
  const raw = String(avatar || '').trim()
  if (!raw) return ''
  const preset = raw.match(/ai_avatars([1-9])(?:[-.][^/]*)?\.png/i)
  if (preset) return `/ai_avatars/ai_avatars${preset[1]}.png`
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  if (raw.startsWith('ai_avatars')) {
    // e.g. "ai_avatars3.png" -> full url path
    return raw.startsWith('/') ? raw : `/ai_avatars/${raw}`
  }
  return raw
}

// The preset AI avatars offered in the picker (9 built-in).
export const PRESET_AI_AVATARS = [
  '/ai_avatars/ai_avatars1.png',
  '/ai_avatars/ai_avatars2.png',
  '/ai_avatars/ai_avatars3.png',
  '/ai_avatars/ai_avatars4.png',
  '/ai_avatars/ai_avatars5.png',
  '/ai_avatars/ai_avatars6.png',
  '/ai_avatars/ai_avatars7.png',
  '/ai_avatars/ai_avatars8.png',
  '/ai_avatars/ai_avatars9.png',
]

export const DEFAULT_AI_AVATAR = PRESET_AI_AVATARS[0]
