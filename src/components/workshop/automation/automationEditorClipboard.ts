import { STEP_TARGET_FIELDS, type StepClipboard, type StepEditor, type StepTargetField, type WorkflowNodePosition } from './automationTypes'

export function cloneEditorStep(step: StepEditor): StepEditor {
  return JSON.parse(JSON.stringify(step)) as StepEditor
}

export function uniqueCopyName(source: string, used: Set<string>) {
  const sourceName = source || 'step'
  const withSuffix = (suffix: string) => `${sourceName.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`
  let candidate = withSuffix('_copy')
  let suffix = 2
  while (used.has(candidate)) candidate = withSuffix(`_copy_${suffix++}`)
  return candidate
}

export function incomingTargets(steps: StepEditor[], targetId: string) {
  return steps.flatMap(step => STEP_TARGET_FIELDS
    .filter(field => step[field] === targetId)
    .map(field => ({ stepId: step.id, field })))
}

export function remapSelfTargets(step: StepEditor, sourceId: string, nextId: string) {
  STEP_TARGET_FIELDS.forEach(field => {
    if (step[field] === sourceId) step[field] = nextId
  })
}

export function clearStepTarget(step: StepEditor, targetId: string) {
  if (step.next === targetId) step.next = ''
  if (step.onTrue === targetId) step.onTrue = ''
  if (step.onFalse === targetId) step.onFalse = ''
  if (step.onDenied === targetId) step.onDenied = ''
  if (step.onError === targetId) step.onError = 'fail'
}

export function applyBranchTarget(step: StepEditor, branch: string, value: string) {
  if (branch === 'true') step.onTrue = value
  else if (branch === 'false') step.onFalse = value
  else if (branch === 'error') step.onError = value || 'fail'
  else if (branch === 'denied') step.onDenied = value
  else step.next = value
}

export function createClipboard(options: {
  step: StepEditor
  position: WorkflowNodePosition
  startStepId: string
  incoming: Array<{ stepId: string; field: StepTargetField }>
  cut: boolean
}): StepClipboard {
  return {
    step: cloneEditorStep(options.step),
    sourceId: options.step.id,
    position: { ...options.position },
    pasteCount: 0,
    restoreIncoming: options.cut,
    restoreAsStart: options.cut && options.startStepId === options.step.id,
    cutPending: options.cut,
    incoming: options.incoming,
  }
}

export function pasteClipboardStep(
  clipboard: StepClipboard,
  steps: StepEditor[],
  positions: Record<string, WorkflowNodePosition>,
) {
  const pasted = cloneEditorStep(clipboard.step)
  pasted.id = uniqueCopyName(clipboard.sourceId, new Set(steps.map(step => step.id)))
  if (pasted.type === 'mcp' || pasted.type === 'ai') {
    pasted.saveAs = uniqueCopyName(pasted.saveAs || 'result', new Set(steps.map(step => step.saveAs)))
  }
  remapSelfTargets(pasted, clipboard.sourceId, pasted.id)
  const offset = clipboard.cutPending ? 0 : 32 * (clipboard.pasteCount + 1)
  const nextPositions = {
    ...positions,
    [pasted.id]: { x: clipboard.position.x + offset, y: clipboard.position.y + offset },
  }
  clipboard.pasteCount += 1
  clipboard.cutPending = false
  const restoreIncoming = clipboard.restoreIncoming
  const restoreAsStart = clipboard.restoreAsStart
  clipboard.restoreIncoming = false
  clipboard.restoreAsStart = false
  return { pasted, nextPositions, restoreIncoming, restoreAsStart }
}

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export type EditorShortcut = 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'delete'

function resolvePrimaryShortcut(key: string, shift: boolean, hasSelection: boolean): EditorShortcut | null {
  if (key === 'z') return shift ? 'redo' : 'undo'
  if (key === 'y') return 'redo'
  if (key === 'c' && !hasSelection) return 'copy'
  if (key === 'x' && !hasSelection) return 'cut'
  if (key === 'v') return 'paste'
  return null
}

export function resolveEditorShortcut(
  event: KeyboardEvent,
  opts: { hasSelectedStep: boolean },
): EditorShortcut | null {
  if (event.defaultPrevented || isEditableTarget(event.target)) return null
  const key = event.key.toLowerCase()
  const primary = (event.ctrlKey || event.metaKey) && !event.altKey
  if (primary) return resolvePrimaryShortcut(key, event.shiftKey, Boolean(window.getSelection()?.toString()))
  if ((event.key === 'Delete' || event.key === 'Backspace') && opts.hasSelectedStep) return 'delete'
  return null
}
