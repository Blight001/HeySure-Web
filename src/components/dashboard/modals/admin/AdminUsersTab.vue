<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { AdminUser } from '@/api/admin'
import type { User, UserRole } from '@/types'
import { resolveAvatarUrl } from '@/utils/avatar'
import { ADMIN_ROLE_OPTIONS } from '@/constants/admin'
import { formatOptionalDateTime } from '@/utils/adminFormat'

const props = defineProps<{
  currentUser?: User | null
}>()

const { alert, confirm, prompt } = useMessage()

const users = ref<AdminUser[]>([])
const usersLoading = ref(false)
const newUserOpen = ref(false)
const creatingUser = ref(false)
const newUser = ref<{ name: string; account: string; password: string; role: UserRole }>({
  name: '', account: '', password: '', role: 'member',
})

const isOwner = computed(() => props.currentUser?.role === 'owner')
const ROLE_OPTIONS = ADMIN_ROLE_OPTIONS
const fmtTime = formatOptionalDateTime

const avatarFor = (u: AdminUser) =>
  resolveAvatarUrl(u.avatar) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.name)}`

const loadUsers = async () => {
  usersLoading.value = true
  try {
    const res = await adminApi.listUsers()
    users.value = res.users
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    usersLoading.value = false
  }
}

const changeRole = async (u: AdminUser, event: Event) => {
  const role = (event.target as HTMLSelectElement).value as UserRole
  if (role === u.role) return
  const ok = await confirm({ message: `将 ${u.name}（${u.account}）的权限设为「${ROLE_OPTIONS.find(r => r.value === role)?.label}」？`, type: 'warning' })
  if (!ok) {
    ;(event.target as HTMLSelectElement).value = u.role
    return
  }
  try {
    const res = await adminApi.setUserRole(u.id, role)
    const idx = users.value.findIndex(x => x.id === u.id)
    if (idx >= 0) users.value[idx] = res.user
  } catch (err) {
    ;(event.target as HTMLSelectElement).value = u.role
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const resetPassword = async (u: AdminUser) => {
  const pwd = await prompt({
    title: '重置密码',
    message: `为 ${u.name}（${u.account}）设置新密码（至少 6 位）`,
    placeholder: '输入新密码',
  })
  if (pwd === null) return
  if (pwd.trim().length < 6) {
    await alert({ message: '密码至少需要 6 位', type: 'warning' })
    return
  }
  try {
    await adminApi.resetUserPassword(u.id, pwd.trim())
    await alert({ message: '密码已重置', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const deleteUser = async (u: AdminUser) => {
  const ok = await confirm({
    message: `确认删除用户 ${u.name}（${u.account}）？该用户的所有数据将一并删除，且不可恢复。`,
    type: 'warning',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await adminApi.deleteUser(u.id)
    users.value = users.value.filter(x => x.id !== u.id)
    await alert({ message: '用户已删除', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  }
}

const submitNewUser = async () => {
  const name = newUser.value.name.trim()
  const account = newUser.value.account.trim()
  const password = newUser.value.password.trim()
  if (!name || !account) {
    await alert({ message: '昵称和账号不能为空', type: 'warning' })
    return
  }
  if (password.length < 6) {
    await alert({ message: '密码至少需要 6 位', type: 'warning' })
    return
  }
  creatingUser.value = true
  try {
    const res = await adminApi.createUser({ name, account, password, role: newUser.value.role })
    users.value.push(res.user)
    newUser.value = { name: '', account: '', password: '', role: 'member' }
    newUserOpen.value = false
    await alert({ message: '用户已创建', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    creatingUser.value = false
  }
}

onMounted(() => { void loadUsers() })

defineExpose({
  onSwitch: () => {
    if (!users.value.length) void loadUsers()
  },
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">后台用户</h3>
      <div class="flex items-center gap-2">
        <button
          class="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          @click="newUserOpen = !newUserOpen"
        >＋ 新建用户</button>
        <button
          class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
          :disabled="usersLoading"
          @click="loadUsers"
        >{{ usersLoading ? '刷新中…' : '↻ 刷新' }}</button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="newUserOpen" class="mb-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 dark:border-indigo-800/60 dark:bg-indigo-900/10">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input v-model="newUser.name" type="text" placeholder="昵称"
            class="text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" />
          <input v-model="newUser.account" type="text" placeholder="账号（登录名）" autocomplete="off"
            class="text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" />
          <input v-model="newUser.password" type="password" placeholder="初始密码（至少 6 位）" autocomplete="new-password"
            class="text-sm acrylic-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100" />
          <select v-model="newUser.role"
            class="text-sm acrylic-input rounded-lg px-3 py-2 text-zinc-700 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200">
            <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value"
              :disabled="opt.value === 'owner' && !isOwner">{{ opt.label }}</option>
          </select>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button class="text-xs px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400" @click="newUserOpen = false">取消</button>
          <button class="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="creatingUser" @click="submitNewUser">{{ creatingUser ? '创建中…' : '创建' }}</button>
        </div>
      </div>
    </Transition>

    <div class="space-y-2">
      <div
        v-for="u in users"
        :key="u.id"
        class="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <img :src="avatarFor(u)" class="w-10 h-10 rounded-full border border-zinc-200 bg-zinc-50/60 object-cover shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{{ u.name }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100/60 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">{{ u.role_label }}</span>
          </div>
          <div class="text-xs text-zinc-400 truncate">账号：{{ u.account }}<template v-if="u.email"> · 邮箱：{{ u.email }}</template> · 注册于 {{ fmtTime(u.created_at) }}</div>
        </div>
        <select
          class="text-xs acrylic-input rounded-lg px-2 py-1.5 text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200 disabled:opacity-50"
          :value="u.role"
          :disabled="!isOwner"
          :title="isOwner ? '设置权限' : '仅房主可调整权限'"
          @change="changeRole(u, $event)"
        >
          <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button
          class="text-[11px] px-2 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-300 whitespace-nowrap"
          @click="resetPassword(u)"
        >重置密码</button>
        <button
          v-if="u.id !== currentUser?.id"
          class="text-[11px] px-2 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20 whitespace-nowrap"
          @click="deleteUser(u)"
        >删除</button>
      </div>
      <div v-if="!users.length && !usersLoading" class="text-center text-zinc-400 py-8 text-sm">暂无用户</div>
    </div>
  </div>
</template>
