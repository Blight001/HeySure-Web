import { computed, ref } from 'vue'
import {
  deleteEntry,
  deleteInstalledClawHubSkill,
  installClawHubSkill,
  readClawHubSkill,
  readEntry,
  readInstalledClawHubSkill,
  searchClawHubSkills,
  setInstalledClawHubSkillEndpoint,
  updateEntry,
  updateInstalledClawHubSkill,
  type ClawHubInstalledSkillDetail,
  type ClawHubSkillDetail,
  type ClawHubSkillSearchResult,
} from '@/api/librarian'
import { getAuthToken } from '@/api/http'
import { clawhubScanLabel, endpointLabel, pickInstalledEndpointKind, stripSkillFrontmatter } from './knowledgeFormat'
import { filterInstalledThoughts, normalizeDetailQuery } from './knowledgeFilters'
import type {
  InheritanceThoughtItem,
  InstallEndpointKind,
  InstalledEndpointKind,
  KnowledgeShared,
  ThoughtEndpointFilter,
} from './types'

export function createClawHubState() {
  return {
    clawhubQuery: ref(''),
    clawhubModalOpen: ref(false),
    clawhubSearching: ref(false),
    clawhubError: ref(''),
    clawhubNotice: ref(''),
    clawhubResults: ref<ClawHubSkillSearchResult[]>([]),
    clawhubDetailLoading: ref(false),
    clawhubInspectingSlug: ref(''),
    clawhubSelected: ref<ClawHubSkillDetail | null>(null),
    clawhubInstallingSlug: ref(''),
    installedClawhubModalOpen: ref(false),
    installedClawhubLoading: ref(false),
    installedClawhubSaving: ref(false),
    installedClawhubDeleting: ref(false),
    installedClawhubError: ref(''),
    installedClawhubNotice: ref(''),
    installedClawhubSelected: ref<ClawHubInstalledSkillDetail | null>(null),
    installedClawhubDraft: ref(''),
    installedClawhubEditMode: ref(false),
    installedKnowledgeMemoryId: ref(''),
    installEndpointKind: ref<InstallEndpointKind>('auto'),
    thoughtEndpointFilter: ref<ThoughtEndpointFilter>('all'),
    installedEndpointSaving: ref(false),
  }
}

export type ClawHubState = ReturnType<typeof createClawHubState>

export async function searchClawHub(state: ClawHubState) {
  const query = state.clawhubQuery.value.trim()
  if (!query) {
    state.clawhubError.value = '请输入搜索关键词'
    return
  }
  state.clawhubSearching.value = true
  state.clawhubError.value = ''
  state.clawhubNotice.value = ''
  try {
    const data = await searchClawHubSkills(getAuthToken(), query, 20)
    state.clawhubResults.value = data.results || []
  } catch (err) {
    state.clawhubError.value = (err as Error).message || '搜索失败'
  } finally {
    state.clawhubSearching.value = false
  }
}

export function openClawHubModal(state: ClawHubState) {
  state.clawhubModalOpen.value = true
  state.clawhubError.value = ''
  state.clawhubNotice.value = ''
  state.installEndpointKind.value = 'auto'
}

export function closeClawHubModal(state: ClawHubState) {
  state.clawhubModalOpen.value = false
  state.clawhubError.value = ''
  state.clawhubNotice.value = ''
  state.clawhubDetailLoading.value = false
  state.clawhubInspectingSlug.value = ''
}

export async function inspectClawHubSkill(state: ClawHubState, slug: string) {
  const targetSlug = String(slug || '').trim()
  if (!targetSlug) return
  state.clawhubDetailLoading.value = true
  state.clawhubInspectingSlug.value = targetSlug
  state.clawhubError.value = ''
  state.clawhubNotice.value = ''
  state.clawhubModalOpen.value = true
  try {
    state.clawhubSelected.value = await readClawHubSkill(getAuthToken(), targetSlug)
  } catch (err) {
    state.clawhubError.value = (err as Error).message || '详情加载失败'
  } finally {
    state.clawhubDetailLoading.value = false
    state.clawhubInspectingSlug.value = ''
  }
}

export async function installSelectedClawHubSkill(
  state: ClawHubState,
  shared: KnowledgeShared,
  force = false,
) {
  const selected = state.clawhubSelected.value
  const slug = selected?.slug
  if (!slug) return
  state.clawhubInstallingSlug.value = slug
  state.clawhubError.value = ''
  state.clawhubNotice.value = ''
  try {
    const installed = await installClawHubSkill(getAuthToken(), slug, {
      version: selected.version,
      force,
      endpoint_kind: state.installEndpointKind.value === 'auto' ? undefined : state.installEndpointKind.value,
    })
    shared.currentDetail.value = installed.entry
    state.clawhubSelected.value = { ...selected, installed: true }
    state.clawhubResults.value = state.clawhubResults.value.map(item =>
      item.slug === slug ? { ...item, installed: true } : item,
    )
    state.clawhubNotice.value = force ? `${slug} 已更新` : `${slug} 已安装到本地传承思想`
  } catch (err) {
    state.clawhubError.value = (err as Error).message || '安装失败'
  } finally {
    state.clawhubInstallingSlug.value = ''
  }
}

export async function openInstalledClawHubSkill(state: ClawHubState, slug: string) {
  const targetSlug = String(slug || '').trim()
  if (!targetSlug) return
  resetInstalledEditor(state, true)
  try {
    const detail = await readInstalledClawHubSkill(getAuthToken(), targetSlug)
    state.installedClawhubSelected.value = detail
    state.installedClawhubDraft.value = detail.skill_card || ''
  } catch (err) {
    state.installedClawhubError.value = (err as Error).message || '加载失败'
  } finally {
    state.installedClawhubLoading.value = false
  }
}

function resetInstalledEditor(state: ClawHubState, loading: boolean) {
  state.installedClawhubModalOpen.value = true
  state.installedClawhubLoading.value = loading
  state.installedClawhubError.value = ''
  state.installedClawhubNotice.value = ''
  state.installedClawhubSelected.value = null
  state.installedClawhubDraft.value = ''
  state.installedClawhubEditMode.value = false
  state.installedKnowledgeMemoryId.value = ''
}

export async function openInheritanceThoughtItem(state: ClawHubState, item: InheritanceThoughtItem) {
  const memoryId = String(item.memory_id || '').trim()
  if (item.kind === 'knowledge' && memoryId) {
    await openKnowledgeThoughtItem(state, memoryId)
    return
  }
  await openInstalledClawHubSkill(state, item.slug)
}

async function openKnowledgeThoughtItem(state: ClawHubState, memoryId: string) {
  resetInstalledEditor(state, true)
  state.installedKnowledgeMemoryId.value = memoryId
  try {
    const detail = await readEntry(getAuthToken(), memoryId)
    state.installedClawhubSelected.value = {
      slug: memoryId,
      skill: { displayName: detail.title, source: 'topic' },
      skill_card: detail.body || '',
      metadata: { source: 'topic' },
      path: detail.file_path,
      present: true,
    }
    state.installedClawhubDraft.value = detail.body || ''
  } catch (err) {
    state.installedClawhubError.value = (err as Error).message || '条目加载失败'
  } finally {
    state.installedClawhubLoading.value = false
  }
}

export function closeInstalledClawHubModal(state: ClawHubState) {
  state.installedClawhubModalOpen.value = false
  state.installedClawhubLoading.value = false
  state.installedClawhubSaving.value = false
  state.installedClawhubDeleting.value = false
  state.installedClawhubError.value = ''
  state.installedClawhubNotice.value = ''
  state.installedClawhubEditMode.value = false
  state.installedKnowledgeMemoryId.value = ''
}

export async function requestCloseInstalledClawHubModal(state: ClawHubState, shared: KnowledgeShared) {
  const hasUnsavedChanges = state.installedClawhubEditMode.value
    && state.installedClawhubDraft.value !== (state.installedClawhubSelected.value?.skill_card || '')
  if (hasUnsavedChanges) {
    const ok = await shared.confirm({
      message: '本地快照还有未保存的修改，确认关闭吗？',
      type: 'warning',
      confirmText: '放弃并关闭',
      cancelText: '继续编辑',
    })
    if (!ok) return
  }
  closeInstalledClawHubModal(state)
}

export async function saveInstalledClawHubSkill(state: ClawHubState, shared: KnowledgeShared) {
  const slug = state.installedClawhubSelected.value?.slug
  if (!slug) return
  state.installedClawhubSaving.value = true
  state.installedClawhubError.value = ''
  state.installedClawhubNotice.value = ''
  try {
    if (state.installedKnowledgeMemoryId.value) {
      await saveKnowledgeThought(state, shared)
    } else {
      const updated = await updateInstalledClawHubSkill(getAuthToken(), slug, state.installedClawhubDraft.value)
      state.installedClawhubSelected.value = updated.detail
      state.installedClawhubDraft.value = updated.detail.skill_card || ''
      shared.currentDetail.value = updated.entry
    }
    state.installedClawhubNotice.value = '已保存'
    state.installedClawhubEditMode.value = false
  } catch (err) {
    state.installedClawhubError.value = (err as Error).message || '保存失败'
  } finally {
    state.installedClawhubSaving.value = false
  }
}

async function saveKnowledgeThought(state: ClawHubState, shared: KnowledgeShared) {
  const updated = await updateEntry(
    getAuthToken(),
    state.installedKnowledgeMemoryId.value,
    state.installedClawhubDraft.value,
  )
  state.installedClawhubSelected.value = {
    slug: state.installedKnowledgeMemoryId.value,
    skill: { displayName: updated.detail.title, source: 'topic' },
    skill_card: updated.detail.body || '',
    metadata: { source: 'topic' },
    path: updated.detail.file_path,
    present: true,
  }
  state.installedClawhubDraft.value = updated.detail.body || ''
  shared.currentDetail.value = updated.entry
}

export async function applyInstalledEndpoint(state: ClawHubState, kind: InstalledEndpointKind) {
  const slug = state.installedClawhubSelected.value?.slug
  const current = pickInstalledEndpointKind(state.installedClawhubSelected.value)
  if (!slug || kind === current) return
  state.installedEndpointSaving.value = true
  state.installedClawhubError.value = ''
  state.installedClawhubNotice.value = ''
  try {
    const res = await setInstalledClawHubSkillEndpoint(getAuthToken(), slug, kind)
    state.installedClawhubSelected.value = res.detail
    state.installedClawhubNotice.value = `已改端为「${endpointLabel(kind)}」`
  } catch (err) {
    state.installedClawhubError.value = (err as Error).message || '改端失败'
  } finally {
    state.installedEndpointSaving.value = false
  }
}

export async function removeInstalledClawHubSkill(state: ClawHubState, shared: KnowledgeShared) {
  const slug = state.installedClawhubSelected.value?.slug
  if (!slug) return
  const isKnowledge = Boolean(state.installedKnowledgeMemoryId.value)
  const ok = await shared.confirm({
    message: isKnowledge
      ? `确认永久删除传承知识「${state.installedClawhubSelected.value?.skill?.displayName || slug}」？此操作不可撤销。`
      : `确认删除本地快照 ${slug}？删除后需要重新安装。`,
    type: 'warning',
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return
  await deleteInstalledSnapshot(state, shared, slug, isKnowledge)
}

async function deleteInstalledSnapshot(
  state: ClawHubState,
  shared: KnowledgeShared,
  slug: string,
  isKnowledge: boolean,
) {
  state.installedClawhubDeleting.value = true
  state.installedClawhubError.value = ''
  try {
    const token = getAuthToken()
    const deleted = isKnowledge
      ? await deleteEntry(token, state.installedKnowledgeMemoryId.value)
      : await deleteInstalledClawHubSkill(token, slug)
    shared.currentDetail.value = deleted.entry
    if (!isKnowledge) {
      state.clawhubResults.value = state.clawhubResults.value.map(item =>
        item.slug === slug ? { ...item, installed: false } : item,
      )
    }
    state.installedClawhubModalOpen.value = false
    state.installedClawhubSelected.value = null
    state.installedClawhubDraft.value = ''
  } catch (err) {
    state.installedClawhubError.value = (err as Error).message || '删除失败'
  } finally {
    state.installedClawhubDeleting.value = false
  }
}

export function useKnowledgeClawHub(shared: KnowledgeShared) {
  const state = createClawHubState()
  const inheritanceThoughts = computed(() => shared.currentDetail.value?.inheritance_tools || null)
  const filteredInstalledThoughts = computed(() => filterInstalledThoughts(
    inheritanceThoughts.value?.installed || [],
    normalizeDetailQuery(shared.detailQuery.value),
    state.thoughtEndpointFilter.value,
  ))
  const installedClawhubIsKnowledge = computed(() => Boolean(state.installedKnowledgeMemoryId.value))
  const installedClawhubPreview = computed(() => stripSkillFrontmatter(state.installedClawhubDraft.value))
  const installedEndpointKind = computed(() => pickInstalledEndpointKind(state.installedClawhubSelected.value))
  const clawhubScanText = computed(() => clawhubScanLabel(state.clawhubSelected.value))
  return {
    ...state,
    inheritanceThoughts,
    filteredInstalledThoughts,
    installedClawhubIsKnowledge,
    installedClawhubPreview,
    installedEndpointKind,
    clawhubScanLabel: clawhubScanText,
    searchClawHub: () => searchClawHub(state),
    openClawHubModal: () => openClawHubModal(state),
    closeClawHubModal: () => closeClawHubModal(state),
    inspectClawHubSkill: (slug: string) => inspectClawHubSkill(state, slug),
    installSelectedClawHubSkill: (force = false) => installSelectedClawHubSkill(state, shared, force),
    openInstalledClawHubSkill: (slug: string) => openInstalledClawHubSkill(state, slug),
    openInheritanceThoughtItem: (item: InheritanceThoughtItem) => openInheritanceThoughtItem(state, item),
    closeInstalledClawHubModal: () => closeInstalledClawHubModal(state),
    requestCloseInstalledClawHubModal: () => requestCloseInstalledClawHubModal(state, shared),
    saveInstalledClawHubSkill: () => saveInstalledClawHubSkill(state, shared),
    applyInstalledEndpoint: (kind: InstalledEndpointKind) => applyInstalledEndpoint(state, kind),
    removeInstalledClawHubSkill: () => removeInstalledClawHubSkill(state, shared),
  }
}
