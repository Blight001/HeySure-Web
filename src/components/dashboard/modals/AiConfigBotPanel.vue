<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'
import {
  createBotConnection, deleteBotConnection, disconnectBotLogin, getBotLoginStatus,
  listBotConnections, startBotLogin, submitBotVerifyCode, updateBotConnection,
  type BotConnectionItem, type BotLoginStatus,
} from '@/api/bots'

const props = defineProps<{
  form: any
  editingConfigId: number
  active: boolean
}>()

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
type QrBotChannel = 'wechat' | 'qq'
const channelLogin = ref<BotLoginStatus>({ state: 'disconnected', message: '尚未连接机器人', connected: false })
const channelQrDataUrl = ref('')
const channelLoginBusy = ref(false)
const channelLoginError = ref('')
const wechatLogin = channelLogin
const wechatQrDataUrl = channelQrDataUrl
const wechatLoginBusy = channelLoginBusy
const wechatLoginError = channelLoginError
const wechatVerifyCode = ref('')
let channelPollTimer: ReturnType<typeof setInterval> | null = null

const loadBotConnections = async () => {
  if (!props.editingConfigId) return
  botConnectionsBusy.value = true
  botConnectionsError.value = ''
  botConnections.value = []
  try {
    const result = await listBotConnections(props.editingConfigId)
    botConnections.value = Array.isArray(result.connections) ? result.connections : []
  } catch (err: any) {
    botConnectionsError.value = err?.message || '机器人账号列表加载失败'
  } finally {
    botConnectionsBusy.value = false
  }
}

const addBotConnection = async (channel: 'wechat' | 'qq' | 'feishu') => {
  if (!props.editingConfigId) return
  botConnectionsBusy.value = true
  try {
    const item = await createBotConnection(props.editingConfigId, {
      channel,
      name: `${channel === 'wechat' ? '微信' : channel === 'qq' ? 'QQ' : '飞书'}账号 ${connectionsFor(channel).length + 1}`,
      config: { enabled: true },
    })
    await loadBotConnections()
    selectedConnectionRef.value = item.connection_ref
    if (channel === 'wechat' || channel === 'qq') await startChannelLogin(channel, item.connection_ref)
  } catch (err: any) {
    botConnectionsError.value = err?.message || '新增机器人账号失败'
  } finally {
    botConnectionsBusy.value = false
  }
}

const persistBotConnection = async (item: BotConnectionItem) => {
  if (!props.editingConfigId) return
  botConnectionsError.value = ''
  botConnectionSaveState.value[item.connection_ref] = 'saving'
  try {
    await updateBotConnection(props.editingConfigId, item.connection_ref, {
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

const saveBotConnectionNow = (item: BotConnectionItem) => {
  const pending = botConnectionSaveTimers.get(item.connection_ref)
  if (pending) clearTimeout(pending)
  botConnectionSaveTimers.delete(item.connection_ref)
  void persistBotConnection(item)
}

const removeBotConnection = async (item: BotConnectionItem) => {
  if (!props.editingConfigId) return
  botConnectionsBusy.value = true
  try {
    await deleteBotConnection(props.editingConfigId, item.connection_ref)
    if (selectedConnectionRef.value === item.connection_ref) selectedConnectionRef.value = ''
    await loadBotConnections()
  } catch (err: any) {
    botConnectionsError.value = err?.message || '删除机器人账号失败'
  } finally {
    botConnectionsBusy.value = false
  }
}

const applyChannelLoginStatus = async (status: BotLoginStatus) => {
  const becameConnected = !!status.connected && !channelLogin.value.connected
  channelLogin.value = status
  channelQrDataUrl.value = status.qrcode_url
    ? await QRCode.toDataURL(status.qrcode_url, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
    : ''
  if (becameConnected) await loadBotConnections()
}

const loadChannelLoginStatus = async (channel: QrBotChannel, connectionRef = selectedConnectionRef.value) => {
  if (!props.editingConfigId || !connectionRef) return
  try {
    await applyChannelLoginStatus(await getBotLoginStatus(channel, props.editingConfigId, connectionRef))
  } catch (err: any) {
    channelLoginError.value = err?.message || `${channel === 'wechat' ? '微信' : 'QQ'}连接状态读取失败`
  }
}

const startChannelLogin = async (channel: QrBotChannel, connectionRef = selectedConnectionRef.value) => {
  if (!props.editingConfigId) return
  channelLoginBusy.value = true
  channelLoginError.value = ''
  try {
    props.form.bot_configs[channel].enabled = true
    selectedConnectionRef.value = connectionRef
    await applyChannelLoginStatus(await startBotLogin(channel, props.editingConfigId, connectionRef))
  } catch (err: any) {
    channelLoginError.value = err?.message || `生成${channel === 'wechat' ? '微信' : 'QQ'}二维码失败`
  } finally {
    channelLoginBusy.value = false
  }
}

const submitWechatCode = async () => {
  if (!props.editingConfigId) return
  channelLoginBusy.value = true
  channelLoginError.value = ''
  try {
    await applyChannelLoginStatus(await submitBotVerifyCode('wechat', props.editingConfigId, wechatVerifyCode.value, selectedConnectionRef.value))
    wechatVerifyCode.value = ''
  } catch (err: any) {
    channelLoginError.value = err?.message || '验证码提交失败'
  } finally {
    channelLoginBusy.value = false
  }
}

const disconnectChannel = async (channel: QrBotChannel) => {
  if (!props.editingConfigId) return
  channelLoginBusy.value = true
  channelLoginError.value = ''
  try {
    await applyChannelLoginStatus(await disconnectBotLogin(channel, props.editingConfigId, selectedConnectionRef.value))
  } catch (err: any) {
    channelLoginError.value = err?.message || `断开${channel === 'wechat' ? '微信' : 'QQ'}失败`
  } finally {
    channelLoginBusy.value = false
  }
}

const disconnectQrConnection = (item: BotConnectionItem) => {
  if (item.channel !== 'wechat' && item.channel !== 'qq') return
  selectedConnectionRef.value = item.connection_ref
  void disconnectChannel(item.channel)
}

const startWechatLogin = () => startChannelLogin('wechat')
const disconnectWechat = () => disconnectChannel('wechat')
const selectedQrConnection = () => botConnections.value.find(item =>
  item.connection_ref === selectedConnectionRef.value && (item.channel === 'wechat' || item.channel === 'qq'))
const pollSelectedChannelLogin = () => {
  const item = selectedQrConnection()
  if (item) void loadChannelLoginStatus(item.channel as QrBotChannel, item.connection_ref)
}
const stopChannelPolling = () => {
  if (channelPollTimer) clearInterval(channelPollTimer)
  channelPollTimer = null
}

watch(
  () => [props.active, props.editingConfigId],
  ([active, cfgId]) => {
    stopChannelPolling()
    selectedConnectionRef.value = ''
    botConnections.value = []
    channelQrDataUrl.value = ''
    channelLoginError.value = ''
    channelLogin.value = { state: 'disconnected', message: '尚未连接机器人', connected: false }
    if (active && cfgId) {
      void loadBotConnections().then(() => {
        const first = [...connectionsFor('wechat'), ...connectionsFor('qq')][0]
        if (!first) return
        selectedConnectionRef.value = first.connection_ref
        void loadChannelLoginStatus(first.channel as QrBotChannel, first.connection_ref)
        channelPollTimer = setInterval(pollSelectedChannelLogin, 2500)
      })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopChannelPolling()
  for (const timer of botConnectionSaveTimers.values()) clearTimeout(timer)
  botConnectionSaveTimers.clear()
})
</script>

<template>
  <div class="space-y-3">
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
        <div v-for="item in connectionsFor(platform.channel)" :key="item.connection_ref" class="space-y-3 rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50" @input="autoSaveBotConnection(item)" @change="saveBotConnectionNow(item)">
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
          <div v-else-if="item.channel === 'qq'" class="space-y-2">
            <button type="button" class="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50" :disabled="channelLoginBusy" @click="startChannelLogin('qq', item.connection_ref)">
              {{ item.credentials_configured ? '重新扫码绑定' : '生成 QQ 扫码二维码' }}
            </button>
            <div v-if="selectedConnectionRef === item.connection_ref && channelQrDataUrl" class="flex justify-center rounded bg-white p-3">
              <img :src="channelQrDataUrl" alt="QQ机器人授权二维码" class="h-52 w-52" />
            </div>
            <div v-if="selectedConnectionRef === item.connection_ref && channelLogin.message" class="text-xs text-zinc-500">{{ channelLogin.message }}</div>
            <div v-if="selectedConnectionRef === item.connection_ref && channelLoginError" class="text-xs text-red-500">{{ channelLoginError }}</div>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input v-model="item.config.app_id" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="App ID（也可手动填写）" />
              <input v-model="item.config.app_secret" type="password" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" :placeholder="item.credentials_configured ? 'App Secret（留空保持不变）' : 'App Secret（也可手动填写）'" />
              <input v-model="item.config.default_target_id" class="rounded border px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="默认接收 ID（可选）" />
              <label class="flex items-center gap-2 text-xs"><input v-model="item.config.sandbox" type="checkbox" />沙箱环境</label>
            </div>
          </div>
          <div v-else class="space-y-2">
            <button type="button" class="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50" :disabled="channelLoginBusy" @click="startChannelLogin('wechat', item.connection_ref)">
              {{ item.state === 'connected' ? '重新扫码连接' : '生成扫码二维码' }}
            </button>
            <div v-if="selectedConnectionRef === item.connection_ref && channelQrDataUrl" class="flex justify-center rounded bg-white p-3">
              <img :src="channelQrDataUrl" alt="微信机器人授权二维码" class="h-52 w-52" />
            </div>
            <div v-if="selectedConnectionRef === item.connection_ref && channelLogin.message" class="text-xs text-zinc-500">{{ channelLogin.message }}</div>
            <div v-if="selectedConnectionRef === item.connection_ref && channelLoginError" class="text-xs text-red-500">{{ channelLoginError }}</div>
            <div v-if="selectedConnectionRef === item.connection_ref && channelLogin.needs_verify_code" class="flex gap-2">
              <input v-model="wechatVerifyCode" class="flex-1 rounded border px-2 py-1.5 text-xs" placeholder="微信验证码" />
              <button type="button" class="rounded bg-indigo-600 px-3 text-xs text-white" @click="submitWechatCode">提交</button>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button v-if="(item.channel === 'wechat' && item.state === 'connected') || (item.channel === 'qq' && item.credentials_configured)" type="button" class="rounded border px-3 py-1.5 text-xs" @click="disconnectQrConnection(item)">断开</button>
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
        <input type="checkbox" v-model="form.bot_configs.wechat.enabled" @change="form.bot_configs.wechat.enabled && startWechatLogin()" />
      </label>
      <div v-if="!editingConfigId" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        请先保存 AI，重新打开机器人配置后即可生成微信授权二维码。
      </div>
      <div v-else class="space-y-3 rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-medium text-zinc-700 dark:text-zinc-200">{{ wechatLogin.connected ? '微信已连接' : '微信扫码连接' }}</div>
            <div class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{{ wechatLogin.message }}</div>
          </div>
          <span class="rounded-full px-2 py-1 text-[10px]" :class="wechatLogin.connected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'">
            {{ wechatLogin.connected ? '已连接' : wechatLogin.state }}
          </span>
        </div>
        <div v-if="wechatQrDataUrl" class="flex justify-center rounded-lg bg-white p-3">
          <img :src="wechatQrDataUrl" class="h-56 w-56" alt="微信机器人授权二维码" />
        </div>
        <div v-if="wechatLogin.needs_verify_code" class="flex gap-2">
          <input v-model="wechatVerifyCode" inputmode="numeric" class="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="输入微信中显示的数字" />
          <button type="button" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50" :disabled="wechatLoginBusy || !wechatVerifyCode" @click="submitWechatCode">提交</button>
        </div>
        <div v-if="wechatLoginError" class="text-[11px] text-rose-600 dark:text-rose-300">{{ wechatLoginError }}</div>
        <div class="flex flex-wrap gap-2">
          <button v-if="!wechatLogin.connected" type="button" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50" :disabled="wechatLoginBusy" @click="startWechatLogin()">
            {{ wechatLoginBusy ? '生成中…' : (wechatQrDataUrl ? '刷新二维码' : '生成二维码') }}
          </button>
          <button v-else type="button" class="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-600 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300" :disabled="wechatLoginBusy" @click="disconnectWechat">断开连接</button>
        </div>
      </div>
      <div class="text-[11px] text-zinc-500 dark:text-zinc-400">
        通过腾讯 iLink 机器人授权；当前仅支持微信私聊，不支持微信群聊。二维码与连接凭据不会写入浏览器配置。
      </div>
    </template>
  </div>
</template>
