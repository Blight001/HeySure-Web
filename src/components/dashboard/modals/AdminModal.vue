<script setup lang="ts">
import { defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import type { User } from '@/types'
import type { AdminModalTab as Tab } from '@/types/admin'
import {
  ADMIN_REFRESH_INTERVAL_MS,
  ADMIN_TAB_LABELS,
  ADMIN_TAB_ORDER,
} from '@/constants/admin'
import AdminServicesTab from './admin/AdminServicesTab.vue'
import AdminUsersTab from './admin/AdminUsersTab.vue'
import AdminAuthTab from './admin/AdminAuthTab.vue'
import AdminFilesTab from './admin/AdminFilesTab.vue'
import AdminDatabaseTab from './admin/AdminDatabaseTab.vue'
import AdminAuditTab from './admin/AdminAuditTab.vue'
import AdminDiagnosticsTab from './admin/AdminDiagnosticsTab.vue'
import AdminUpdateTab from './admin/AdminUpdateTab.vue'

const AdminDeviceReleasesTab = defineAsyncComponent(
  () => import('./admin/AdminDeviceReleasesTab.vue'),
)

const props = defineProps<{
  show: boolean
  currentUser?: User | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const tab = ref<Tab>('services')
const TAB_LABELS = ADMIN_TAB_LABELS
const TAB_ORDER = ADMIN_TAB_ORDER
const autoRefresh = ref(true)
let refreshTimer: number | null = null
const mainZIndex = usePopupZIndex(() => props.show)

type TabHandle = { tick?: () => void; onSwitch?: () => void; onLeave?: () => void }

const servicesTab = ref<TabHandle | null>(null)
const usersTab = ref<TabHandle | null>(null)
const authTab = ref<TabHandle | null>(null)
const filesTab = ref<TabHandle | null>(null)
const databaseTab = ref<TabHandle | null>(null)
const auditTab = ref<TabHandle | null>(null)
const diagnosticsTab = ref<TabHandle | null>(null)
const deviceReleasesTab = ref<TabHandle | null>(null)
const updateTab = ref<TabHandle | null>(null)

const switchTab = (next: Tab) => {
  const prev = tab.value
  tab.value = next
  if (prev === 'update' && next !== 'update') updateTab.value?.onLeave?.()
  const handlers: Record<Tab, TabHandle | null> = {
    services: servicesTab.value,
    users: usersTab.value,
    auth: authTab.value,
    files: filesTab.value,
    database: databaseTab.value,
    audit: auditTab.value,
    diagnostics: diagnosticsTab.value,
    deviceReleases: deviceReleasesTab.value,
    update: updateTab.value,
  }
  handlers[next]?.onSwitch?.()
}

const tick = () => {
  if (!props.show) return
  if (tab.value === 'services') servicesTab.value?.tick?.()
  else if (tab.value === 'audit') auditTab.value?.tick?.()
}

const stopAutoRefresh = () => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
}

const startAutoRefresh = () => {
  stopAutoRefresh()
  if (!autoRefresh.value) return
  refreshTimer = window.setInterval(tick, ADMIN_REFRESH_INTERVAL_MS)
}

watch(autoRefresh, () => startAutoRefresh())

watch(
  () => props.show,
  (open) => {
    if (!open) {
      stopAutoRefresh()
      return
    }
    tab.value = 'services'
    startAutoRefresh()
  },
)

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        :style="{ zIndex: mainZIndex }"
        class="fixed inset-0 modal-overlay flex items-start sm:items-center justify-center p-0 sm:p-4"
        @click="emit('close')"
      >
        <div
          class="acrylic-modal rounded-none sm:rounded-2xl shadow-2xl w-full h-full sm:w-full sm:max-w-5xl sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden"
          @click.stop
        >
          <div class="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-zinc-200 dark:border-zinc-800">
            <div class="flex items-center gap-2">
              <AppIcon name="shield" class="w-5 h-5 text-zinc-700 dark:text-zinc-200" />
              <h2 class="text-sm md:text-base font-bold text-zinc-800 dark:text-zinc-100">管理员控制台</h2>
            </div>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
                <input type="checkbox" v-model="autoRefresh" class="accent-indigo-500" />
                自动刷新
              </label>
              <button
                class="w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 flex items-center justify-center"
                @click="emit('close')"
              >✕</button>
            </div>
          </div>

          <div class="overflow-x-auto lg:overflow-x-visible border-b border-zinc-200 dark:border-zinc-800 admin-tab-scroll">
            <div class="flex gap-1 px-2 sm:px-5 pt-3 pb-0 min-w-max lg:min-w-0">
              <button
                v-for="t in TAB_ORDER"
                :key="t"
                class="px-2.5 sm:px-3 lg:px-2.5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex-shrink-0 lg:flex-1 lg:min-w-0 lg:overflow-hidden lg:truncate touch-manipulation active:scale-[0.985]"
                :class="tab === t
                  ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500 dark:bg-indigo-900/20 dark:text-indigo-300'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'"
                @click="switchTab(t)"
              >{{ TAB_LABELS[t] }}</button>
            </div>
          </div>

          <AdminServicesTab v-show="tab === 'services'" ref="servicesTab" />
          <AdminUsersTab v-show="tab === 'users'" ref="usersTab" :current-user="currentUser" />
          <AdminAuthTab v-show="tab === 'auth'" ref="authTab" :current-user="currentUser" />
          <AdminFilesTab v-show="tab === 'files'" ref="filesTab" />
          <AdminDatabaseTab v-show="tab === 'database'" ref="databaseTab" :current-user="currentUser" />
          <AdminAuditTab v-show="tab === 'audit'" ref="auditTab" />
          <AdminDiagnosticsTab v-show="tab === 'diagnostics'" ref="diagnosticsTab" />
          <AdminDeviceReleasesTab v-if="tab === 'deviceReleases'" ref="deviceReleasesTab" />
          <AdminUpdateTab v-show="tab === 'update'" ref="updateTab" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.admin-tab-scroll {
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
@media (min-width: 1024px) {
  .admin-tab-scroll {
    scrollbar-width: auto;
  }
}
.admin-tab-scroll::-webkit-scrollbar {
  height: 3px;
}
.admin-tab-scroll::-webkit-scrollbar-thumb {
  background: rgba(113, 113, 122, 0.35);
  border-radius: 3px;
}
.admin-tab-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(113, 113, 122, 0.55);
}
</style>
