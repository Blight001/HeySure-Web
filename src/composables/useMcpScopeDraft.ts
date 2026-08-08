import { computed, ref, type Ref } from 'vue'

const asSet = (tools: Iterable<string>) => new Set(
  Array.from(tools, tool => String(tool || '').trim()).filter(Boolean),
)

const setsEqual = (left: Set<string>, right: Set<string>) => {
  if (left.size !== right.size) return false
  for (const tool of left) if (!right.has(tool)) return false
  return true
}

/**
 * Keeps an MCP permission draft separate from background scope refreshes.
 * Remote state may refresh while the editor is open, but it only replaces an
 * untouched draft. Dirty drafts are retained until save or explicit close.
 */
export const useMcpScopeDraft = (capabilities: Ref<string[]>) => {
  const selected = ref<Set<string>>(new Set())
  const saved = ref<Set<string>>(new Set())
  const editing = ref(false)
  const pendingRemote = ref<Set<string> | null>(null)

  const dirty = computed(() => !setsEqual(selected.value, saved.value))
  const selectedCount = computed(() =>
    capabilities.value.filter(tool => selected.value.has(tool)).length,
  )
  const allSelected = computed(() =>
    capabilities.value.length > 0
      && capabilities.value.every(tool => selected.value.has(tool)),
  )
  const remoteUpdatePending = computed(() => pendingRemote.value !== null)

  const commit = (tools: Iterable<string>) => {
    const next = asSet(tools)
    selected.value = new Set(next)
    saved.value = new Set(next)
    pendingRemote.value = null
  }

  const applyRemote = (tools: Iterable<string>) => {
    const next = asSet(tools)
    if (editing.value && dirty.value) {
      pendingRemote.value = next
      return false
    }
    commit(next)
    return true
  }

  const beginEditing = () => {
    editing.value = true
  }

  const endEditing = () => {
    editing.value = false
    if (pendingRemote.value) {
      commit(pendingRemote.value)
      return
    }
    selected.value = new Set(saved.value)
  }

  const toggle = (tool: string) => {
    const next = new Set(selected.value)
    if (next.has(tool)) next.delete(tool)
    else next.add(tool)
    selected.value = next
  }

  const toggleAll = () => {
    selected.value = allSelected.value ? new Set() : new Set(capabilities.value)
  }

  return {
    selected,
    dirty,
    selectedCount,
    allSelected,
    remoteUpdatePending,
    applyRemote,
    commit,
    beginEditing,
    endEditing,
    toggle,
    toggleAll,
  }
}
