const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const onlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 160
const integer = (value: unknown, min = 0) => Number.isSafeInteger(value) && Number(value) >= min
const text = (value: unknown, limit = 2048) => typeof value === 'string' && value.length <= limit
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const transferKeys = ['transferId', 'kind', 'mime', 'sha256', 'bytes', 'chunks', 'encoding', 'compression']

const validViewport = (value: unknown) => isObject(value) && onlyKeys(value, ['width', 'height', 'dpr'])
  && ['width', 'height', 'dpr'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) > 0)

const validSnapshotBegin = (body: Record<string, unknown>) => onlyKeys(body, [...transferKeys, 'reason', 'baseSeq'])
  && id(body.transferId) && body.kind === 'snapshot' && body.mime === 'application/json'
  && hash(body.sha256) && integer(body.bytes, 1) && integer(body.chunks, 1)
  && body.encoding === 'json' && (body.compression === 'none' || body.compression === 'gzip')
  && integer(body.baseSeq) && (body.reason === undefined || text(body.reason, 160))

const validBindings = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(binding => isObject(binding)
  && onlyKeys(binding, ['nodeId', 'slot']) && integer(binding.nodeId, 1) && (binding.slot === 'src' || binding.slot === 'poster')))

const validResourceBegin = (body: Record<string, unknown>) => onlyKeys(body, [...transferKeys, 'hash', 'bindings'])
  && id(body.transferId) && body.kind === 'resource' && text(body.mime, 120)
  && hash(body.sha256) && (body.hash === undefined || body.hash === body.sha256)
  && integer(body.bytes, 1) && integer(body.chunks, 1) && body.encoding === 'json'
  && body.compression === 'none' && validBindings(body.bindings)

const validEnd = (body: Record<string, unknown>) => onlyKeys(body, ['transferId', 'sha256'])
  && id(body.transferId) && hash(body.sha256)

const validPageReset = (body: Record<string, unknown>) => onlyKeys(body, ['reason', 'urlOrigin', 'viewport'])
  && text(body.reason, 160) && text(body.urlOrigin, 2048) && validViewport(body.viewport)

const validSurface = (body: Record<string, unknown>) => onlyKeys(body, ['dom', 'reason', 'fallback'])
  && ['available', 'unavailable', 'degraded'].includes(String(body.dom)) && text(body.reason, 160)
  && (body.fallback === undefined || body.fallback === 'video')

const validPatch = (body: Record<string, unknown>) => onlyKeys(body, ['baseSeq', 'seq', 'ops'])
  && integer(body.baseSeq) && integer(body.seq) && Array.isArray(body.ops)

export const validateRwmEnvelopeBody = (type: string, value: unknown) => {
  if (!isObject(value)) return false
  if (type === 'snapshot.begin') return validSnapshotBegin(value)
  if (type === 'resource.begin') return validResourceBegin(value)
  if (type === 'snapshot.end' || type === 'resource.end') return validEnd(value)
  if (type === 'page.reset') return validPageReset(value)
  if (type === 'surface.status') return validSurface(value)
  return type === 'patch' && validPatch(value)
}
