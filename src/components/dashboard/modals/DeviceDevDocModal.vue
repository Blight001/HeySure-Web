<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import MarkdownText from '@/components/chat/MarkdownText.vue'
import { getDeviceDevManual, saveDeviceDevManual } from '@/api/devices'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const content = ref('')
const draft = ref('')
const isCustom = ref(false)
const error = ref('')
const copied = ref(false)
const contentPane = ref<HTMLElement | null>(null)

// ── 目录模型：章（##）是"页"，一页渲染该章 + 其全部 ### 子节；
//    子标题只是章内锚点，点击滚动定位，不单独成页（避免内容重复）。 ──────
interface DocSub { title: string; line: number }
interface DocChapter { title: string; start: number; end: number; subs: DocSub[] }

const docLines = computed(() => content.value.replace(/\r\n?/g, '\n').split('\n'))

const chapters = computed<DocChapter[]>(() => {
  const lines = docLines.value
  const heads: { level: number; title: string; line: number }[] = []
  let inFence = false
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^(```|~~~)/.test(trimmed)) { inFence = !inFence; return }
    if (inFence) return
    const m = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (m) heads.push({ level: m[1].length, title: m[2].trim(), line: i })
  })

  const h2s = heads.filter(h => h.level === 2)
  const out: DocChapter[] = []
  // 首个 ## 之前的内容（文档标题 + 引言）作为"开篇"
  const firstH2Line = h2s.length ? h2s[0].line : lines.length
  if (firstH2Line > 0) {
    const docTitle = heads.find(h => h.level === 1)?.title || '开篇'
    out.push({ title: docTitle, start: 0, end: firstH2Line, subs: [] })
  }
  h2s.forEach((head, idx) => {
    const end = idx + 1 < h2s.length ? h2s[idx + 1].line : lines.length
    const subs = heads
      .filter(h => h.level === 3 && h.line > head.line && h.line < end)
      .map(h => ({ title: h.title, line: h.line }))
    out.push({ title: head.title, start: head.line, end, subs })
  })
  if (!out.length && lines.length) {
    out.push({ title: '文档', start: 0, end: lines.length, subs: [] })
  }
  return out
})

const selectedIndex = ref(0)     // 当前章
const activeSubIndex = ref(-1)   // 当前章内高亮的子节，-1 = 无
const flashSubIndex = ref(-1)    // 刚定位到的子节（短暂高亮，短内容滚不动时也有反馈）

const currentChapter = computed(() => chapters.value[selectedIndex.value] || null)

// 章内容按子节切块渲染：每块自带 data-sub-index，点子标题直接滚到对应块。
// 不依赖"数正文里第 N 个标题节点"——文档里出现 #### 或其它写法也不会错位。
interface DocBlock { subIndex: number; text: string }  // -1 = 章头 + 引言

const currentBlocks = computed<DocBlock[]>(() => {
  const chapter = currentChapter.value
  if (!chapter) return []
  const lines = docLines.value
  if (!chapter.subs.length) {
    return [{ subIndex: -1, text: lines.slice(chapter.start, chapter.end).join('\n') }]
  }
  const blocks: DocBlock[] = []
  const firstSubLine = chapter.subs[0].line
  if (firstSubLine > chapter.start) {
    blocks.push({ subIndex: -1, text: lines.slice(chapter.start, firstSubLine).join('\n') })
  }
  chapter.subs.forEach((sub, si) => {
    const end = si + 1 < chapter.subs.length ? chapter.subs[si + 1].line : chapter.end
    blocks.push({ subIndex: si, text: lines.slice(sub.line, end).join('\n') })
  })
  return blocks
})

// 章节数量变化（编辑/恢复默认后）时保护选中索引
watch(chapters, (list) => {
  if (selectedIndex.value >= list.length) {
    selectedIndex.value = 0
    activeSubIndex.value = -1
  }
})

const selectChapter = (index: number) => {
  selectedIndex.value = Math.max(0, Math.min(index, chapters.value.length - 1))
  activeSubIndex.value = -1
  flashSubIndex.value = -1
  nextTick(() => { contentPane.value?.scrollTo({ top: 0 }) })
}

// 点子标题：切到所属章（如需要），然后滚动定位到该子节所在的内容块。
const selectSub = (chapterIndex: number, subIndex: number) => {
  const changedChapter = selectedIndex.value !== chapterIndex
  selectedIndex.value = chapterIndex
  activeSubIndex.value = subIndex
  nextTick(() => {
    const pane = contentPane.value
    if (!pane) return
    const target = pane.querySelector(`[data-sub-index="${subIndex}"]`) as HTMLElement | null
    if (!target) { pane.scrollTo({ top: 0 }); return }
    const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 8
    pane.scrollTo({ top: Math.max(0, top), behavior: changedChapter ? 'auto' : 'smooth' })
    flashSubIndex.value = subIndex
    setTimeout(() => { if (flashSubIndex.value === subIndex) flashSubIndex.value = -1 }, 1200)
  })
}

const hasPrev = computed(() => selectedIndex.value > 0)
const hasNext = computed(() => selectedIndex.value < chapters.value.length - 1)

// 移动端下拉用的扁平目录（章 + 子节，子节值编码为 "章.节"）
const navOptions = computed(() => {
  const out: { value: string; label: string }[] = []
  chapters.value.forEach((chapter, ci) => {
    out.push({ value: String(ci), label: chapter.title })
    chapter.subs.forEach((sub, si) => {
      out.push({ value: `${ci}.${si}`, label: `　${sub.title}` })
    })
  })
  return out
})

const mobileNavValue = computed(() =>
  activeSubIndex.value >= 0 ? `${selectedIndex.value}.${activeSubIndex.value}` : String(selectedIndex.value),
)

const onMobileNav = (raw: string) => {
  const [ci, si] = raw.split('.')
  if (si === undefined) selectChapter(Number(ci))
  else selectSub(Number(ci), Number(si))
}

// ── 数据加载 / 编辑 ────────────────────────────────────────────────────
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await getDeviceDevManual()
    content.value = data?.content || ''
    isCustom.value = !!data?.isCustom
  } catch (err: any) {
    error.value = err?.message || '设备开发文档加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (open) => {
  if (open) {
    editing.value = false
    selectedIndex.value = 0
    activeSubIndex.value = -1
    load()
  }
})

const startEdit = () => {
  draft.value = content.value
  editing.value = true
}

const save = async () => {
  saving.value = true
  error.value = ''
  try {
    const data = await saveDeviceDevManual(draft.value)
    content.value = data?.content || ''
    isCustom.value = !!data?.isCustom
    editing.value = false
  } catch (err: any) {
    error.value = err?.message || '设备开发文档保存失败'
  } finally {
    saving.value = false
  }
}

// 保存空内容 = 服务端删除自定义版本并返回打包默认文档
const resetToDefault = async () => {
  saving.value = true
  error.value = ''
  try {
    const data = await saveDeviceDevManual('')
    content.value = data?.content || ''
    isCustom.value = !!data?.isCustom
    editing.value = false
    selectedIndex.value = 0
    activeSubIndex.value = -1
  } catch (err: any) {
    error.value = err?.message || '恢复默认失败'
  } finally {
    saving.value = false
  }
}

// ── 复制整份文档（Markdown 原文） ──────────────────────────────────────
const copyDoc = async () => {
  const text = content.value
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非安全上下文（http 直连 IP）没有 clipboard API，退回隐藏 textarea 方案
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try { document.execCommand('copy') } finally { document.body.removeChild(area) }
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3 sm:p-6" @click.self="emit('close')">
      <div class="flex h-full max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <!-- header -->
        <div class="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div class="flex min-w-0 items-center gap-2">
            <AppIcon name="book" class="h-5 w-5 shrink-0 text-indigo-500" />
            <h3 class="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">设备开发文档</h3>
            <span v-if="isCustom" class="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">已自定义</span>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <button
              v-if="!editing"
              type="button"
              class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              :disabled="loading || !content"
              @click="copyDoc"
            >
              <AppIcon :name="copied ? 'check' : 'file'" class="mr-1 inline h-3.5 w-3.5" />{{ copied ? '已复制' : '复制文档' }}
            </button>
            <template v-if="!editing">
              <button
                type="button"
                class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                :disabled="loading"
                @click="startEdit"
              >
                <AppIcon name="pen" class="mr-1 inline h-3.5 w-3.5" />编辑
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                :disabled="saving"
                @click="editing = false"
              >
                取消
              </button>
              <button
                v-if="isCustom"
                type="button"
                class="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                :disabled="saving"
                @click="resetToDefault"
              >
                恢复默认
              </button>
              <button
                type="button"
                class="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                :disabled="saving"
                @click="save"
              >
                {{ saving ? '保存中…' : '保存' }}
              </button>
            </template>
            <button
              type="button"
              class="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              @click="emit('close')"
            >
              <AppIcon name="close" class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- body -->
        <div class="flex min-h-0 flex-1">
          <div v-if="loading" class="flex-1 py-16 text-center text-xs text-zinc-400 dark:text-zinc-500">加载中…</div>

          <!-- 编辑模式：全宽 Markdown 源码 -->
          <textarea
            v-else-if="editing"
            v-model="draft"
            spellcheck="false"
            class="block h-full w-full flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-zinc-700 outline-none dark:text-zinc-200"
          ></textarea>

          <!-- 阅读模式：左目录（章 + 锚点子节） + 右内容（一次一章） -->
          <template v-else>
            <nav class="hidden w-56 shrink-0 overflow-y-auto border-r border-zinc-100 bg-zinc-50/40 py-2 custom-scrollbar sm:block dark:border-zinc-800 dark:bg-zinc-950/40">
              <template v-for="(chapter, ci) in chapters" :key="`c-${ci}`">
                <button
                  type="button"
                  class="block w-full truncate px-3 py-1.5 text-left text-xs font-medium transition-colors"
                  :class="ci === selectedIndex
                    ? 'border-r-2 border-indigo-500 bg-indigo-50/70 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'"
                  :title="chapter.title"
                  @click="selectChapter(ci)"
                >
                  {{ chapter.title }}
                </button>
                <button
                  v-for="(sub, si) in chapter.subs"
                  :key="`s-${ci}-${si}`"
                  type="button"
                  class="block w-full truncate py-1 pl-7 pr-3 text-left text-[11px] transition-colors"
                  :class="ci === selectedIndex && si === activeSubIndex
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'"
                  :title="sub.title"
                  @click="selectSub(ci, si)"
                >
                  {{ sub.title }}
                </button>
              </template>
            </nav>

            <div class="flex min-w-0 flex-1 flex-col">
              <!-- 小屏没有侧栏：用下拉选择章节/子节 -->
              <div class="shrink-0 border-b border-zinc-100 p-2 sm:hidden dark:border-zinc-800">
                <select
                  class="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  :value="mobileNavValue"
                  @change="onMobileNav(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in navOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div ref="contentPane" class="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                <div v-if="error" class="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {{ error }}
                </div>
                <!-- Modern documentation surface: background, spacing, rounded card look -->
                <div class="doc-surface mx-2 my-2 rounded-2xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 sm:mx-3 sm:p-6">
                  <div
                    v-for="block in currentBlocks"
                    :key="`${selectedIndex}-${block.subIndex}`"
                    class="doc-block"
                    :class="{ 'doc-block-flash': block.subIndex >= 0 && block.subIndex === flashSubIndex }"
                    :data-sub-index="block.subIndex >= 0 ? block.subIndex : undefined"
                  >
                    <MarkdownText :text="block.text" />
                  </div>
                </div>
              </div>

              <!-- 上一章 / 下一章 -->
              <div class="flex shrink-0 items-center justify-between border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-indigo-600 disabled:opacity-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                  :disabled="!hasPrev"
                  @click="selectChapter(selectedIndex - 1)"
                >
                  ← {{ hasPrev ? chapters[selectedIndex - 1]?.title : '' }}
                </button>
                <span class="text-[10px] text-zinc-300 dark:text-zinc-600">{{ selectedIndex + 1 }} / {{ chapters.length }}</span>
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-indigo-600 disabled:opacity-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-indigo-300"
                  :disabled="!hasNext"
                  @click="selectChapter(selectedIndex + 1)"
                >
                  {{ hasNext ? chapters[selectedIndex + 1]?.title : '' }} →
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Modern doc surface container - provides background, breathing room, card-like polish */
.doc-surface {
  /* extra visual separation and nice surface for the markdown content */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.dark .doc-surface {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

/* Spacing between chapter blocks inside the doc */
.doc-block + .doc-block {
  margin-top: 1.25rem;
  padding-top: 0.9rem;
  border-top: 1px solid rgba(228, 228, 231, 0.6);
}

.dark .doc-block + .doc-block {
  border-top-color: rgba(63, 63, 70, 0.5);
}

/* 点击子标题定位后的短暂高亮：内容太短滚动不了时也能看出已经切换 */
.doc-block-flash {
  animation: docBlockFlash 1.2s ease-out;
  border-radius: 0.5rem;
}

@keyframes docBlockFlash {
  0% { background-color: rgba(99, 102, 241, 0.14); }
  100% { background-color: transparent; }
}

/* Slight boost inside the doc surface for the markdown renderer */
.doc-surface :deep(.markdown-text) {
  font-size: 0.95em;
}

/* Make sure first heading in a block doesn't have excessive top margin */
.doc-surface :deep(.markdown-text > h1:first-child),
.doc-surface :deep(.markdown-text > h2:first-child),
.doc-surface :deep(.markdown-text > .md-heading:first-child) {
  margin-top: 0.1rem;
}
</style>
