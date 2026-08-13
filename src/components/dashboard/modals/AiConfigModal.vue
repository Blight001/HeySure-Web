<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import QRCode from 'qrcode'
// System MCPs (knowledge.* etc) are direct now; device tools + governance use scopes/toolbox. getMcpToolZhLabel not needed for server list here.
import { fetchBuiltinDeviceBindings, setBuiltinDeviceBinding, type BuiltinDeviceItem } from '@/api/devices'
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
import { getExternalControlStatus, issueExternalControllerCredential, revokeExternalControllerCredential } from '@/api/ai'
import {
  createBotConnection, deleteBotConnection, disconnectBotLogin, getBotLoginStatus,
  listBotConnections, startBotLogin, submitBotVerifyCode, updateBotConnection,
  type BotConnectionItem, type BotLoginStatus,
} from '@/api/bots'
import { copyTextToClipboard } from '@/utils/clipboard'

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
const controllerBusy = ref(false)
const controllerError = ref('')
const controllerNotice = ref('')
const controllerHandoff = ref('')
const controllerCredentials = ref<Array<Record<string, any>>>([])

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

const loadControllerStatus = async () => {
  const cfgId = editingConfigId.value
  if (!cfgId || props.form?.execution_mode !== 'external_mcp') {
    controllerCredentials.value = []
    return
  }
  try {
    const status = await getExternalControlStatus(cfgId)
    controllerCredentials.value = Array.isArray(status.credentials) ? status.credentials : []
  } catch (err: any) {
    controllerError.value = err?.message || '外部控制状态加载失败'
  }
}

const generateControllerHandoff = async () => {
  const cfgId = editingConfigId.value
  if (!cfgId) return
  controllerBusy.value = true
  controllerError.value = ''
  controllerNotice.value = ''
  try {
    const result = await issueExternalControllerCredential(cfgId, { label: 'Codex', ttl_days: 30 })
    controllerHandoff.value = String(result.handoff_markdown || '')
    controllerNotice.value = '新凭证已生成；此前的活动凭证已自动吊销。'
    await loadControllerStatus()
  } catch (err: any) {
    controllerError.value = err?.message || '控制文档生成失败'
  } finally {
    controllerBusy.value = false
  }
}

const copyControllerHandoff = async (event: Event) => {
  const ok = await copyTextToClipboard(controllerHandoff.value, event.currentTarget as Element | null)
  controllerNotice.value = ok ? '控制文档已复制。' : '复制失败，请手动选择文本。'
}

const revokeControllerCredential = async (credentialId: number) => {
  const cfgId = editingConfigId.value
  if (!cfgId) return
  controllerBusy.value = true
  controllerError.value = ''
  try {
    await revokeExternalControllerCredential(cfgId, credentialId)
    controllerNotice.value = '控制凭证已吊销。'
    await loadControllerStatus()
  } catch (err: any) {
    controllerError.value = err?.message || '凭证吊销失败'
  } finally {
    controllerBusy.value = false
  }
}

// Connected endpoint agents bound to the AI being edited. Their endpoint MCP
// tools are governed per-agent (not via mcp_tools), so they get their own
// permission editor here. Disconnected agents simply don't appear.
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
const selectedBotName = computed(() => props.form?.bot_channel === 'wechat' ? '微信机器人' : (props.form?.bot_channel === 'qq' ? 'QQ机器人' : '飞书机器人'))
const selectedModelPreset = computed(() => {
  const selectedId = String(props.form?.model_preset_id || '')
  return (props.modelPresets || []).find(item => item.id === selectedId) || null
})
const selectedBotEnabled = computed(() => {
  const channel = props.form?.bot_channel === 'wechat' ? 'wechat' : (props.form?.bot_channel === 'qq' ? 'qq' : 'feishu')
  return !!props.form?.bot_configs?.[channel]?.enabled
})

const onModelPresetChange = () => {
  if (!props.form) return
  const preset = selectedModelPreset.value
  props.form.model = preset?.model || ''
}

// ---------- 设备绑定 ----------
const builtinDevices = ref<BuiltinDeviceItem[]>([])
const builtinDevicesLoading = ref(false)
const builtinDevicesError = ref('')

const editingConfigId = computed(() => {
  const cfgId = Number(props.form?.id)
  return Number.isFinite(cfgId) && cfgId > 0 ? cfgId : 0
})

const botConnections = ref<BotConnectionItem[]>([])
const botConnectionsBusy = ref(false)
const botConnectionsError = ref('')
const selectedConnectionRef = ref('')
const botChannels = [
  { channel: 'wechat', label: '微信' },
  { channel: 'qq', label: 'QQ' },
  { channel: 'feishu', label: '飞书' },
] as const
const connectionsFor = (channel: string) => botConnections.value.filter(item => item.channel === channel)
const botConnectionSaveState = ref<Record<string, 'saving' | 'saved' | 'error'>>({})
const botConnectionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const loadBotConnections = async () => {
  if (!editingConfigId.value) return
  botConnectionsBusy.value = true
  botConnectionsError.value = ''
  // Never retain another AI's accounts while a new request is pending/fails.
  botConnections.value = []
  try {
    const result = await listBotConnections(editingConfigId.value)
    botConnections.value = Array.isArray(result.connections) ? result.connections : []
  } catch (err: any) {
    botConnectionsError.value = err?.message || '机器人账号列表加载失败'
  } finally {
    botConnectionsBusy.value = false
  }
}

const addBotConnection = async (channel: 'wechat' | 'qq' | 'feishu') => {
  if (!editingConfigId.value) return
  botConnectionsBusy.value = true
  try {
    const item = await createBotConnection(editingConfigId.value, {
      channel,
      name: `${channel === 'wechat' ? '微信' : channel === 'qq' ? 'QQ' : '飞书'}账号 ${connectionsFor(channel).length + 1}`,
      config: { enabled: true },
    })
    await loadBotConnections()
    selectedConnectionRef.value = item.connection_ref
    if (channel === 'wechat') await startWechatLogin(item.connection_ref)
  } catch (err: any) {
    botConnectionsError.value = err?.message || '新增机器人账号失败'
  } finally {
    botConnectionsBusy.value = false
  }
}

const persistBotConnection = async (item: BotConnectionItem) => {
  if (!editingConfigId.value) return
  botConnectionsError.value = ''
  botConnectionSaveState.value[item.connection_ref] = 'saving'
  try {
    await updateBotConnection(editingConfigId.value, item.connection_ref, {
      name: item.name,
      enabled: item.enabled,
      is_default: item.is_default,
      config: item.config || {},
    })
    botConnectionSaveState.value[item.connection_ref] = 'saved'
  } catch (err: any) {
    botConnectionSaveState.value[item.connection_ref] = 'error'
    botConnectionsError.value = err?.message || '保存机器人账号失败'
  }
}

const autoSaveBotConnection = (item: BotConnectionItem) => {
  if (item.is_default) {
    for (const peer of connectionsFor(item.channel)) {
      if (peer.connection_ref !== item.connection_ref) peer.is_default = false
    }
  }
  const previous = botConnectionSaveTimers.get(item.connection_ref)
  if (previous) clearTimeout(previous)
  botConnectionSaveState.value[item.connection_ref] = 'saving'
  botConnectionSaveTimers.set(item.connection_ref, setTimeout(() => {
    botConnectionSaveTimers.delete(item.connection_ref)
    void persistBotConnection(item)
  }, 600))
}

const removeBotConnection = async (item: BotConnectionItem) => {
  if (!editingConfigId.value) return
  botConnectionsBusy.value = true
  try {
    await deleteBotConnection(editingConfigId.value, item.connection_ref)
    if (selectedConnectionRef.value === item.connection_ref) selectedConnectionRef.value = ''
    await loadBotConnections()
  } catch (err: any) {
    botConnectionsError.value = err?.message || '删除机器人账号失败'
  } finally {
    botConnectionsBusy.value = false
  }
}

const wechatLogin = ref<BotLoginStatus>({ state: 'disconnected', message: '尚未连接微信', connected: false })
const wechatQrDataUrl = ref('')
const wechatLoginBusy = ref(false)
const wechatLoginError = ref('')
const wechatVerifyCode = ref('')
let wechatPollTimer: ReturnType<typeof setInterval> | null = null

const applyWechatLoginStatus = async (status: BotLoginStatus) => {
  wechatLogin.value = status
  wechatQrDataUrl.value = status.qrcode_url
    ? await QRCode.toDataURL(status.qrcode_url, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
    : ''
}

const loadWechatLoginStatus = async (connectionRef = selectedConnectionRef.value) => {
  if (!editingConfigId.value || !connectionRef) return
  try {
    await applyWechatLoginStatus(await getBotLoginStatus('wechat', editingConfigId.value, connectionRef))
  } catch (err: any) {
    wechatLoginError.value = err?.message || '微信连接状态读取失败'
  }
}

const startWechatLogin = async (connectionRef = selectedConnectionRef.value) => {
  if (!editingConfigId.value) return
  wechatLoginBusy.value = true
  wechatLoginError.value = ''
  try {
    props.form.bot_configs.wechat.enabled = true
    selectedConnectionRef.value = connectionRef
    await applyWechatLoginStatus(await startBotLogin('wechat', editingConfigId.value, connectionRef))
  } catch (err: any) {
    wechatLoginError.value = err?.message || '生成微信二维码失败'
  } finally {
    wechatLoginBusy.value = false
  }
}

const submitWechatCode = async () => {
  if (!editingConfigId.value) return
  wechatLoginBusy.value = true
  wechatLoginError.value = ''
  try {
    await applyWechatLoginStatus(await submitBotVerifyCode('wechat', editingConfigId.value, wechatVerifyCode.value, selectedConnectionRef.value))
    wechatVerifyCode.value = ''
  } catch (err: any) {
    wechatLoginError.value = err?.message || '验证码提交失败'
  } finally {
    wechatLoginBusy.value = false
  }
}

const disconnectWechat = async () => {
  if (!editingConfigId.value) return
  wechatLoginBusy.value = true
  wechatLoginError.value = ''
  try {
    await applyWechatLoginStatus(await disconnectBotLogin('wechat', editingConfigId.value, selectedConnectionRef.value))
  } catch (err: any) {
    wechatLoginError.value = err?.message || '断开微信失败'
  } finally {
    wechatLoginBusy.value = false
  }
}

const stopWechatPolling = () => {
  if (wechatPollTimer) clearInterval(wechatPollTimer)
  wechatPollTimer = null
}

watch(
  () => [props.show, props.settingsSection, editingConfigId.value],
  ([show, section, cfgId]) => {
    stopWechatPolling()
    selectedConnectionRef.value = ''
    botConnections.value = []
    wechatQrDataUrl.value = ''
    wechatLoginError.value = ''
    wechatLogin.value = { state: 'disconnected', message: '尚未连接微信', connected: false }
    if (show && section === 'bot' && cfgId) {
      void loadBotConnections().then(() => {
        const first = connectionsFor('wechat')[0]
        if (!first) return
        selectedConnectionRef.value = first.connection_ref
        void loadWechatLoginStatus(first.connection_ref)
        wechatPollTimer = setInterval(() => void loadWechatLoginStatus(), 2500)
      })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopWechatPolling()
  for (const timer of botConnectionSaveTimers.values()) clearTimeout(timer)
  botConnectionSaveTimers.clear()
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

const loadBuiltinDevices = async () => {
  const cfgId = editingConfigId.value
  if (!cfgId) {
    builtinDevices.value = []
    return
  }
  builtinDevicesLoading.value = true
  builtinDevicesError.value = ''
  try {
    const data = await fetchBuiltinDeviceBindings(cfgId)
    builtinDevices.value = Array.isArray(data.agents) ? data.agents : []
  } catch (err: any) {
    builtinDevicesError.value = err?.message || '内置设备列表加载失败'
  } finally {
    builtinDevicesLoading.value = false
  }
}

watch(
  () => [props.show, editingConfigId.value, props.form?.execution_mode],
  ([show, cfgId]) => {
    if (show && cfgId) {
      void loadBuiltinDevices()
      void loadAppearance()
      void loadControllerStatus()
    } else if (!show) {
      controllerHandoff.value = ''
      controllerError.value = ''
      controllerNotice.value = ''
    }
  },
  { immediate: true },
)

const toggleBuiltinDeviceBinding = async (agent: BuiltinDeviceItem, event: Event) => {
  const target = event.target as HTMLInputElement | null
  const next = !!target?.checked
  const cfgId = editingConfigId.value
  if (!cfgId) return
  if (next && !agent.bound && agent.bound_ai_config_id) {
    if (target) target.checked = false
    return
  }
  try {
    await setBuiltinDeviceBinding(cfgId, agent.device_id, next)
    await loadBuiltinDevices()
  } catch (err: any) {
    builtinDevicesError.value = err?.message || '更新内置设备绑定失败'
    if (target) target.checked = agent.bound
  }
}

const builtinDeviceOccupiedByOther = (agent: BuiltinDeviceItem) =>
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
          <div class="md:col-span-2">
            <label class="block text-xs text-zinc-500 mb-1">执行方式</label>
            <select v-model="form.execution_mode" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100">
              <option value="internal_model">服务器模型</option>
              <option value="external_mcp">外部 MCP 控制</option>
            </select>
            <div class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              外部 MCP 模式不调用服务器模型，用户对话只读，只展示控制器的 MCP 执行记录。
            </div>
          </div>
          <div v-if="form.execution_mode !== 'external_mcp'">
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

        <div v-if="form.execution_mode === 'external_mcp'" class="mt-4 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-500/30 dark:bg-cyan-950/20">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-xs font-semibold text-cyan-800 dark:text-cyan-200">远程 MCP 控制器</div>
              <div class="mt-1 text-[11px] text-cyan-700/80 dark:text-cyan-300/80">
                {{ editingConfigId ? `活动凭证 ${controllerCredentials.filter(item => item.state === 'active').length} 个` : '请先保存成员，再生成控制文档。' }}
              </div>
            </div>
            <button
              v-if="editingConfigId"
              type="button"
              :disabled="controllerBusy"
              class="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              @click="generateControllerHandoff"
            >{{ controllerBusy ? '处理中…' : '生成新的控制文档' }}</button>
          </div>
          <div v-if="controllerHandoff" class="mt-3 space-y-2">
            <textarea :value="controllerHandoff" readonly rows="10" class="w-full resize-y rounded-lg border border-cyan-200 bg-white/80 p-3 font-mono text-[11px] leading-5 text-zinc-700 dark:border-cyan-500/30 dark:bg-zinc-950/70 dark:text-zinc-200"></textarea>
            <div class="flex justify-end">
              <button type="button" class="rounded border border-cyan-300 px-3 py-1.5 text-xs text-cyan-700 dark:border-cyan-500/40 dark:text-cyan-200" @click="copyControllerHandoff">复制控制文档</button>
            </div>
          </div>
          <div v-if="controllerCredentials.some(item => item.state === 'active')" class="mt-3 space-y-1">
            <div v-for="credential in controllerCredentials.filter(item => item.state === 'active')" :key="credential.id" class="flex items-center justify-between rounded border border-cyan-100 bg-white/60 px-2 py-1.5 text-[11px] dark:border-cyan-500/20 dark:bg-zinc-900/50">
              <span>{{ credential.label }} · {{ credential.token_prefix }}… · 到期 {{ new Date(credential.expires_at * 1000).toLocaleString() }}</span>
              <button type="button" class="text-rose-600 dark:text-rose-300" :disabled="controllerBusy" @click="revokeControllerCredential(Number(credential.id))">吊销</button>
            </div>
          </div>
          <div v-if="controllerError" class="mt-2 text-xs text-rose-600 dark:text-rose-300">{{ controllerError }}</div>
          <div v-if="controllerNotice" class="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{{ controllerNotice }}</div>
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
                管理端侧设备与内置设备
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
                    :ai-config-id="editingConfigId"
                    :refresh-key="`${agent.aiConfigId ?? ''}-${settingsSection}`"
                  />
                </div>

                <div
                  v-if="editingConfigId"
                  class="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/5"
                >
                  <div class="flex items-center justify-between">
                    <div class="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">设备绑定</div>
                    <button
                      class="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300"
                      @click="loadBuiltinDevices"
                    >刷新</button>
                  </div>
                  <div v-if="builtinDevicesLoading" class="mt-2 text-[11px] text-zinc-400">加载中…</div>
                  <div v-else-if="builtinDevicesError" class="mt-2 text-[11px] text-rose-500">{{ builtinDevicesError }}</div>
                  <div v-else-if="builtinDevices.length === 0" class="mt-2 text-[11px] text-zinc-400">
                    内置设备暂不可用，请刷新重试（正常情况下会自动上线）。
                  </div>
                  <label
                    v-for="agent in builtinDevices"
                    :key="`builtin-device-${agent.device_id}`"
                    class="mt-2 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                    :class="builtinDeviceOccupiedByOther(agent)
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
                      :disabled="builtinDeviceOccupiedByOther(agent)"
                      @change="toggleBuiltinDeviceBinding(agent, $event)"
                    />
                  </label>
                </div>
              </div>

              <div v-else-if="settingsSection === 'bot'" class="space-y-3">
                <template v-if="editingConfigId">
                  <div class="grid grid-cols-3 gap-2">
                    <button v-for="platform in botChannels" :key="platform.channel" type="button" class="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50" :disabled="botConnectionsBusy" @click="addBotConnection(platform.channel)">
                      + 添加{{ platform.label }}机器人
                    </button>
                  </div>
                  <div v-if="botConnectionsError" class="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{{ botConnectionsError }}</div>
                  <div class="text-[11px] text-zinc-500">账号配置会在输入后自动保存，无需再点击保存按钮。</div>
                  <section v-for="platform in botChannels" :key="platform.channel" class="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                    <div class="flex items-center justify-between">
                      <div class="text-sm font-medium text-zinc-700 dark:text-zinc-200">{{ platform.label }}机器人</div>
                      <div class="text-[11px] text-zinc-400">{{ connectionsFor(platform.channel).length }} 个账号</div>
                    </div>
                    <div v-if="!connectionsFor(platform.channel).length && !botConnectionsBusy" class="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700">
                      尚未添加{{ platform.label }}机器人
                    </div>
                    <div v-for="item in connectionsFor(platform.channel)" :key="item.connection_ref" class="space-y-3 rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50" @input="autoSaveBotConnection(item)" @change="autoSaveBotConnection(item)">
                    <div class="flex flex-wrap items-center gap-2">
                      <input v-model="item.name" class="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="账号名称" />
                      <label class="flex items-center gap-1 text-xs"><input v-model="item.enabled" type="checkbox" />启用</label>
                      <label class="flex items-center gap-1 text-xs"><input v-model="item.is_default" type="checkbox" />默认</label>
                      <span class="rounded bg-zinc-100 px-2 py-1 text-[10px] text-zinc-500 dark:bg-zinc-800">{{ item.runtime_status?.message || item.state }}</span>
                      <span class="text-[10px]" :class="botConnectionSaveState[item.connection_ref] === 'error' ? 'text-red-500' : 'text-zinc-400'">
                        {{ botConnectionSaveState[item.connection_ref] === 'saving' ? '保存中…' : botConnectionSaveState[item.connection_ref] === 'error' ? '保存失败' : botConnectionSaveState[item.connection_ref] === 'saved' ? '已自动保存' : '' }}
                      </span>
                    </div>

                    <div v-if="item.credentials_unreadable" class="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      机器人加密密钥已更换，旧凭据无法解密。请重新填写 App Secret/Token，输入后会自动保存。
                    </div>

                    <div v-if="item.channel === 'feishu'" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input v-model="item.config.app_id" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="App ID" />
                      <input v-model="item.config.app_secret" type="password" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" :placeholder="item.credentials_configured ? 'App Secret（留空保持不变）' : 'App Secret'" />
                      <input v-model="item.config.verification_token" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="Verification Token" />
                      <input v-model="item.config.default_receive_id" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="默认接收 ID（可选）" />
                    </div>
                    <div v-else-if="item.channel === 'qq'" class="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input v-model="item.config.app_id" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="App ID" />
                      <input v-model="item.config.app_secret" type="password" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" :placeholder="item.credentials_configured ? 'App Secret（留空保持不变）' : 'App Secret'" />
                      <input v-model="item.config.default_target_id" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="默认接收 ID（可选）" />
                      <label class="flex items-center gap-2 text-xs"><input v-model="item.config.sandbox" type="checkbox" />沙箱环境</label>
                    </div>
                    <div v-else class="space-y-2">
                      <button type="button" class="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white" @click="startWechatLogin(item.connection_ref)">
                        {{ item.state === 'connected' ? '重新扫码连接' : '生成扫码二维码' }}
                      </button>
                      <div v-if="selectedConnectionRef === item.connection_ref && wechatQrDataUrl" class="flex justify-center rounded bg-white p-3">
                        <img :src="wechatQrDataUrl" alt="微信机器人授权二维码" class="h-52 w-52" />
                      </div>
                      <div v-if="selectedConnectionRef === item.connection_ref && wechatLogin.message" class="text-xs text-zinc-500">{{ wechatLogin.message }}</div>
                      <div v-if="selectedConnectionRef === item.connection_ref && wechatLogin.needs_verify_code" class="flex gap-2">
                        <input v-model="wechatVerifyCode" class="flex-1 rounded border px-2 py-1.5 text-xs" placeholder="微信验证码" />
                        <button type="button" class="rounded bg-indigo-600 px-3 text-xs text-white" @click="submitWechatCode">提交</button>
                      </div>
                    </div>

                    <div class="flex justify-end gap-2">
                      <button v-if="item.channel === 'wechat' && item.state === 'connected'" type="button" class="rounded border px-3 py-1.5 text-xs" @click="selectedConnectionRef = item.connection_ref; disconnectWechat()">断开</button>
                      <button type="button" class="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600" @click="removeBotConnection(item)">删除</button>
                    </div>
                    <div class="break-all text-[10px] text-zinc-400">{{ item.connection_ref }}</div>
                  </div>
                  </section>
                </template>

                <template v-else-if="form.bot_channel === 'feishu'">
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

                <template v-else-if="form.bot_channel === 'qq'">
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

                <template v-else>
                  <label class="flex items-center justify-between rounded border border-zinc-200 bg-zinc-50/60 px-2 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
                    <span>启用微信机器人</span>
                    <input
                      type="checkbox"
                      v-model="form.bot_configs.wechat.enabled"
                      @change="form.bot_configs.wechat.enabled && startWechatLogin()"
                    />
                  </label>

                  <div v-if="!editingConfigId" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                    请先保存 AI，重新打开机器人配置后即可生成微信授权二维码。
                  </div>

                  <div v-else class="space-y-3 rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <div class="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                          {{ wechatLogin.connected ? '微信已连接' : '微信扫码连接' }}
                        </div>
                        <div class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{{ wechatLogin.message }}</div>
                      </div>
                      <span
                        class="rounded-full px-2 py-1 text-[10px]"
                        :class="wechatLogin.connected
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
                      >
                        {{ wechatLogin.connected ? '已连接' : wechatLogin.state }}
                      </span>
                    </div>

                    <div v-if="wechatQrDataUrl" class="flex justify-center rounded-lg bg-white p-3">
                      <img :src="wechatQrDataUrl" class="h-56 w-56" alt="微信机器人授权二维码" />
                    </div>

                    <div v-if="wechatLogin.needs_verify_code" class="flex gap-2">
                      <input
                        v-model="wechatVerifyCode"
                        inputmode="numeric"
                        class="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="输入微信中显示的数字"
                      />
                      <button type="button" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50" :disabled="wechatLoginBusy || !wechatVerifyCode" @click="submitWechatCode">
                        提交
                      </button>
                    </div>

                    <div v-if="wechatLoginError" class="text-[11px] text-rose-600 dark:text-rose-300">{{ wechatLoginError }}</div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        v-if="!wechatLogin.connected"
                        type="button"
                        class="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50"
                        :disabled="wechatLoginBusy"
                          @click="startWechatLogin()"
                      >
                        {{ wechatLoginBusy ? '生成中…' : (wechatQrDataUrl ? '刷新二维码' : '生成二维码') }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-600 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300"
                        :disabled="wechatLoginBusy"
                        @click="disconnectWechat"
                      >
                        断开连接
                      </button>
                    </div>
                  </div>

                  <div class="text-[11px] text-zinc-500 dark:text-zinc-400">
                    通过腾讯 iLink 机器人授权；当前仅支持微信私聊，不支持微信群聊。二维码与连接凭据不会写入浏览器配置。
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
