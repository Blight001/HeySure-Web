<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
// System MCPs (knowledge.* etc) are direct now; device tools + governance use scopes/toolbox. getMcpToolZhLabel not needed for server list here.
import { fetchWorkshopBindings, setWorkshopBinding, type WorkshopAgentItem } from '@/api/workshop'
import type { ModelPreset } from '@/types'
import type { ConnectedDevice } from '@/composables/dashboard/useDashboardData'
import DeviceMcpScopeEditor from './DeviceMcpScopeEditor.vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { PRESET_AI_AVATARS, resolveAiAvatarUrl } from '@/utils/aiAvatar'
import { listWorldActorMeta, setWorldActorMeta, type WorldActorAppearance } from '@/api/world'
import memberBlueUrl from '../../../../game/assets/char_member_blue.png?url'
import memberRedUrl from '../../../../game/assets/char_member_red.png?url'
import memberAmberUrl from '../../../../game/assets/char_member_amber.png?url'
import memberSlateUrl from '../../../../game/assets/char_member_slate.png?url'
import assistantUrl from '../../../../game/assets/char_assistant.png?url'

type SettingsSection = 'mcp' | 'bot' | 'appearance'

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
  // onToolCheckboxChange kept in signature for compatibility (Task modal / callers still use the composable)
  onToolCheckboxChange?: (tool: string, event: Event) => void
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
}

const openSettingsSection = (section: SettingsSection) => {
  props.onToggleSettingsSection(section)
}

const closeSettingsSection = () => {
  if (!props.settingsSection) return
  props.onToggleSettingsSection(props.settingsSection)
}

const openPromptDetail = () => {
  promptDetailOpen.value = true
}

const closePromptDetail = () => {
  promptDetailOpen.value = false
}

// Connected endpoint agents bound to the AI being edited. Their endpoint MCP
// tools are governed per-agent (not via mcp_tools), so they get their own
// permission editor here. Disconnected agents simply don't appear.
const boundEndpointAgents = computed<ConnectedDevice[]>(() => {
  const cfgId = Number(props.form?.id)
  if (!Number.isFinite(cfgId) || cfgId <= 0) return []
  return (props.connectedDevices || []).filter((agent) => {
    if (Number(agent.aiConfigId) !== cfgId) return false
    const platform = String(agent.platform || '').toLowerCase()
    return !!agent.isWindowsDesktop || !!agent.isBrowserExtension
      || platform.includes('desktop') || platform.includes('windows') || platform.includes('browser')
  })
})
const selectedBotName = computed(() => props.form?.bot_channel === 'qq' ? 'QQ机器人' : '飞书机器人')
const selectedModelPreset = computed(() => {
  const selectedId = String(props.form?.model_preset_id || '')
  return (props.modelPresets || []).find(item => item.id === selectedId) || null
})
const selectedBotEnabled = computed(() => {
  const channel = props.form?.bot_channel === 'qq' ? 'qq' : 'feishu'
  return !!props.form?.bot_configs?.[channel]?.enabled
})

const onModelPresetChange = () => {
  if (!props.form) return
  const preset = selectedModelPreset.value
  props.form.model = preset?.model || ''
}

// ---------- 作坊绑定 ----------
const workshopAgents = ref<WorkshopAgentItem[]>([])
const workshopLoading = ref(false)
const workshopError = ref('')

const editingConfigId = computed(() => {
  const cfgId = Number(props.form?.id)
  return Number.isFinite(cfgId) && cfgId > 0 ? cfgId : 0
})

const DEFAULT_APPEARANCE: WorldActorAppearance = { skin: '', tint: '', scale: 1, aura: '' }
const appearanceDraft = ref<WorldActorAppearance>({ ...DEFAULT_APPEARANCE })
const appearanceLoading = ref(false)
const appearanceSaving = ref(false)
const appearanceError = ref('')
const appearanceNotice = ref('')

const memberSkinOptions = [
  { key: '', label: '默认', url: '' },
  { key: 'char_member_blue.png', label: '蓝色', url: memberBlueUrl },
  { key: 'char_member_red.png', label: '红色', url: memberRedUrl },
  { key: 'char_member_amber.png', label: '琥珀', url: memberAmberUrl },
  { key: 'char_member_slate.png', label: '青灰', url: memberSlateUrl },
]
const skinUrlByKey: Record<string, string> = Object.fromEntries(
  memberSkinOptions.filter(item => item.key).map(item => [item.key, item.url]),
)
const defaultMemberSkinUrl = computed(() => {
  const urls = [memberBlueUrl, memberRedUrl, memberAmberUrl, memberSlateUrl]
  return urls[Math.abs(editingConfigId.value * 2654435761) % urls.length]
})
const appearanceSkinUrl = computed(() => {
  if (props.form?.ai_role_group === 'assistant_admin') return assistantUrl
  return skinUrlByKey[appearanceDraft.value.skin] || defaultMemberSkinUrl.value
})
const appearancePreviewStyle = computed<CSSProperties>(() => ({
  backgroundImage: `url(${appearanceSkinUrl.value})`,
  backgroundPosition: '0 0',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '256px auto',
  imageRendering: 'pixelated',
  transform: `scale(${appearanceDraft.value.scale})`,
}))

const loadAppearance = async () => {
  const cfgId = editingConfigId.value
  appearanceNotice.value = ''
  appearanceError.value = ''
  appearanceDraft.value = { ...DEFAULT_APPEARANCE }
  if (!cfgId) return
  appearanceLoading.value = true
  try {
    const data = await listWorldActorMeta()
    const current = (data.items || []).find(item => Number(item.ai_config_id) === cfgId)
    if (current) {
      appearanceDraft.value = {
        skin: current.skin || '',
        tint: current.tint || '',
        scale: Number(current.scale) || 1,
        aura: current.aura || '',
      }
    }
  } catch (err: any) {
    appearanceError.value = err?.message || '人物外观加载失败'
  } finally {
    appearanceLoading.value = false
  }
}

const saveAppearance = async () => {
  const cfgId = editingConfigId.value
  if (!cfgId) return
  appearanceSaving.value = true
  appearanceError.value = ''
  appearanceNotice.value = ''
  try {
    const saved = await setWorldActorMeta(cfgId, appearanceDraft.value)
    appearanceDraft.value = {
      skin: saved.skin || '',
      tint: saved.tint || '',
      scale: Number(saved.scale) || 1,
      aura: saved.aura || '',
    }
    appearanceNotice.value = '人物外观已保存，社会显示会自动同步。'
  } catch (err: any) {
    appearanceError.value = err?.message || '外观保存失败'
  } finally {
    appearanceSaving.value = false
  }
}

const resetAppearanceDraft = () => {
  appearanceDraft.value = { ...DEFAULT_APPEARANCE }
  appearanceError.value = ''
  appearanceNotice.value = '已恢复默认预览，点击保存后生效。'
}

const loadWorkshopAgents = async () => {
  const cfgId = editingConfigId.value
  if (!cfgId) {
    workshopAgents.value = []
    return
  }
  workshopLoading.value = true
  workshopError.value = ''
  try {
    const data = await fetchWorkshopBindings(cfgId)
    workshopAgents.value = Array.isArray(data.agents) ? data.agents : []
  } catch (err: any) {
    workshopError.value = err?.message || '图书馆列表加载失败'
  } finally {
    workshopLoading.value = false
  }
}

watch(
  () => [props.show, editingConfigId.value],
  ([show, cfgId]) => {
    if (show && cfgId) {
      void loadWorkshopAgents()
      void loadAppearance()
    }
  },
  { immediate: true },
)

const toggleWorkshopBinding = async (agent: WorkshopAgentItem, event: Event) => {
  const target = event.target as HTMLInputElement | null
  const next = !!target?.checked
  const cfgId = editingConfigId.value
  if (!cfgId) return
  if (next && !agent.bound && agent.bound_ai_config_id) {
    if (target) target.checked = false
    return
  }
  try {
    await setWorkshopBinding(cfgId, agent.device_id, next)
    await loadWorkshopAgents()
  } catch (err: any) {
    workshopError.value = err?.message || '更新图书馆绑定失败'
    if (target) target.checked = agent.bound
  }
}

const workshopOccupiedByOther = (agent: WorkshopAgentItem) =>
  !agent.bound && !!agent.bound_ai_config_id
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

          <!-- AI 头像选择（与用户头像类似，内置资产） -->
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
            <select
              v-model="form.model_preset_id"
              class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100"
              @change="onModelPresetChange"
            >
              <option value="">请选择服务器模型</option>
              <option v-for="preset in modelPresets" :key="preset.id" :value="preset.id">
                {{ preset.name || preset.model }}（{{ preset.model }}）
              </option>
            </select>
            <div v-if="selectedModelPreset" class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {{ selectedModelPreset.base_url }}
            </div>
            <div v-else class="mt-1 text-[11px] text-amber-600 dark:text-amber-300">
              请先在系统设置中保存服务器模型。
            </div>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Token 上限</label>
            <input
              v-if="form.ai_role_group !== 'assistant_admin'"
              v-model.number="form.token_limit"
              type="number"
              min="1"
              class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100"
            />
            <div
              v-else
              class="w-full px-3 py-2 rounded-lg border border-zinc-200 text-xs text-zinc-500 bg-zinc-50/60 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-300"
            >
              无 Token 上限（仅用于与用户对话）
            </div>
          </div>
          <div class="md:col-span-2">
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="block text-xs text-zinc-500">Prompt</label>
              <button
                type="button"
                class="text-[11px] px-2 py-1 rounded border border-zinc-200 text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
                @click="openPromptDetail"
              >
                详情
              </button>
            </div>
            <textarea v-model="form.prompt" rows="3" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100"></textarea>
          </div>
        </div>

        <div class="mt-4 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div class="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">AI 设置</div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              type="button"
              class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800"
              @click="openSettingsSection('mcp')"
            >
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">设备绑定</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                管理端侧设备与作坊
              </span>
            </button>
            <button
              type="button"
              class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800"
              @click="openSettingsSection('bot')"
            >
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">机器人配置</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                {{ selectedBotName }}，{{ selectedBotEnabled ? '已启用' : '未启用' }}
              </span>
            </button>
            <button
              v-if="editingConfigId"
              type="button"
              class="text-left px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:border-indigo-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-800"
              @click="openSettingsSection('appearance')"
            >
              <span class="block text-xs font-medium text-zinc-700 dark:text-zinc-200">数字社会人物</span>
              <span class="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                人物显示、皮肤、调色、体型与光环
              </span>
            </button>
          </div>
        </div>

        <div class="mt-5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button
              v-if="mode === 'edit'"
              class="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 bg-red-50 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
              @click="onToggleDeleteConfirm"
            >
              删除 AI
            </button>
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
        <div
          v-if="settingsSection"
          :style="{ zIndex: settingsZIndex }"
          class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
          @click.stop="closeSettingsSection"
        >
          <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-2xl max-h-[82vh] flex flex-col" @click.stop>
            <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{{ settingsSectionTitle[settingsSection] }}</h4>
              <button class="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="closeSettingsSection">关闭</button>
            </div>

            <div class="p-4 overflow-y-auto">
              <div v-if="settingsSection === 'mcp'">
                <div v-if="boundEndpointAgents.length" class="mb-3 space-y-2">
                  <div class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">已绑定端侧设备</div>
                  <DeviceMcpScopeEditor
                    v-for="agent in boundEndpointAgents"
                    :key="`ai-config-agent-scope-${agent.id}`"
                    :device-id="agent.id"
                    :refresh-key="`${agent.aiConfigId ?? ''}-${settingsSection}`"
                  />
                </div>

                <div
                  v-if="editingConfigId"
                  class="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/5"
                >
                  <div class="flex items-center justify-between">
                    <div class="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">作坊绑定</div>
                    <button
                      class="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300"
                      @click="loadWorkshopAgents"
                    >刷新</button>
                  </div>
                  <div v-if="workshopLoading" class="mt-2 text-[11px] text-zinc-400">加载中…</div>
                  <div v-else-if="workshopError" class="mt-2 text-[11px] text-rose-500">{{ workshopError }}</div>
                  <div v-else-if="workshopAgents.length === 0" class="mt-2 text-[11px] text-zinc-400">
                    内置作坊暂不可用，请刷新重试（正常情况下会自动上线）。
                  </div>
                  <label
                    v-for="agent in workshopAgents"
                    :key="`workshop-${agent.device_id}`"
                    class="mt-2 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                    :class="workshopOccupiedByOther(agent)
                      ? 'border-zinc-200 bg-zinc-100/70 opacity-60 dark:border-zinc-700 dark:bg-zinc-800/50'
                      : 'border-zinc-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-900/50'"
                  >
                    <span class="flex items-center gap-2 min-w-0">
                      <span
                        class="h-1.5 w-1.5 shrink-0 rounded-full"
                        :class="agent.online ? 'bg-emerald-500' : 'bg-zinc-400'"
                      ></span>
                      <span class="truncate text-zinc-700 dark:text-zinc-200">{{ agent.name }}</span>
                      <span class="shrink-0 text-[10px] text-zinc-400">
                        {{ agent.online ? `${agent.tools.length} 个工具` : '离线' }} ·
                        {{ agent.bound ? '已绑定当前 AI' : (agent.bound_ai_config_id ? `已被 ${agent.bound_ai_name} 绑定` : '可绑定') }}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      :checked="agent.bound"
                      :disabled="workshopOccupiedByOther(agent)"
                      @change="toggleWorkshopBinding(agent, $event)"
                    />
                  </label>
                </div>
              </div>

              <div v-else-if="settingsSection === 'bot'" class="space-y-3">
                <div>
                  <label class="block text-[11px] text-zinc-500 mb-1">机器人类型</label>
                  <select v-model="form.bot_channel" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs">
                    <option value="feishu">飞书机器人</option>
                    <option value="qq">QQ机器人</option>
                  </select>
                </div>

                <template v-if="form.bot_channel === 'feishu'">
                <label class="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300 px-2 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/60">
                  <span>启用飞书机器人</span>
                  <input type="checkbox" v-model="form.bot_configs.feishu.enabled" />
                </label>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="md:col-span-2">
                    <label class="block text-[11px] text-zinc-500 mb-1">自定义群机器人 仅通知 URL</label>
                    <input v-model="form.bot_configs.feishu.webhook_url" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">App ID</label>
                    <input v-model="form.bot_configs.feishu.app_id" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" placeholder="cli_xxx" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">App Secret</label>
                    <input v-model="form.bot_configs.feishu.app_secret" type="password" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">Verification Token</label>
                    <input v-model="form.bot_configs.feishu.verification_token" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">默认接收 ID 类型</label>
                    <select v-model="form.bot_configs.feishu.default_receive_id_type" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs">
                      <option value="chat_id">chat_id</option>
                      <option value="open_id">open_id</option>
                      <option value="user_id">user_id</option>
                      <option value="union_id">union_id</option>
                      <option value="email">email</option>
                    </select>
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-[11px] text-zinc-500 mb-1">默认接收 ID（AI 主动通知时使用）</label>
                    <input v-model="form.bot_configs.feishu.default_receive_id" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" placeholder="群聊 chat_id 或用户 open_id" />
                  </div>
                </div>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400">
                  仅通知 URL 只能让 AI 主动发通知；飞书用户主动与 AI 对话需要配置自建应用 App ID / Secret，并在飞书开放平台的事件订阅里选择“使用长连接接收事件”。
                </div>
                </template>

                <template v-else>
                <label class="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300 px-2 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/60">
                  <span>启用 QQ机器人</span>
                  <input type="checkbox" v-model="form.bot_configs.qq.enabled" />
                </label>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">App ID</label>
                    <input v-model="form.bot_configs.qq.app_id" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" placeholder="开放平台机器人 AppID" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">App Secret</label>
                    <input v-model="form.bot_configs.qq.app_secret" type="password" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" />
                  </div>
                  <label class="md:col-span-2 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300 px-2 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/60">
                    <span>使用沙箱环境</span>
                    <input type="checkbox" v-model="form.bot_configs.qq.sandbox" />
                  </label>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">主动发送目标 ID（可选）</label>
                    <input v-model="form.bot_configs.qq.default_target_id" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" placeholder="openid / group_openid / channel_id" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-zinc-500 mb-1">Markdown 模式</label>
                    <select v-model="form.bot_configs.qq.markdown_mode" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs">
                      <option value="native">原生 Markdown</option>
                      <option value="template">审核模板</option>
                      <option value="off">关闭（纯文本）</option>
                    </select>
                  </div>
                  <div v-if="form.bot_configs.qq.markdown_mode === 'template'" class="md:col-span-2">
                    <label class="block text-[11px] text-zinc-500 mb-1">Markdown 模板 ID</label>
                    <input v-model="form.bot_configs.qq.markdown_template_id" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 text-xs" placeholder="QQ 开放平台审核通过的模板 ID" />
                  </div>
                  <label class="md:col-span-2 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300 px-2 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/60">
                    <span>私聊启用流式输出</span>
                    <input type="checkbox" v-model="form.bot_configs.qq.stream_enabled" :disabled="form.bot_configs.qq.markdown_mode === 'off'" />
                  </label>
                </div>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400">
                  QQ 入站由服务端 botpy 长连接托管。原生 Markdown 和私聊流式输出需要 QQ 开放平台权限；未获权限时服务端会自动回退为纯文本。
                </div>
                </template>
              </div>

              <div v-else-if="settingsSection === 'appearance'" class="space-y-4">
                <div v-if="appearanceLoading" class="py-10 text-center text-xs text-zinc-400">人物外观加载中…</div>
                <template v-else>
                  <div class="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-b from-sky-100 to-emerald-100 dark:border-zinc-700 dark:from-slate-900 dark:to-emerald-950/70">
                    <div class="relative flex h-32 w-28 items-end justify-center">
                      <div
                        v-if="appearanceDraft.aura"
                        class="absolute bottom-4 h-20 w-20 rounded-full opacity-60 blur-xl"
                        :style="{ backgroundColor: appearanceDraft.aura }"
                      ></div>
                      <div class="relative h-24 w-16 origin-bottom transition-transform duration-200" :style="appearancePreviewStyle">
                        <div
                          v-if="appearanceDraft.tint"
                          class="absolute inset-0 opacity-35 mix-blend-color"
                          :style="{ backgroundColor: appearanceDraft.tint }"
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">人物皮肤</div>
                    <div v-if="form.ai_role_group === 'assistant_admin'" class="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                      该角色使用固定身份皮肤，可继续调整调色、体型和光环。
                    </div>
                    <div v-else class="grid grid-cols-5 gap-2">
                      <button
                        v-for="skin in memberSkinOptions"
                        :key="skin.key || 'default'"
                        type="button"
                        class="rounded-lg border px-2 py-2 text-[11px] transition-colors"
                        :class="appearanceDraft.skin === skin.key
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:border-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-200'
                          : 'border-zinc-200 bg-white/70 text-zinc-500 hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400'"
                        @click="appearanceDraft.skin = skin.key"
                      >
                        {{ skin.label }}
                      </button>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                      <div class="mb-2 flex items-center justify-between">
                        <label class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">人物调色</label>
                        <button type="button" class="text-[10px] text-zinc-400 hover:text-indigo-500" @click="appearanceDraft.tint = ''">无调色</button>
                      </div>
                      <div class="flex items-center gap-2">
                        <input v-model="appearanceDraft.tint" type="color" class="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-transparent p-1 dark:border-zinc-700" />
                        <input v-model.trim="appearanceDraft.tint" maxlength="7" placeholder="#RRGGBB" class="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white/70 px-2 py-2 text-xs uppercase dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100" />
                      </div>
                    </div>
                    <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                      <div class="mb-2 flex items-center justify-between">
                        <label class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">光环颜色</label>
                        <button type="button" class="text-[10px] text-zinc-400 hover:text-indigo-500" @click="appearanceDraft.aura = ''">无光环</button>
                      </div>
                      <div class="flex items-center gap-2">
                        <input v-model="appearanceDraft.aura" type="color" class="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-transparent p-1 dark:border-zinc-700" />
                        <input v-model.trim="appearanceDraft.aura" maxlength="7" placeholder="#RRGGBB" class="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white/70 px-2 py-2 text-xs uppercase dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100" />
                      </div>
                    </div>
                  </div>

                  <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                    <div class="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                      <span>人物体型</span>
                      <span>{{ Number(appearanceDraft.scale).toFixed(2) }}×</span>
                    </div>
                    <input v-model.number="appearanceDraft.scale" type="range" min="0.7" max="1.4" step="0.05" class="w-full accent-indigo-600" />
                  </div>

                  <div v-if="appearanceError" class="text-xs text-rose-500">{{ appearanceError }}</div>
                  <div v-if="appearanceNotice" class="text-xs text-emerald-600 dark:text-emerald-400">{{ appearanceNotice }}</div>
                  <div class="flex justify-end gap-2">
                    <button type="button" class="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" @click="resetAppearanceDraft">恢复默认</button>
                    <button type="button" :disabled="appearanceSaving" class="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" @click="saveAppearance">
                      {{ appearanceSaving ? '保存中…' : '保存人物外观' }}
                    </button>
                  </div>
                </template>
              </div>

            </div>
          </div>
        </div>
      </Transition>

      <Transition name="fade">
        <div
          v-if="promptDetailOpen"
          :style="{ zIndex: promptDetailZIndex }"
          class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
          @click.stop="closePromptDetail"
        >
          <div class="acrylic-modal rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-full max-w-5xl h-[82vh] flex flex-col" @click.stop>
            <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div class="min-w-0">
                <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">Prompt 详情</h4>
                <div class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{{ form.name || '未命名 AI' }}</div>
              </div>
              <button class="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300" @click="closePromptDetail">关闭</button>
            </div>
            <div class="flex-1 min-h-0 p-4">
              <textarea
                v-model="form.prompt"
                class="w-full h-full resize-none px-3 py-2 rounded-lg border border-zinc-200 font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-950/60 dark:border-zinc-700 dark:text-zinc-100"
              ></textarea>
            </div>
          </div>
        </div>
      </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
