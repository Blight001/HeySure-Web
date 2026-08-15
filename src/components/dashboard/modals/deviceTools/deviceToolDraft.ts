import type {
  DeviceDynamicTool,
  DeviceToolStat,
  DeviceToolType,
  DynamicToolDefinition,
  DynamicToolStep,
  ToolRuntime,
} from '@/api/deviceTools'

export type ParamRow = { name: string; type: string; description: string; required: boolean }
export type ArgRow = { key: string; value: string }
export type StepDraft = {
  op: 'call' | 'set' | 'return'
  tool: string
  args: ArgRow[]
  save_as: string
  name: string
  value: string
}
export type DesktopKind = 'js' | ToolRuntime

export interface Draft {
  original: string
  name: string
  description: string
  params: ParamRow[]
  steps: StepDraft[]
  js: string
  desktopKind: DesktopKind
  source: string
  permissions: string
}

export const TABS: { key: DeviceToolType; label: string }[] = [
  { key: 'desktop', label: '桌面端' },
  { key: 'browser', label: '浏览器' },
  { key: 'android', label: '安卓端' },
]

export const NAME_RE = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/

export const DESKTOP_KINDS: { key: DesktopKind; label: string }[] = [
  { key: 'js', label: 'JS（cap 能力库）' },
  { key: 'python', label: 'Python' },
  { key: 'powershell', label: 'PowerShell' },
  { key: 'shell', label: 'Shell' },
]

export const JS_TEMPLATE = "// 可用: args(入参) / cap(设备能力库) / ctx(workspaceRoot)\n// 例: return await cap.call('keyboard.type', { text: args.text })\nreturn await cap.call('namespace.tool', args)"

export const SOURCE_TEMPLATES: Record<ToolRuntime, string> = {
  python: "# 可用: args(dict 入参)。把结果赋给 result 返回；print 输出进 stdout。\n# 例: result = {'sum': args.get('a', 0) + args.get('b', 0)}\nresult = {'ok': True}",
  powershell: "# 支持 ${args.x} 模板。\nWrite-Output \"hello ${args.name}\"",
  shell: "# 支持 ${args.x} 模板。\necho \"hello ${args.name}\"",
}

const KNOWN_TEMPLATES = [JS_TEMPLATE, ...Object.values(SOURCE_TEMPLATES)]

export const sourceTemplate = (kind: DesktopKind): string => (kind === 'js' ? '' : SOURCE_TEMPLATES[kind])

export const coerce = (raw: string): unknown => {
  const v = String(raw ?? '')
  if (v.includes('${')) return v
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

export const stringifyValue = (value: unknown): string =>
  value == null ? '' : typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)

export const blankStep = (): StepDraft => ({ op: 'call', tool: '', args: [], save_as: '', name: '', value: '' })

export function createBlankDraft(isDesktop: boolean): Draft {
  return {
    original: '',
    name: '',
    description: '',
    params: [],
    steps: [blankStep()],
    js: isDesktop ? JS_TEMPLATE : '',
    desktopKind: 'js',
    source: '',
    permissions: '',
  }
}

function schemaProperties(schema: DeviceDynamicTool['input_schema']): Record<string, unknown> {
  const props = schema?.properties
  if (props && typeof props === 'object') return props as Record<string, unknown>
  return {}
}

function schemaRequired(schema: DeviceDynamicTool['input_schema']): string[] {
  if (!Array.isArray(schema?.required)) return []
  return schema.required as string[]
}

function paramFromSpec(name: string, spec: unknown, required: string[]): ParamRow {
  const row = spec && typeof spec === 'object' ? spec as Record<string, unknown> : {}
  return {
    name,
    type: String(row.type || 'string'),
    description: String(row.description || ''),
    required: required.includes(name),
  }
}

export function paramsFromSchema(schema: DeviceDynamicTool['input_schema']): ParamRow[] {
  const required = schemaRequired(schema)
  return Object.entries(schemaProperties(schema)).map(([name, spec]) => paramFromSpec(name, spec, required))
}

function argsFromStep(step: DynamicToolStep): ArgRow[] {
  return Object.entries(step.args || {}).map(([key, value]) => ({ key, value: stringifyValue(value) }))
}

function stepToDraft(step: DynamicToolStep): StepDraft {
  return {
    op: step.op,
    tool: String(step.tool || ''),
    args: argsFromStep(step),
    save_as: String(step.save_as || ''),
    name: String(step.name || ''),
    value: stringifyValue(step.value),
  }
}

export function stepsFromCode(code?: DynamicToolStep[]): StepDraft[] {
  return (code || []).map(stepToDraft)
}

export function desktopKindOf(tool: DeviceDynamicTool): DesktopKind {
  if (tool.code_kind === 'runtime' && tool.runtime) return tool.runtime
  return 'js'
}

export function toolToDraft(tool: DeviceDynamicTool, isDesktop: boolean): Draft {
  const draft: Draft = {
    original: tool.name,
    name: tool.name,
    description: tool.description,
    params: paramsFromSchema(tool.input_schema),
    steps: stepsFromCode(tool.code),
    js: String(tool.js || ''),
    desktopKind: desktopKindOf(tool),
    source: String(tool.source || ''),
    permissions: (tool.permissions || []).join(', '),
  }
  if (!draft.steps.length) draft.steps = [blankStep()]
  if (isDesktop && draft.desktopKind === 'js' && !draft.js.trim()) draft.js = JS_TEMPLATE
  return draft
}

export function buildInputSchema(params: ParamRow[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const p of params) {
    const name = p.name.trim()
    if (!name) continue
    properties[name] = { type: p.type, ...(p.description.trim() ? { description: p.description.trim() } : {}) }
    if (p.required) required.push(name)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

function buildCallStep(step: StepDraft): DynamicToolStep {
  const args: Record<string, unknown> = {}
  for (const a of step.args) {
    const key = a.key.trim()
    if (key) args[key] = coerce(a.value)
  }
  const out: DynamicToolStep = { op: 'call', tool: step.tool.trim(), args }
  if (step.save_as.trim()) out.save_as = step.save_as.trim()
  return out
}

export function buildCode(steps: StepDraft[]): DynamicToolStep[] {
  return steps.map((step) => {
    if (step.op === 'set') return { op: 'set', name: step.name.trim(), value: coerce(step.value) }
    if (step.op === 'return') return { op: 'return', value: coerce(step.value) }
    return buildCallStep(step)
  })
}

function validateDraftBasics(d: Draft): string {
  if (!NAME_RE.test(d.name.trim())) return '工具名不合法（小写字母/数字/点，如 custom.collect）'
  if (!d.description.trim()) return '请填写工具说明'
  return ''
}

function baseDefinition(d: Draft) {
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    input_schema: buildInputSchema(d.params),
  }
}

function buildJsDefinition(d: Draft): { error?: string; definition?: DynamicToolDefinition } {
  if (!d.js.trim()) return { error: '请填写 JS 代码' }
  return { definition: { ...baseDefinition(d), code_kind: 'js', js: d.js } }
}

function parsePermissions(raw: string): string[] {
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
}

function buildRuntimeDefinition(d: Draft): { error?: string; definition?: DynamicToolDefinition } {
  if (!d.source.trim()) return { error: '请填写运行时源码' }
  return {
    definition: {
      ...baseDefinition(d),
      code_kind: 'runtime',
      runtime: d.desktopKind as ToolRuntime,
      source: d.source,
      permissions: parsePermissions(d.permissions),
    },
  }
}

function validateProgramSteps(steps: StepDraft[]): string {
  if (!steps.length) return '至少需要一条指令'
  for (const step of steps) {
    if (step.op === 'call' && !step.tool.trim()) return 'call 指令需要选择目标工具'
    if (step.op === 'set' && !step.name.trim()) return 'set 指令需要变量名'
  }
  return ''
}

function buildProgramDefinition(d: Draft): { error?: string; definition?: DynamicToolDefinition } {
  const error = validateProgramSteps(d.steps)
  if (error) return { error }
  return { definition: { ...baseDefinition(d), code_kind: 'program', code: buildCode(d.steps) } }
}

export type DraftBuildMode = 'js' | 'runtime' | 'program'

export function draftBuildMode(isJs: boolean, isRuntime: boolean): DraftBuildMode {
  if (isJs) return 'js'
  if (isRuntime) return 'runtime'
  return 'program'
}

export function buildDraftDefinition(d: Draft, mode: DraftBuildMode): { error?: string; definition?: DynamicToolDefinition } {
  const basic = validateDraftBasics(d)
  if (basic) return { error: basic }
  if (mode === 'js') return buildJsDefinition(d)
  if (mode === 'runtime') return buildRuntimeDefinition(d)
  return buildProgramDefinition(d)
}

export function applyDesktopKindChange(d: Draft) {
  if (d.desktopKind === 'js') {
    if (!d.js.trim() || KNOWN_TEMPLATES.includes(d.source.trim())) d.js = d.js.trim() || JS_TEMPLATE
    return
  }
  if (!d.source.trim() || KNOWN_TEMPLATES.includes(d.source.trim())) {
    d.source = sourceTemplate(d.desktopKind)
  }
}

export const ratePct = (s?: DeviceToolStat) => (s ? Math.round((s.failure_rate || 0) * 100) : 0)

export const actionLabel = (a: string) =>
  ({ upsert: '修改', delete: '删除', restore: '回滚' } as Record<string, string>)[a] || a
