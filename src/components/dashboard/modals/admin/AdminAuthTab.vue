<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { User } from '@/types'
import AppIcon from '@/components/common/AppIcon.vue'
import { ADMIN_REGISTRATION_MODE_OPTIONS } from '@/constants/admin'

const props = defineProps<{
  currentUser?: User | null
}>()

const { alert } = useMessage()

const isOwner = computed(() => props.currentUser?.role === 'owner')
const authLoaded = ref(false)
const authSettingsLoading = ref(false)
const authSettingsSaving = ref(false)
const authPasswordSet = ref(false)
const authEmailEnabled = ref(false)
const authForm = ref<{
  registration_mode: adminApi.RegistrationMode
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_from: string
  smtp_encryption: adminApi.SmtpEncryption
}>({
  registration_mode: 'open',
  smtp_host: '',
  smtp_port: 465,
  smtp_username: '',
  smtp_password: '',
  smtp_from: '',
  smtp_encryption: 'ssl',
})
const testEmailTo = ref('')
const testEmailSending = ref(false)

const rtcSettingsSaving = ref(false)
const rtcTurnPasswordSet = ref(false)
const rtcTurnEnabled = ref(false)
const rtcIcePreview = ref<adminApi.IceServer[]>([])
const rtcForm = ref<{
  stun_url: string
  turn_url: string
  turn_username: string
  turn_password: string
}>({
  stun_url: '',
  turn_url: '',
  turn_username: '',
  turn_password: '',
})

const REGISTRATION_MODE_OPTIONS = ADMIN_REGISTRATION_MODE_OPTIONS

const applyAuthSettings = (res: adminApi.AuthSettings) => {
  authForm.value = {
    registration_mode: res.registration_mode,
    smtp_host: res.smtp.host,
    smtp_port: res.smtp.port,
    smtp_username: res.smtp.username,
    smtp_password: '',
    smtp_from: res.smtp.from_addr,
    smtp_encryption: res.smtp.encryption,
  }
  authPasswordSet.value = res.smtp.password_set
  authEmailEnabled.value = res.email_enabled
}

const loadAuthSettings = async () => {
  authSettingsLoading.value = true
  try {
    applyAuthSettings(await adminApi.getAuthSettings())
    authLoaded.value = true
  } catch (e: any) {
    void alert(e?.message || '获取注册与邮箱设置失败')
  } finally {
    authSettingsLoading.value = false
  }
}

const saveAuthSettings = async () => {
  const f = authForm.value
  if (f.registration_mode === 'email' && !f.smtp_host.trim()) {
    void alert('邮箱验证注册模式需要先填写 SMTP 服务器')
    return
  }
  authSettingsSaving.value = true
  try {
    const res = await adminApi.updateAuthSettings({
      registration_mode: f.registration_mode,
      smtp_host: f.smtp_host.trim(),
      smtp_port: Number(f.smtp_port) || 465,
      smtp_username: f.smtp_username.trim(),
      smtp_password: f.smtp_password ? f.smtp_password : null,
      smtp_from: f.smtp_from.trim(),
      smtp_encryption: f.smtp_encryption,
    })
    applyAuthSettings(res)
    void alert(res.note || '设置已保存')
  } catch (e: any) {
    void alert(e?.message || '保存设置失败')
  } finally {
    authSettingsSaving.value = false
  }
}

const submitTestEmail = async () => {
  const to = testEmailTo.value.trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    void alert('请输入有效的邮箱地址')
    return
  }
  testEmailSending.value = true
  try {
    await adminApi.sendTestEmail(to)
    void alert(`测试邮件已发送至 ${to}，请查收`)
  } catch (e: any) {
    void alert(e?.message || '发送测试邮件失败')
  } finally {
    testEmailSending.value = false
  }
}

const applyRtcSettings = (res: adminApi.RtcSettings) => {
  rtcForm.value = {
    stun_url: res.stun_url,
    turn_url: res.turn_url,
    turn_username: res.turn_username,
    turn_password: '',
  }
  rtcTurnPasswordSet.value = res.turn_password_set
  rtcTurnEnabled.value = res.turn_enabled
  rtcIcePreview.value = res.ice_servers
}

const loadRtcSettings = async () => {
  try {
    applyRtcSettings(await adminApi.getRtcSettings())
  } catch (e: any) {
    void alert(e?.message || '获取远程控制设置失败')
  }
}

const saveRtcSettings = async () => {
  const f = rtcForm.value
  if (f.turn_url.trim() && !/^turns?:/i.test(f.turn_url.trim())) {
    void alert('TURN 地址应以 turn: 或 turns: 开头，例如 turn:relay.example.com:3478')
    return
  }
  rtcSettingsSaving.value = true
  try {
    const res = await adminApi.updateRtcSettings({
      stun_url: f.stun_url.trim(),
      turn_url: f.turn_url.trim(),
      turn_username: f.turn_username.trim(),
      turn_password: f.turn_password ? f.turn_password : null,
    })
    applyRtcSettings(res)
    void alert('远程控制设置已保存，客户端下次建立会话时生效')
  } catch (e: any) {
    void alert(e?.message || '保存远程控制设置失败')
  } finally {
    rtcSettingsSaving.value = false
  }
}

const rtcIcePreviewText = (server: adminApi.IceServer): string => {
  const urls = Array.isArray(server.urls) ? server.urls.join(', ') : server.urls
  return server.username ? `${urls}（含凭据）` : urls
}

defineExpose({
  onSwitch: () => {
    if (authLoaded.value) return
    void loadAuthSettings()
    void loadRtcSettings()
  },
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-6">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">注册与邮箱设置</h3>
      <div class="flex items-center gap-2">
        <span
          class="text-[10px] px-2 py-0.5 rounded-full"
          :class="authEmailEnabled
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-zinc-100/60 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400'"
        >{{ authEmailEnabled ? '邮件服务可用' : '邮件服务未配置' }}</span>
        <button
          class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
          :disabled="authSettingsLoading"
          @click="loadAuthSettings"
        >{{ authSettingsLoading ? '刷新中…' : '↻ 刷新' }}</button>
      </div>
    </div>

    <div v-if="!isOwner" class="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-900/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
      仅房主可修改注册模式与邮箱配置，管理员可查看当前状态。
    </div>

    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">注册模式</h4>
      <div class="space-y-2">
        <label
          v-for="opt in REGISTRATION_MODE_OPTIONS"
          :key="opt.value"
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
          :class="[
            authForm.registration_mode === opt.value
              ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-700 dark:bg-indigo-900/15'
              : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700',
            !isOwner ? 'opacity-60 cursor-not-allowed' : '',
          ]"
        >
          <input
            type="radio"
            name="registration-mode"
            class="mt-0.5 accent-indigo-600"
            :value="opt.value"
            v-model="authForm.registration_mode"
            :disabled="!isOwner"
          />
          <div class="min-w-0">
            <div class="text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ opt.label }}</div>
            <div class="text-xs text-zinc-400 mt-0.5">{{ opt.desc }}</div>
          </div>
        </label>
      </div>
      <p v-if="authForm.registration_mode === 'email' && !authEmailEnabled" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
        <AppIcon name="warning" class="w-3.5 h-3.5" /> 当前邮件服务未配置：保存后新用户将无法收到验证码，请先完成下方 SMTP 配置。
      </p>
    </div>

    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">邮箱（SMTP）配置</h4>
      <p class="text-xs text-zinc-400 mb-3">用于发送注册 / 登录验证码与系统邮件。配置保存在服务器数据库，亦可通过 HEYSURE_SMTP_* 环境变量提供默认值。</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">SMTP 服务器</label>
          <input v-model="authForm.smtp_host" :disabled="!isOwner" type="text" placeholder="如 smtp.qq.com"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">端口</label>
          <input v-model.number="authForm.smtp_port" :disabled="!isOwner" type="number" min="1" max="65535" placeholder="465"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">用户名</label>
          <input v-model="authForm.smtp_username" :disabled="!isOwner" type="text" autocomplete="off" placeholder="通常为完整邮箱地址"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">密码 / 授权码</label>
          <input v-model="authForm.smtp_password" :disabled="!isOwner" type="password" autocomplete="new-password"
            :placeholder="authPasswordSet ? '已配置（留空保持不变）' : '请输入 SMTP 密码或授权码'"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">发件地址</label>
          <input v-model="authForm.smtp_from" :disabled="!isOwner" type="text" placeholder="留空使用用户名"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">加密方式</label>
          <select v-model="authForm.smtp_encryption" :disabled="!isOwner"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 text-zinc-700 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200 disabled:opacity-60">
            <option value="ssl">SSL（端口 465）</option>
            <option value="starttls">STARTTLS（端口 587）</option>
            <option value="none">不加密</option>
          </select>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <input v-model="testEmailTo" :disabled="!isOwner" type="email" placeholder="测试收件邮箱"
            class="text-sm acrylic-input rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60 w-52" />
          <button
            class="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-300 disabled:opacity-50"
            :disabled="!isOwner || testEmailSending"
            title="先保存配置再测试"
            @click="submitTestEmail"
          >{{ testEmailSending ? '发送中…' : '发送测试邮件' }}</button>
        </div>
        <button
          class="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          :disabled="!isOwner || authSettingsSaving"
          @click="saveAuthSettings"
        >{{ authSettingsSaving ? '保存中…' : '保存设置' }}</button>
      </div>
    </div>

    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div class="flex items-center justify-between mb-1">
        <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">远程控制（STUN / TURN）</h4>
        <span
          class="text-[10px] px-2 py-0.5 rounded-full"
          :class="rtcTurnEnabled
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'"
        >{{ rtcTurnEnabled ? 'TURN 已启用' : '仅 STUN（受限网络会失败）' }}</span>
      </div>
      <p class="text-xs text-zinc-400 mb-3">
        下发给全部远程控制端（网页控制台、游戏画面、桌面 / 浏览器 / 手机 agent）的 ICE 服务器。
        无 TURN 中继时，双方处于对称 NAT / 受限网络会连接失败。配置保存在服务器数据库，亦可通过
        HEYSURE_TURN_URL / HEYSURE_TURN_USERNAME / HEYSURE_TURN_PASSWORD 环境变量提供默认值。
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="md:col-span-2">
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">STUN 地址</label>
          <input v-model="rtcForm.stun_url" :disabled="!isOwner" type="text" placeholder="如 stun:stun.l.google.com:19302"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">TURN 地址</label>
          <input v-model="rtcForm.turn_url" :disabled="!isOwner" type="text" placeholder="如 turn:relay.example.com:3478（留空则不使用 TURN）"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">TURN 用户名</label>
          <input v-model="rtcForm.turn_username" :disabled="!isOwner" type="text" autocomplete="off" placeholder="TURN 长期凭据用户名"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">TURN 密码</label>
          <input v-model="rtcForm.turn_password" :disabled="!isOwner" type="password" autocomplete="new-password"
            :placeholder="rtcTurnPasswordSet ? '已配置（留空保持不变）' : '请输入 TURN 凭据密码'"
            class="w-full text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60" />
        </div>
      </div>
      <div v-if="rtcIcePreview.length" class="mt-3 text-[11px] text-zinc-400">
        <span class="text-zinc-500 dark:text-zinc-400">客户端将收到：</span>
        <span v-for="(srv, i) in rtcIcePreview" :key="i" class="inline-block mr-2 font-mono">{{ rtcIcePreviewText(srv) }}</span>
      </div>
      <div class="mt-4 flex items-center justify-end">
        <button
          class="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          :disabled="!isOwner || rtcSettingsSaving"
          @click="saveRtcSettings"
        >{{ rtcSettingsSaving ? '保存中…' : '保存设置' }}</button>
      </div>
    </div>
  </div>
</template>
