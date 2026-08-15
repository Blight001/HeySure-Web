import { computed, reactive, ref, useAttrs } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { pickRootAttrs } from './knowledgeFormat'
import type { KnowledgeEntryItem } from '@/api/librarian'
import type { KnowledgeItem, KnowledgePanelApi, KnowledgePanelEmit, KnowledgeShared } from './types'
import { useKnowledgeClawHub } from './useKnowledgeClawHub'
import { useKnowledgeDetail } from './useKnowledgeDetail'
import { useKnowledgeInheritance } from './useKnowledgeInheritance'
import { useKnowledgePersona } from './useKnowledgePersona'
import { useKnowledgePrompts } from './useKnowledgePrompts'

export function createKnowledgeShared(
  confirm: KnowledgeShared['confirm'],
  emit: KnowledgePanelEmit,
): KnowledgeShared {
  return {
    currentDetail: ref<KnowledgeEntryItem | null>(null),
    selectedItem: ref<KnowledgeItem | null>(null),
    detailQuery: ref(''),
    confirm,
    emit,
  }
}

export function useKnowledgeBasePanel(emit: KnowledgePanelEmit): KnowledgePanelApi {
  const attrs = useAttrs()
  const { confirm } = useMessage()
  const shared = createKnowledgeShared(confirm, emit)
  const persona = useKnowledgePersona(shared)
  const prompts = useKnowledgePrompts(shared)
  const inheritance = useKnowledgeInheritance(shared)
  const clawhub = useKnowledgeClawHub(shared)
  const detail = useKnowledgeDetail(shared, { persona, prompts, inheritance, clawhub })
  return reactive({
    attrs,
    rootAttrs: computed(() => pickRootAttrs(attrs as Record<string, unknown>)),
    ...shared,
    ...persona,
    ...prompts,
    ...inheritance,
    ...clawhub,
    ...detail,
  }) as unknown as KnowledgePanelApi
}
