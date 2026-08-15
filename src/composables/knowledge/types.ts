import type { Ref } from 'vue'
import type { KnowledgeEntryItem } from '@/api/librarian'
import type { KnowledgeItem, User } from '@/types'

export type { KnowledgeItem }

export type KnowledgeConfirm = (options: {
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  confirmText?: string
  cancelText?: string
}) => Promise<boolean>

export type KnowledgePanelEmit = {
  (e: 'refresh-user', user: User): void
  (e: 'view-all-mcp'): void
  (e: 'manage-device-tools', payload?: { deviceType?: string }): void
}

export interface KnowledgeShared {
  currentDetail: Ref<KnowledgeEntryItem | null>
  selectedItem: Ref<KnowledgeItem | null>
  detailQuery: Ref<string>
  confirm: KnowledgeConfirm
  emit: KnowledgePanelEmit
}

export type IntrinsicPersonaAgent = NonNullable<KnowledgeEntryItem['intrinsic_personas']>['agents'][number]
export type SystemPromptSection = NonNullable<KnowledgeEntryItem['system_prompts']>['sections'][number]
export type InheritanceSkillDevice = NonNullable<KnowledgeEntryItem['inheritance_skills']>['devices'][number]
export type InheritanceSkillTool = InheritanceSkillDevice['tools'][number]
export type InheritanceServerCategory = NonNullable<
  NonNullable<KnowledgeEntryItem['inheritance_skills']>['server_categories']
>[number]
export type InheritanceThoughtItem = NonNullable<KnowledgeEntryItem['inheritance_tools']>['installed'][number]

export type ThoughtEndpointFilter = 'all' | 'any' | 'desktop' | 'browser'
export type InstallEndpointKind = 'auto' | 'any' | 'desktop' | 'browser'
export type InstalledEndpointKind = 'any' | 'desktop' | 'browser'

export interface PropertyDraftTool {
  name: string
  description: string
  parameters: Array<{ name: string; description: string }>
}

export interface PromptDraftItem {
  key: string
  content: string | number
}

export interface InheritanceToolTab {
  key: string
  device: InheritanceSkillDevice
  tool: InheritanceSkillTool
}

export interface DetailPresentation {
  eyebrow: string
  title: string
  description: string
  icon: 'robot' | 'compass' | 'bolt' | 'dna' | 'book'
  searchPlaceholder: string
  resultText: string
}

export interface McpTestTarget {
  device: InheritanceSkillDevice
  tool: InheritanceSkillTool
}

export interface ToolParamSource {
  name?: string
  parameters?: Array<{ name: string; type: string; required: boolean; description: string }>
  inputSchema?: Record<string, any>
}

// Shallow panel facade for child views. Avoid ReturnType<reactive({...})> which overflows TS.
export type KnowledgePanelApi = Record<string, any>
