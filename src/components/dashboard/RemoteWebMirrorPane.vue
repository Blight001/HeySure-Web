<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteWebMirror, type RwmTransport } from '@/composables/useRemoteWebMirror'

const props = defineProps<{ transport: RwmTransport }>()
const emit = defineEmits<{ (e: 'fallback', reason: string): void }>()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const { phase, errorMessage, actionMessage, attachDocument, start, stop } = useRemoteWebMirror(props.transport)
const shell = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob:; media-src blob:; font-src blob:; style-src \'unsafe-inline\'; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><style>html,body{margin:0;min-height:100%;background:#fff;color:#111}*{box-sizing:border-box}</style></head><body></body></html>'

const onFrameLoad = () => {
  const document = iframeRef.value?.contentDocument
  if (document) attachDocument(document)
}
watch(phase, value => {
  if (value === 'fallback') emit('fallback', errorMessage.value)
})

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <section class="relative flex min-h-0 flex-1 bg-white">
    <iframe ref="iframeRef" title="网页原生镜像" sandbox="allow-same-origin" :srcdoc="shell" class="h-full w-full border-0" @load="onFrameLoad"></iframe>
    <div v-if="phase !== 'ready'" class="absolute inset-0 grid place-items-center bg-zinc-950/90 p-6 text-center text-sm text-zinc-300">
      <div>
        <div v-if="phase !== 'fallback'" class="mx-auto mb-3 h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"></div>
        <p>{{ errorMessage || '正在协商网页原生镜像并接收安全快照…' }}</p>
      </div>
    </div>
    <div v-if="actionMessage" class="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-rose-600/90 px-3 py-1 text-xs text-white">{{ actionMessage }}</div>
  </section>
</template>
