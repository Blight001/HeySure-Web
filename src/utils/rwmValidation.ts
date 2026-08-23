import type { RwmNode, RwmPatchBody, RwmPatchOp, RwmSnapshot } from '@/types/rwm'
const RWM_LIMITS = { string: 16_384, resourceBytes: 4 * 1024 * 1024, nodes: 50_000, patchOps: 500 }

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min = 0) => Number.isSafeInteger(value) && Number(value) >= min
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const shortString = (value: unknown, limit = RWM_LIMITS.string) => typeof value === 'string' && value.length <= limit
const HASH = /^[a-f0-9]{64}$/i
const SNAPSHOT_KEYS = new Set(['rootId', 'nodes', 'styles', 'resources', 'viewport', 'scroll', 'focusId'])
const NODE_BASE_KEYS = ['id', 'parent', 'index', 'kind']
const ELEMENT_NODE_KEYS = new Set([...NODE_BASE_KEYS, 'tag', 'attrs', 'styleId', 'box', 'state', 'scroll', 'flags'])
const TEXT_NODE_KEYS = new Set([...NODE_BASE_KEYS, 'text'])
const onlyKeys = (value: Record<string, unknown>, allowed: Set<string>) => Object.keys(value).every(key => allowed.has(key))
const validateFiniteRecord = (value: unknown, keys: string[]) => isObject(value) && onlyKeys(value, new Set(keys)) && keys.every(key => finite(value[key]))
const validStateValue = (value: unknown) => value === undefined || (typeof value === 'string' && value.length <= 65_536)
const validateState = (value: unknown) => isObject(value) && onlyKeys(value, new Set(['value', 'checked', 'selected', 'disabled', 'selectedIndex']))
  && validStateValue(value.value) && (value.checked === undefined || typeof value.checked === 'boolean')
  && (value.selected === undefined || typeof value.selected === 'boolean')
  && (value.disabled === undefined || typeof value.disabled === 'boolean')
  && (value.selectedIndex === undefined || (Number.isSafeInteger(value.selectedIndex) && Number(value.selectedIndex) >= -1))

const validateRecordStrings = (value: unknown, maxKeys: number, maxValue = 4096) => {
  if (!isObject(value) || Object.keys(value).length > maxKeys) return false
  return Object.entries(value).every(([key, item]) => key.length <= 128 && shortString(item, maxValue))
}

const validateNodeGeometry = (value: Record<string, unknown>) => {
  if (value.box !== undefined && (!validateFiniteRecord(value.box, ['x', 'y', 'width', 'height']) || Number((value.box as Record<string, number>).width) < 0 || Number((value.box as Record<string, number>).height) < 0)) return false
  if (value.scroll !== undefined && (!validateFiniteRecord(value.scroll, ['left', 'top', 'width', 'height'])
    || Number((value.scroll as Record<string, number>).width) < 0 || Number((value.scroll as Record<string, number>).height) < 0)) return false
  return true
}
const validateElementNode = (value: Record<string, unknown>) => {
  if (!onlyKeys(value, ELEMENT_NODE_KEYS) || !shortString(value.tag, 32)) return false
  if (value.attrs !== undefined && !validateRecordStrings(value.attrs, 64)) return false
  if (value.styleId !== undefined && !integer(value.styleId)) return false
  if (!validateNodeGeometry(value)) return false
  if (value.flags !== undefined && (!Array.isArray(value.flags) || value.flags.length > 2
    || new Set(value.flags).size !== value.flags.length || !value.flags.every(flag => flag === 'sensitive' || flag === 'pixel-fallback'))) return false
  return value.state === undefined || validateState(value.state)
}

const validateNode = (value: unknown): value is RwmNode => {
  if (!isObject(value) || !integer(value.id, 1) || !(value.parent === null || integer(value.parent, 1))) return false
  if (!integer(value.index) || (value.kind !== 'element' && value.kind !== 'text')) return false
  if (value.kind === 'text') return onlyKeys(value, TEXT_NODE_KEYS) && shortString(value.text || '', 65_536)
  return validateElementNode(value)
}

const validateResource = (value: unknown) => {
  if (!isObject(value) || !onlyKeys(value, new Set(['hash', 'mime', 'size', 'bindings'])) || typeof value.hash !== 'string' || !HASH.test(value.hash)) return false
  if (!shortString(value.mime, 120) || !integer(value.size, 1) || Number(value.size) > RWM_LIMITS.resourceBytes) return false
  return Array.isArray(value.bindings) && value.bindings.length <= RWM_LIMITS.nodes
    && value.bindings.every(binding => isObject(binding) && onlyKeys(binding, new Set(['nodeId', 'slot']))
      && integer(binding.nodeId, 1) && (binding.slot === 'src' || binding.slot === 'poster'))
}

const validateTree = (nodes: RwmNode[], rootId: number) => {
  const byId = new Map(nodes.map(node => [node.id, node]))
  if (byId.size !== nodes.length || !byId.has(rootId)) throw new Error('snapshot_node_ids')
  const children = new Map<number, number[]>()
  for (const node of nodes) {
    if (node.id === rootId) {
      if (node.parent !== null) throw new Error('snapshot_root_parent')
      continue
    }
    if (node.parent == null || !byId.has(node.parent)) throw new Error('snapshot_parent')
    const siblings = children.get(node.parent) || []
    siblings.push(node.id)
    children.set(node.parent, siblings)
  }
  const visited = new Set<number>()
  const stack = [{ id: rootId, depth: 0 }]
  while (stack.length) {
    const { id, depth } = stack.pop()!
    if (depth > 512) throw new Error('snapshot_depth')
    if (visited.has(id)) throw new Error('snapshot_cycle')
    visited.add(id)
    stack.push(...(children.get(id) || []).map(child => ({ id: child, depth: depth + 1 })))
  }
  if (visited.size !== nodes.length) throw new Error('snapshot_disconnected')
}

const validStyle = (style: unknown) => validateRecordStrings(style, 128, 2048)
  || (isObject(style) && integer(style.id) && validateRecordStrings(style.properties, 128, 2048))
const validateSnapshotArrays = (value: Record<string, unknown>) => {
  if (!Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > RWM_LIMITS.nodes || !value.nodes.every(validateNode)) throw new Error('snapshot_nodes')
  if (!Array.isArray(value.styles) || value.styles.length > 50_000 || !value.styles.every(validStyle)) throw new Error('snapshot_styles')
  if (value.resources !== undefined && (!Array.isArray(value.resources) || value.resources.length > 256 || !value.resources.every(validateResource))) throw new Error('snapshot_resources')
}
const validateSnapshotState = (value: Record<string, unknown>) => {
  if (value.viewport !== undefined && (!validateFiniteRecord(value.viewport, ['width', 'height', 'dpr'])
    || Object.values(value.viewport as Record<string, number>).some(item => item <= 0))) throw new Error('snapshot_viewport')
  if (value.focusId !== undefined && value.focusId !== null && !integer(value.focusId, 1)) throw new Error('snapshot_focus')
  if (value.scroll === undefined) return
  if (!isObject(value.scroll)) throw new Error('snapshot_scroll')
  if (!onlyKeys(value.scroll, new Set(['x', 'y', 'left', 'top']))) throw new Error('snapshot_scroll')
  const positions = [value.scroll.x, value.scroll.y, value.scroll.left, value.scroll.top].filter(item => item !== undefined)
  if (!positions.every(finite)) throw new Error('snapshot_scroll')
}

export const validateRwmSnapshot = (value: unknown): RwmSnapshot => {
  if (!isObject(value) || !onlyKeys(value, SNAPSHOT_KEYS) || !integer(value.rootId, 1)) throw new Error('snapshot_shape')
  validateSnapshotArrays(value)
  validateSnapshotState(value)
  const snapshot = value as unknown as RwmSnapshot
  validateTree(snapshot.nodes, snapshot.rootId)
  return snapshot
}

const validateNodeAdd = (value: Record<string, unknown>) => validateNode(value.node)
  || (Array.isArray(value.nodes) && value.nodes.length > 0 && value.nodes.every(validateNode))
const validateScroll = (value: Record<string, unknown>) => {
  const positions = [value.x, value.y, value.left, value.top].filter(item => item !== undefined)
  return (value.id === undefined || integer(value.id, 1)) && positions.length > 0 && positions.every(finite)
}
const PATCH_VALIDATORS: Record<string, (value: Record<string, unknown>) => boolean> = {
  'node.add': validateNodeAdd,
  'node.remove': value => integer(value.id, 1),
  'node.move': value => integer(value.id, 1) && integer(value.parent, 1) && integer(value.index),
  'text.set': value => integer(value.id, 1) && shortString(value.text, 65_536),
  'style.set': value => integer(value.id, 1) && integer(value.styleId),
  'style.define': value => integer(value.styleId) && validateRecordStrings(value.style, 128, 2048),
  'state.set': value => integer(value.id, 1) && validateState(value.state),
  'attr.set': value => integer(value.id, 1) && shortString(value.name, 128) && shortString(value.value, 4096),
  'attr.remove': value => integer(value.id, 1) && shortString(value.name, 128),
  'scroll.set': validateScroll,
  'focus.set': value => value.id === null || integer(value.id, 1),
  'box.set': value => integer(value.id, 1) && isObject(value.box) && Object.values(value.box).every(finite),
  'resource.bind': value => integer(value.id, 1) && (value.attribute === 'src' || value.attribute === 'poster')
    && typeof value.hash === 'string' && HASH.test(value.hash),
}
const PATCH_KEYS: Record<string, Set<string>> = {
  'node.add': new Set(['op', 'node', 'nodes']), 'node.remove': new Set(['op', 'id']),
  'node.move': new Set(['op', 'id', 'parent', 'index']), 'text.set': new Set(['op', 'id', 'text']),
  'style.set': new Set(['op', 'id', 'styleId']), 'style.define': new Set(['op', 'styleId', 'style']),
  'state.set': new Set(['op', 'id', 'state']), 'attr.set': new Set(['op', 'id', 'name', 'value']),
  'attr.remove': new Set(['op', 'id', 'name']), 'scroll.set': new Set(['op', 'id', 'x', 'y', 'left', 'top']),
  'focus.set': new Set(['op', 'id']), 'box.set': new Set(['op', 'id', 'box']),
  'resource.bind': new Set(['op', 'id', 'attribute', 'hash']),
}
const validatePatchOp = (value: unknown): value is RwmPatchOp => isObject(value)
  && typeof value.op === 'string' && onlyKeys(value, PATCH_KEYS[value.op] || new Set()) && PATCH_VALIDATORS[value.op]?.(value) === true

export const validateRwmPatchBody = (value: unknown): RwmPatchBody => {
  if (!isObject(value) || !onlyKeys(value, new Set(['baseSeq', 'seq', 'ops'])) || !integer(value.baseSeq) || !Array.isArray(value.ops)
    || value.ops.length > RWM_LIMITS.patchOps || !value.ops.every(validatePatchOp)) throw new Error('patch_shape')
  return value as unknown as RwmPatchBody
}
