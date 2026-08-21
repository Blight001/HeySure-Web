<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ModelPreset } from '@/types'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { PRESET_AI_AVATARS, resolveAiAvatarUrl } from '@/utils/aiAvatar'
import AiConfigAppearancePanel from './AiConfigAppearancePanel.vue'
import AiConfigBotPanel from './AiConfigBotPanel.vue'
import AiConfigDevicePanel from './AiConfigDevicePanel.vue'
import AiConfigExternalMcpPanel from './AiConfigExternalMcpPanel.vue'

type SettingsSection = 'mcp' | 'bot' | 'appearance' | 'external-mcp'

interface Props {
  show: boolean
  mode: 'create' | 'edit'
  form: any | null
  deleteConfirm: boolean
  settingsSection: SettingsSection | ''
  availableMcpTools: string[]
  connectedDevices?: ConnectedDevice[]
  modelPresets: ModelPreset[]
  onClose: () => void
  onToggleSettingsSection: (section: SettingsSection) => void
  onToggleDeleteConfirm: () => void
  onSave: () => void
  onDelete: () => void
}

const props = defineProps<Props>()
const promptDetailOpen = ref(false)
const mainZIndex = usePopupZIndex(() => props.show && !!props.form)
const settingsZIndex = usePopupZIndex(() => !!props.settingsSection)
const promptDetailZIndex = usePopupZIndex(promptDetailOpen)
const settingsSectionTitle: Record<SettingsSection, string> = {
  mcp: '设备绑定',
  bot: '机器人配置',
  appearance: '数字社会人物显示',
  'external-mcp': '外部 MCP',
}

const editingConfigId = computed(() => {
  const cfgId = Number(props.form?.id)
  return Number.isFinite(cfgId) && cfgId > 0 ? cfgId : 0
})

const boundEndpointAgents = computed<ConnectedDevice[]>(() => {
  const cfgId = Number(props.form?.id)
  if (!Number.isFinite(cfgId) || cfgId <= 0) return []
  return (props.connectedDevices || []).filter((agent) => {
    const boundIds = Array.isArray(agent.boundAiConfigIds)
      ? agent.boundAiConfigIds.map(Number)
      : [Number(agent.aiConfigId)]
    if (!boundIds.includes(cfgId)) return false
    const platform = String(agent.platform || '').toLowerCase()
    return !!agent.isWindowsDesktop || !!agent.isBrowserExtension
      || platform.includes('desktop') || platform.includes('windows') || platform.includes('browser')
  })
})

const selectedModelPreset = computed(() => {
  const selectedId = String(props.form?.model_preset_id || '')
  return (props.modelPresets || []).find(item => item.id === selectedId) || null
})

const botConnectionSummary = computed(() => {
  const labels: Record<string, string> = { feishu: '飞书', qq: 'QQ', wechat: '微信' }
  const enabled = (['feishu', 'qq', 'wechat'] as const)
    .filter(channel => !!props.form?.bot_configs?.[channel]?.enabled)
  if (!enabled.length) return '尚未启用机器人'
  return `${enabled.map(channel => labels[channel]).join('、')}机器人已启用`
})

const openSettingsSection = (section: SettingsSection) => props.onToggleSettingsSection(section)
const closeSettingsSection = () => {
  if (!props.settingsSection) return
  props.onToggleSettingsSection(props.settingsSection)
}
const onModelPresetChange = () => {
  if (!props.form) return
  props.form.model = selectedModelPreset.value?.model || ''
}

watch(() => props.show, show => {
  if (!show) promptDetailOpen.value = false
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show && form" :style="{ zIndex: mainZIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click="onClose">
      <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5" @click.stop>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {{ mode === 'create' ? '新建 AI 配置' : `AI 配置 - ${form.name}` }}
          </h3>
          <button class="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="onClose">关闭</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">名称</label>
            <input v-model="form.name" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs text-zinc-500 mb-1">头像</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="av in PRESET_AI_AVATARS"
                :key="av"
                type="button"
                class="w-10 h-10 rounded-lg border overflow-hidden p-0.5 transition-all"
                :class="resolveAiAvatarUrl(form.avatar) === av ? 'border-indigo-500 ring-2 ring-indigo-200 scale-105' : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'"
                @click="form.avatar = av"
              >
                <img :src="av" class="w-full h-full object-cover rounded" alt="avatar" />
              </button>
            </div>
            <div class="mt-1 text-[10px] text-zinc-400">创建/设置 AI 时选择，默认为第一张。数字生命卡片将以虚化头像作为背景填充（低透明度）。</div>
          </div>
          <div v-if="form.ai_role_group === 'digital_member'">
            <label class="block text-xs text-zinc-500 mb-1">成员身份</label>
            <select v-model="form.digital_member_role" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100">
              <option value="manager">管理员</option>
              <option value="member">普通成员</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">平台</label>
            <input v-model="form.platform" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">模型</label>
            <select v-model="form.model_preset_id" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" @change="onModelPresetChange">
              <option value="">请选择服务器模型</option>
              <option v-for="preset in modelPresets" :key="preset.id" :value="preset.id">
                {{ preset.name || preset.model }}（{{ preset.model }}）
              </option>
            </select>
            <div v-if="selectedModelPreset" class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{{ selectedModelPreset.base_url }}</div>
            <div v-else class="mt-1 text-[11px] text-amber-600 dark:text-amber-300">请先在系统设置中保存服务器模型。</div>
            <label class="mt-3 block text-xs text-zinc-500 dark:text-zinc-400">
              <span class="mb-1 block">推理强度</span>
              <select v-model="form.reasoning_effort" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100">
                <option value="">跟随模型默认</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">默认不会向模型或 CLI 强制指定档位。</span>
            </label>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Token 上限</label>
            <input v-model.number="form.token_limit" type="number" min="1" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" />
          </div>
          <div class="md:col-span-2">
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="block text-xs text-zinc-500">Prompt</label>
              <button type="button" class="text-[11px] px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300" @click="promptDetailOpen = true">详情</button>
            </div>
            <textarea v-model="form.prompt" rows="3" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100"></textarea>
          </div>
        </div>

        <div class="mt-4 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div class="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">AI 设置</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button type="button" class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800" @click="openSettingsSection('mcp')">
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">设备绑定</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">管理端侧设备与内置设备</span>
            </button>
            <button type="button" class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800" @click="openSettingsSection('bot')">
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">机器人配置</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">{{ botConnectionSummary }}</span>
            </button>
            <button v-if="editingConfigId" type="button" class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800" @click="openSettingsSection('appearance')">
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">数字社会人物</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">人物显示、皮肤、调色、体型与光环</span>
            </button>
            <button v-if="editingConfigId && form.ai_role_group === 'digital_member'" type="button" class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800" @click="openSettingsSection('external-mcp')">
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">外部 MCP</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">向 Codex 或其他 AI 开放成员工具</span>
            </button>
          </div>
        </div>

        <div class="mt-5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button v-if="mode === 'edit'" class="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 bg-red-50 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300" @click="onToggleDeleteConfirm">删除 AI</button>
          </div>
          <div class="flex items-center gap-2">
            <button class="text-xs px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-700" @click="onClose">取消</button>
            <button class="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white" @click="onSave">保存配置</button>
          </div>
        </div>
        <div v-if="deleteConfirm" class="mt-3 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
          <div class="mb-2">确认删除该 AI？删除后无法恢复。</div>
          <div class="flex justify-end">
            <button class="px-2 py-1 rounded bg-red-600 text-white" @click="onDelete">确认删除</button>
          </div>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="settingsSection" :style="{ zIndex: settingsZIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click.stop="closeSettingsSection">
          <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-2xl max-h-[82vh] flex flex-col" @click.stop>
            <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ settingsSectionTitle[settingsSection] }}</h4>
              <button class="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="closeSettingsSection">关闭</button>
            </div>
            <div class="p-4 overflow-y-auto">
              <AiConfigDevicePanel
                v-if="settingsSection === 'mcp'"
                :editing-config-id="editingConfigId"
                :bound-endpoint-agents="boundEndpointAgents"
                :settings-section="settingsSection"
              />
              <AiConfigBotPanel
                v-else-if="settingsSection === 'bot'"
                :form="form"
                :editing-config-id="editingConfigId"
                :active="settingsSection === 'bot'"
              />
              <AiConfigAppearancePanel
                v-else-if="settingsSection === 'appearance'"
                :editing-config-id="editingConfigId"
                :role-group="form.ai_role_group"
              />
              <AiConfigExternalMcpPanel
                v-else-if="settingsSection === 'external-mcp'"
                :editing-config-id="editingConfigId"
                :active="settingsSection === 'external-mcp'"
              />
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="promptDetailOpen" :style="{ zIndex: promptDetailZIndex }" class="fixed inset-0 modal-overlay flex items-center justify-center p-4" @click.stop="promptDetailOpen = false">
          <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-5xl h-[82vh] flex flex-col" @click.stop>
            <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div class="min-w-0">
                <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">Prompt 详情</h4>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{{ form.name || '未命名 AI' }}</div>
              </div>
              <button class="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="promptDetailOpen = false">关闭</button>
            </div>
            <div class="flex-1 min-h-0 p-4">
              <textarea v-model="form.prompt" class="w-full h-full resize-none px-3 py-2 rounded-lg border border-zinc-200 font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-950/60 dark:border-zinc-700 dark:text-zinc-100"></textarea>
            </div>
          </div>
        </div>
      </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
