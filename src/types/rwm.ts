export type RwmSurfacePreference = 'auto' | 'dom' | 'video'
export type RwmPhase = 'idle' | 'negotiating' | 'snapshot' | 'ready' | 'resyncing' | 'fallback' | 'error'

export interface RwmEnvelope<T = unknown> {
  v: 1
  type: 'snapshot.begin' | 'snapshot.end' | 'resource.begin' | 'resource.end' | 'patch' | 'page.reset' | 'surface.status'
  sessionId: string
  pageId: string
  epoch: number
  seq: number
  ts: number
  body: T
}

export interface RwmViewport {
  width: number
  height: number
  dpr: number
}

export interface RwmSnapshotBegin {
  transferId: string
  kind: 'snapshot'
  baseSeq: number
  encoding: 'json'
  compression: 'gzip' | 'none'
  bytes: number
  chunks: number
  sha256: string
  viewport?: RwmViewport
  reason?: string
}

export interface RwmResourceBegin {
  transferId: string
  kind: 'resource'
  mime: string
  sha256: string
  bytes: number
  chunks: number
  bindings?: Array<{ nodeId: number; slot: 'src' | 'poster' }>
}

export interface RwmNode {
  id: number
  parent: number | null
  index: number
  kind: 'element' | 'text'
  tag?: string
  text?: string
  attrs?: Record<string, string>
  styleId?: number
  state?: Record<string, unknown>
  box?: Record<string, number>
  flags?: string[]
  scroll?: { left: number; top: number; width: number; height: number }
}

export interface RwmSnapshot {
  rootId: number
  nodes: RwmNode[]
  styles: Array<Record<string, string> | { id: number; properties: Record<string, string> }>
  resources?: Array<{ hash: string; mime: string; size: number; bindings: Array<{ nodeId: number; slot: 'src' | 'poster' }> }>
  focusId?: number | null
  scroll?: { x?: number; y?: number; left?: number; top?: number }
}

export type RwmPatchOp =
  | { op: 'node.add'; node?: RwmNode; nodes?: RwmNode[] }
  | { op: 'node.remove'; id: number }
  | { op: 'node.move'; id: number; parent: number; index: number }
  | { op: 'attr.set'; id: number; name: string; value: string }
  | { op: 'attr.remove'; id: number; name: string }
  | { op: 'text.set'; id: number; text: string }
  | { op: 'style.set'; id: number; styleId: number }
  | { op: 'style.define'; styleId: number; style: Record<string, string> }
  | { op: 'state.set'; id: number; state: Record<string, unknown> }
  | { op: 'scroll.set'; id?: number; x?: number; y?: number; left?: number; top?: number }
  | { op: 'box.set'; id: number; box: Record<string, number> }
  | { op: 'focus.set'; id?: number | null }
  | { op: 'resource.bind'; id: number; attribute: 'src' | 'poster'; hash: string }

export interface RwmPatchBody {
  baseSeq: number
  seq?: number
  ops: RwmPatchOp[]
}

export interface RwmBinaryChunk {
  sessionId: string
  transferId: string
  kind: 'snapshot' | 'resource'
  index: number
  total: number
  hash?: string
  mime?: string
  bytes: Uint8Array
}

export interface RwmAction {
  kind: 'web-action'
  requestId: string
  pageId: string
  epoch: number
  target: { nodeId: number }
  action: 'click' | 'doubleClick' | 'contextMenu' | 'type' | 'key' | 'scroll' | 'select' | 'focus'
  args: Record<string, unknown>
  clientSeq: number
}

export interface RwmActionResult {
  kind: 'web-action-result'
  requestId: string
  status: 'ok' | 'stale' | 'denied' | 'failed'
  appliedSeq?: number
  message?: string
  errorCode?: string
}
