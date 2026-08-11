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

// ── 文档模型：解析出章（##）与子节（###），只用于左侧目录锚点定位。
//    阅读模式整篇全文连续渲染（不分页），目录点击负责滚动定位到对应内容块。 ──
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

// 整篇文档的连续内容块：按章/子节切块后全部平铺渲染（不再分页）。
// 每块带 (chapterIndex, subIndex) 供目录定位；subIndex = -1 表示章头 + 引言。
interface DocBlock { chapterIndex: number; subIndex: number; text: string }

const allBlocks = computed<DocBlock[]>(() => {
  const lines = docLines.value
  const out: DocBlock[] = []
  chapters.value.forEach((chapter, ci) => {
    if (!chapter.subs.length) {
      out.push({ chapterIndex: ci, subIndex: -1, text: lines.slice(chapter.start, chapter.end).join('\n') })
      return
    }
    const firstSubLine = chapter.subs[0].line
    if (firstSubLine > chapter.start) {
      out.push({ chapterIndex: ci, subIndex: -1, text: lines.slice(chapter.start, firstSubLine).join('\n') })
    }
    chapter.subs.forEach((sub, si) => {
      const end = si + 1 < chapter.subs.length ? chapter.subs[si + 1].line : chapter.end
      out.push({ chapterIndex: ci, subIndex: si, text: lines.slice(sub.line, end).join('\n') })
    })
  })
  return out
})

// 当前浏览位置：跟随滚动定位到的内容块下标（-1 = 尚未定位）
const activeBlockIndex = ref(-1)
const flashBlockIndex = ref(-1)

const activeBlock = computed(() =>
  activeBlockIndex.value >= 0 ? allBlocks.value[activeBlockIndex.value] : null,
)
const activeChapterIndex = computed(() => activeBlock.value?.chapterIndex ?? -1)
const activeSubIndex = computed(() => activeBlock.value?.subIndex ?? -1)

// 滚动时跟随更新左侧目录高亮
const onContentScroll = () => {
  const pane = contentPane.value
  if (!pane) return
  const offset = pane.scrollTop + 80
  let current = -1
  pane.querySelectorAll<HTMLElement>('[data-block-index]').forEach((el) => {
    const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top
    if (top <= offset) {
      current = Number(el.getAttribute('data-block-index'))
    }
  })
  if (current !== activeBlockIndex.value) activeBlockIndex.value = current
}

// 滚动定位到指定内容块，并短暂高亮提示
const scrollToBlock = (blockIndex: number, smooth = true) => {
  nextTick(() => {
    const pane = contentPane.value
    if (!pane) return
    const target = pane.querySelector(`[data-block-index="${blockIndex}"]`) as HTMLElement | null
    if (!target) { pane.scrollTo({ top: 0 }); return }
    const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 8
    pane.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
    flashBlockIndex.value = blockIndex
    setTimeout(() => { if (flashBlockIndex.value === blockIndex) flashBlockIndex.value = -1 }, 1200)
  })
}

// 目录点击：整篇连续文档，直接滚动到对应章 / 子节所在内容块
const selectChapter = (chapterIndex: number) => {
  const idx = allBlocks.value.findIndex(b => b.chapterIndex === chapterIndex)
  if (idx >= 0) scrollToBlock(idx)
}

const selectSub = (chapterIndex: number, subIndex: number) => {
  const idx = allBlocks.value.findIndex(b => b.chapterIndex === chapterIndex && b.subIndex === subIndex)
  if (idx >= 0) scrollToBlock(idx)
}

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

const mobileNavValue = computed(() => {
  const b = activeBlock.value
  if (b && b.subIndex >= 0) return `${b.chapterIndex}.${b.subIndex}`
  if (b) return String(b.chapterIndex)
  return '0'
})

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
    error.value = err?.message || '设备端开发文档加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (open) => {
  if (open) {
    editing.value = false
    activeBlockIndex.value = -1
    flashBlockIndex.value = -1
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
    error.value = err?.message || '设备端开发文档保存失败'
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
    activeBlockIndex.value = -1
    flashBlockIndex.value = -1
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
    <div v-if="show" class="fixed inset-0 z-[90] flex items-center justify-center modal-overlay p-3 sm:p-6" @click.self="emit('close')">
      <div class="flex h-full max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <!-- header -->
        <div class="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div class="flex min-w-0 items-center gap-2">
            <AppIcon name="book" class="h-5 w-5 shrink-0 text-indigo-500" />
            <h3 class="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">设备端开发文档</h3>
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

          <!-- 阅读模式：左目录（章 + 锚点子节，点击滚动定位）+ 右全文（整篇连续显示） -->
          <template v-else>
            <nav class="hidden w-56 shrink-0 overflow-y-auto border-r border-zinc-100 bg-zinc-50/40 py-2 custom-scrollbar sm:block dark:border-zinc-800 dark:bg-zinc-950/40">
              <template v-for="(chapter, ci) in chapters" :key="`c-${ci}`">
                <button
                  type="button"
                  class="block w-full truncate px-3 py-1.5 text-left text-xs font-medium transition-colors"
                  :class="ci === activeChapterIndex
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
                  :class="ci === activeChapterIndex && si === activeSubIndex
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

              <div ref="contentPane" class="min-h-0 flex-1 overflow-y-auto custom-scrollbar" @scroll.passive="onContentScroll">
                <div v-if="error" class="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {{ error }}
                </div>
                <!-- 整篇文档连续渲染：所有章节一次铺开，滚动阅读 -->
                <div class="doc-surface mx-2 my-2 rounded-2xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80 sm:mx-3 sm:p-6">
                  <div
                    v-for="(block, bi) in allBlocks"
                    :key="`b-${bi}`"
                    class="doc-block"
                    :class="{ 'doc-block-flash': bi === flashBlockIndex }"
                    :data-block-index="bi"
                  >
                    <MarkdownText :text="block.text" />
                  </div>
                </div>
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

/* 点击目录定位后的短暂高亮：内容太短滚动不了时也能看出已经切换 */
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
