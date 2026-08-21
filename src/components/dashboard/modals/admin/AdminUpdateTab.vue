<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import * as adminApi from '@/api/admin'
import type { RepoCommitInfo, RepoUpdateStatus, RepoVersionEntry } from '@/api/admin'
import { usePopupZIndex } from '@/composables/usePopupZIndex'
import { ADMIN_REPO_PHASE_META, ADMIN_REPO_STEP_ICON } from '@/constants/admin'
import { formatCommitDateTime } from '@/utils/adminFormat'
import {
  buildRepoProgressLines,
  REPO_ACTIVE_PHASES,
  repoProgressLineClass,
  repoStepLabel as formatRepoStepLabel,
} from '@/utils/adminRepoProgress'

const { alert, confirm } = useMessage()

const repoStatus = ref<RepoUpdateStatus | null>(null)
const repoLoading = ref(false)
const repoBusy = ref(false)
const repoSavingConfig = ref(false)
const repoUnreachable = ref(false)
const repoForm = ref<{ auto_enabled: boolean; interval_minutes: number }>({ auto_enabled: false, interval_minutes: 30 })
const repoCommitDetail = ref<RepoCommitInfo | null>(null)
const repoVersions = ref<RepoVersionEntry[]>([])
const repoVersionsLoading = ref(false)
const repoVersionsError = ref('')
const repoRollbackBusy = ref(false)
const selectedRollbackSha = ref('')
const rollbackWarning = ref('回退后将自动停止更新；数据库迁移不会自动降级。')
let repoPollTimer: number | null = null
let repoVersionsRefreshQueued = false

const repoCommitZIndex = usePopupZIndex(() => !!repoCommitDetail.value)
const REPO_PHASE_META = ADMIN_REPO_PHASE_META
const REPO_STEP_ICON = ADMIN_REPO_STEP_ICON
const fmtCommitTime = formatCommitDateTime

const repoActive = computed(() => {
  const p = repoStatus.value?.state.phase
  return !!p && REPO_ACTIVE_PHASES.has(p)
})

const rollbackVersions = computed(() => repoVersions.value.filter(version => !version.is_current))
const rollbackOptions = computed(() => rollbackVersions.value.filter(version => version.rollback_eligible))
const selectedRollbackVersion = computed(() =>
  rollbackOptions.value.find(version => version.sha === selectedRollbackSha.value) || null,
)

const repoStepLabel = (step: { key: string; label: string }) =>
  formatRepoStepLabel(step, repoStatus.value?.state.phase || '')

const repoProgressLines = computed(() =>
  buildRepoProgressLines(repoStatus.value, repoUnreachable.value, fmtCommitTime),
)

const rollbackJustFinished = (previous: RepoUpdateStatus | null, next: RepoUpdateStatus) => {
  if (previous?.state.trigger !== 'rollback' || next.state.trigger !== 'rollback') return false
  return REPO_ACTIVE_PHASES.has(previous.state.phase) && ['done', 'error'].includes(next.state.phase)
}

const currentVersionChanged = (previous: RepoUpdateStatus | null, next: RepoUpdateStatus) => {
  const previousSha = previous?.version.current?.sha
  const nextSha = next.version.current?.sha
  return !!previousSha && !!nextSha && previousSha !== nextSha
}

const loadRepoStatus = async (silent = false) => {
  if (!silent) repoLoading.value = true
  try {
    const res = await adminApi.getRepoUpdateStatus()
    const previous = repoStatus.value
    repoStatus.value = res
    repoUnreachable.value = false
    if (!silent || (res.state.trigger === 'rollback' && !res.config.auto_enabled)) {
      repoForm.value = {
        auto_enabled: res.config.auto_enabled,
        interval_minutes: Math.max(1, Math.round(res.config.interval_seconds / 60)),
      }
    }
    if (silent && (currentVersionChanged(previous, res) || rollbackJustFinished(previous, res))) {
      selectedRollbackSha.value = ''
      void loadRepoVersions()
    }
    return res
  } catch (err) {
    if (repoActive.value) {
      repoUnreachable.value = true
    } else if (!silent) {
      await alert({ message: (err as Error).message, type: 'error' })
    }
    return null
  } finally {
    if (!silent) repoLoading.value = false
  }
}

const loadRepoVersions = async () => {
  selectedRollbackSha.value = ''
  if (repoVersionsLoading.value) {
    repoVersionsRefreshQueued = true
    return
  }
  repoVersionsLoading.value = true
  repoVersionsRefreshQueued = false
  repoVersionsError.value = ''
  try {
    const res = await adminApi.getRepoVersions(20)
    repoVersions.value = res.versions || []
    rollbackWarning.value = res.rollback_warning || rollbackWarning.value
  } catch (err) {
    repoVersions.value = []
    selectedRollbackSha.value = ''
    repoVersionsError.value = (err as Error).message
  } finally {
    repoVersionsLoading.value = false
    if (repoVersionsRefreshQueued) void loadRepoVersions()
  }
}

const refreshRepoTab = async () => {
  const status = await loadRepoStatus()
  if (status?.updater_available) {
    await loadRepoVersions()
    return
  }
  repoVersions.value = []
  selectedRollbackSha.value = ''
  repoVersionsError.value = ''
}

const stopRepoPoll = () => {
  if (repoPollTimer !== null) {
    clearInterval(repoPollTimer)
    repoPollTimer = null
  }
}

const startRepoPoll = () => {
  stopRepoPoll()
  repoPollTimer = window.setInterval(() => {
    void loadRepoStatus(true)
  }, 2500)
}

const saveRepoConfig = async () => {
  repoSavingConfig.value = true
  try {
    const res = await adminApi.updateRepoUpdateConfig({
      auto_enabled: repoForm.value.auto_enabled,
      interval_seconds: Math.max(1, Math.round(repoForm.value.interval_minutes)) * 60,
    })
    repoStatus.value = res
    repoForm.value = {
      auto_enabled: res.config.auto_enabled,
      interval_minutes: Math.max(1, Math.round(res.config.interval_seconds / 60)),
    }
    await alert({ message: '已保存自动更新设置', type: 'success' })
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    repoSavingConfig.value = false
  }
}

const triggerRepoCheck = async (apply: boolean) => {
  if (apply) {
    const yes = await confirm({
      message: '将检测远程是否有新版本；若发现更新会自动拉取最新代码并重启全部服务（重启期间控制台会短暂不可用）。确定继续？',
      type: 'warning',
    })
    if (!yes) return
  }
  repoBusy.value = true
  try {
    await adminApi.checkRepoUpdate(apply)
    await loadRepoStatus(true)
  } catch (err) {
    await alert({ message: (err as Error).message, type: 'error' })
  } finally {
    repoBusy.value = false
  }
}

const rollbackRepoVersion = async () => {
  const target = selectedRollbackVersion.value
  if (!target) {
    await alert({ message: '请先选择可回退的历史版本', type: 'warning' })
    return
  }
  const yes = await confirm({
    message: `确认将当前版本回退到 ${target.short}「${target.subject}」？回退会重建并重启服务，期间控制台会短暂不可用。回退后将自动停止更新；数据库迁移不会自动降级。`,
    type: 'warning',
  })
  if (!yes) return
  selectedRollbackSha.value = ''
  repoRollbackBusy.value = true
  try {
    const result = await adminApi.rollbackRepoVersion(target.sha)
    repoForm.value.auto_enabled = false
    if (repoStatus.value) {
      repoStatus.value = { ...repoStatus.value, config: result.config, state: result.state }
    }
    rollbackWarning.value = result.warning || rollbackWarning.value
    await alert({ message: '版本回退已开始，自动更新已关闭。服务恢复后请核对当前版本。', type: 'success' })
    await loadRepoStatus(true)
  } catch (err) {
    const message = (err as Error).message
    const status = await loadRepoStatus(true)
    if (status && !status.config.auto_enabled) {
      repoForm.value.auto_enabled = false
      repoForm.value.interval_minutes = Math.max(1, Math.round(status.config.interval_seconds / 60))
    }
    await alert({ message, type: 'error' })
  } finally {
    repoRollbackBusy.value = false
  }
}

defineExpose({
  onSwitch: () => {
    void refreshRepoTab()
    startRepoPoll()
  },
  onLeave: stopRepoPoll,
})

onUnmounted(() => {
  stopRepoPoll()
})
</script>

<template>
  <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">版本与自动更新</h3>
      <button
        class="text-xs px-2 py-1 rounded-lg border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 dark:border-zinc-700 dark:text-zinc-400"
        :disabled="repoLoading || repoVersionsLoading"
        @click="refreshRepoTab"
      >{{ repoLoading || repoVersionsLoading ? '刷新中…' : '↻ 刷新' }}</button>
    </div>

    <div
      v-if="repoStatus && repoStatus.update_mode === 'unavailable'"
      class="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-900/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300"
    >
      未连接宿主版本更新服务，暂时无法自动更新。请通过 <code>docker-run.sh</code> 或 <code>docker-run.bat</code> 启动服务，或配置 <code>HEYSURE_REPO_UPDATER_URL</code> 指向可用的更新服务。
    </div>

    <template v-if="repoStatus">
      <section class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">当前版本</h4>
        <div class="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          <div class="flex items-center gap-2">
            <span class="text-zinc-400 w-16 shrink-0">分支</span>
            <span class="font-mono">{{ repoStatus.version.branch || '（未知）' }}</span>
          </div>
          <div v-if="repoStatus.version.current" class="flex items-start gap-2">
            <span class="text-zinc-400 w-16 shrink-0">提交</span>
            <span class="min-w-0">
              <span class="font-mono text-indigo-600 dark:text-indigo-400">{{ repoStatus.version.current.short }}</span>
              <span class="text-zinc-500 dark:text-zinc-400"> · {{ repoStatus.version.current.subject }}</span>
              <span class="block text-zinc-400 mt-0.5">{{ repoStatus.version.current.author }} · {{ fmtCommitTime(repoStatus.version.current.committed_at) }}</span>
              <button
                class="mt-1 text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                @click="repoCommitDetail = repoStatus.version.current"
              >查看详情</button>
            </span>
          </div>
          <div v-if="repoStatus.last_update.at" class="flex items-center gap-2 pt-1">
            <span class="text-zinc-400 w-16 shrink-0">上次更新</span>
            <span>{{ fmtCommitTime(repoStatus.last_update.at) }}
              <span v-if="repoStatus.last_update.commit" class="font-mono text-zinc-400"> → {{ repoStatus.last_update.commit.slice(0, 7) }}</span>
            </span>
          </div>
        </div>
      </section>

      <section class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">自动检测设置</h4>
        <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200 cursor-pointer select-none">
          <input type="checkbox" v-model="repoForm.auto_enabled" class="accent-indigo-600" :disabled="repoActive || repoRollbackBusy || !repoStatus.updater_available" />
          开启定时自动检测（检测到新版本将自动更新）
        </label>
        <div class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <span class="text-zinc-500 dark:text-zinc-400">检测间隔</span>
          <input
            v-model.number="repoForm.interval_minutes"
            type="number"
            :min="Math.max(1, Math.round(repoStatus.limits.min_interval / 60))"
            :max="Math.round(repoStatus.limits.max_interval / 60)"
            :disabled="repoActive || repoRollbackBusy || !repoStatus.updater_available"
            class="w-24 text-sm acrylic-input rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-100 disabled:opacity-60"
          />
          <span class="text-zinc-500 dark:text-zinc-400">分钟</span>
          <span class="text-[11px] text-zinc-400">（{{ Math.max(1, Math.round(repoStatus.limits.min_interval / 60)) }}–{{ Math.round(repoStatus.limits.max_interval / 60) }} 分钟）</span>
        </div>
        <div class="flex justify-end">
          <button
            class="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="repoSavingConfig || repoActive || repoRollbackBusy || !repoStatus.updater_available"
            @click="saveRepoConfig"
          >{{ repoSavingConfig ? '保存中…' : '保存设置' }}</button>
        </div>
      </section>

      <section class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <div>
          <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">历史版本回退</h4>
          <p class="mt-1 text-[11px] text-zinc-400">选择当前分支主线历史中的可用版本。</p>
        </div>

        <div class="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/10 dark:text-amber-300">
          <span class="font-semibold">重要：</span>{{ rollbackWarning }}
        </div>

        <div v-if="repoVersionsError" class="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300">
          {{ repoVersionsError }}
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label class="min-w-0 flex-1 text-xs text-zinc-600 dark:text-zinc-300">
            <span class="mb-1.5 block text-zinc-500 dark:text-zinc-400">目标版本</span>
            <select
              v-model="selectedRollbackSha"
              class="w-full acrylic-input rounded-lg px-3 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-zinc-200 disabled:opacity-60"
              :disabled="repoVersionsLoading || repoRollbackBusy || repoActive || !repoStatus.updater_available"
            >
              <option value="" disabled>{{ repoVersionsLoading ? '正在加载历史版本…' : '请选择历史版本' }}</option>
              <option
                v-for="version in rollbackVersions"
                :key="version.sha"
                :value="version.sha"
                :disabled="!version.rollback_eligible"
              >
                {{ version.short }} · {{ version.subject }} · {{ fmtCommitTime(version.committed_at) }}{{ version.rollback_eligible ? '' : ` · 不可回退：${version.disabled_reason || '数据库迁移不兼容'}` }}
              </option>
            </select>
          </label>
          <button
            class="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
            :disabled="repoRollbackBusy || repoActive || !selectedRollbackVersion || !repoStatus.updater_available"
            @click="rollbackRepoVersion"
          >{{ repoRollbackBusy || (repoActive && repoStatus.state.trigger === 'rollback') ? '回退中…' : '回退到所选版本' }}</button>
        </div>

        <div v-if="selectedRollbackVersion" class="rounded-lg bg-zinc-50/70 px-3 py-2 text-xs dark:bg-zinc-900/40">
          <div class="font-medium text-zinc-700 dark:text-zinc-200">{{ selectedRollbackVersion.subject }}</div>
          <div class="mt-1 text-[11px] text-zinc-400">
            {{ selectedRollbackVersion.author }} · {{ fmtCommitTime(selectedRollbackVersion.committed_at) }} ·
            <button class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400" @click="repoCommitDetail = selectedRollbackVersion">查看详情</button>
          </div>
        </div>
        <div v-else-if="!repoVersionsLoading && !repoVersionsError" class="text-xs text-zinc-400">暂无可回退的历史版本。</div>
      </section>

      <section class="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">检测与更新进度</h4>
            <span
              class="text-[10px] px-2 py-0.5 rounded-full font-medium"
              :class="(REPO_PHASE_META[repoUnreachable ? 'restarting' : repoStatus.state.phase] || REPO_PHASE_META.idle).cls"
            >{{ (REPO_PHASE_META[repoUnreachable ? 'restarting' : repoStatus.state.phase] || { label: repoStatus.state.phase }).label }}</span>
          </div>
          <button
            class="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="repoBusy || repoActive || !repoStatus.updater_available"
            @click="triggerRepoCheck(true)"
          >{{ repoBusy || repoActive ? '执行中…' : '立即检测并更新' }}</button>
        </div>

        <div class="flex flex-col gap-2">
          <div
            v-for="step in repoStatus.state.steps"
            :key="step.key"
            class="flex items-center gap-2.5 text-sm"
          >
            <span
              class="w-5 h-5 inline-flex items-center justify-center rounded-full text-[11px] font-bold shrink-0"
              :class="{
                'bg-zinc-100/60 text-zinc-400 dark:bg-zinc-800/60': step.status === 'pending' || step.status === 'skipped',
                'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 animate-pulse': step.status === 'active',
                'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300': step.status === 'done',
                'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300': step.status === 'error',
              }"
            >{{ REPO_STEP_ICON[step.status] || '○' }}</span>
            <span
              :class="step.status === 'pending' || step.status === 'skipped'
                ? 'text-zinc-400'
                : 'text-zinc-700 dark:text-zinc-200'"
            >{{ repoStepLabel(step) }}</span>
            <span v-if="step.status === 'skipped'" class="text-[11px] text-zinc-400">（跳过）</span>
          </div>
        </div>

        <div
          v-if="repoProgressLines.length"
          class="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          <div
            v-for="line in repoProgressLines"
            :key="line.key"
            class="flex gap-2 leading-5"
            :class="repoProgressLineClass(line.tone)"
          >
            <span class="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-current opacity-60"></span>
            <span>{{ line.text }}</span>
          </div>
        </div>
      </section>
    </template>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="repoCommitDetail"
        :style="{ zIndex: repoCommitZIndex }"
        class="fixed inset-0 modal-overlay flex items-center justify-center p-4"
        @click="repoCommitDetail = null"
      >
        <div
          class="acrylic-modal rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
          @click.stop
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-800 dark:text-zinc-100">提交详情</h3>
            <button class="w-7 h-7 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="repoCommitDetail = null">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
            <div>
              <div class="font-semibold text-zinc-800 dark:text-zinc-100">{{ repoCommitDetail.subject }}</div>
              <div class="mt-1 text-xs text-zinc-400">{{ repoCommitDetail.author }} · {{ fmtCommitTime(repoCommitDetail.committed_at) }}</div>
              <code class="mt-2 block text-xs text-indigo-600 dark:text-indigo-400 break-all">{{ repoCommitDetail.sha }}</code>
            </div>
            <pre v-if="repoCommitDetail.body && repoCommitDetail.body !== repoCommitDetail.subject" class="rounded-lg bg-zinc-50/60 dark:bg-zinc-800/60 p-3 text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">{{ repoCommitDetail.body }}</pre>
            <div>
              <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">变更文件（{{ repoCommitDetail.files?.length || 0 }}）</div>
              <div v-if="repoCommitDetail.files?.length" class="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                <div v-for="file in repoCommitDetail.files" :key="file.path" class="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <code class="text-zinc-700 dark:text-zinc-200 break-all">{{ file.path }}</code>
                  <span class="shrink-0 font-mono">
                    <span class="text-emerald-600">+{{ file.added ?? 'bin' }}</span>
                    <span class="ml-2 text-red-500">-{{ file.deleted ?? 'bin' }}</span>
                  </span>
                </div>
              </div>
              <div v-else class="text-xs text-zinc-400">该版本未提供文件变更详情。</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  </div>
</template>
