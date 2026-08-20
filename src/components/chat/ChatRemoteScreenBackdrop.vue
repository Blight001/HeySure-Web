<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRemoteControl } from '@/composables/useRemoteControl'

const props = defineProps<{
  deviceId: string
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const { remoteStream, start, stop } = useRemoteControl()

const attachStream = async () => {
  const video = videoRef.value
  if (!video) return
  video.srcObject = remoteStream.value
  if (remoteStream.value) await video.play().catch(() => {})
}

const startView = async (deviceId: string) => {
  stop()
  await nextTick()
  if (deviceId) start(deviceId, { qualityPreset: 'smooth' })
}

watch(remoteStream, () => { void attachStream() })
watch(() => props.deviceId, deviceId => { void startView(deviceId) })

onMounted(() => { void startView(props.deviceId) })
onBeforeUnmount(stop)
</script>

<template>
  <div v-show="remoteStream" class="chat-remote-screen" aria-hidden="true">
    <video
      ref="videoRef"
      class="chat-remote-screen-video"
      autoplay
      muted
      playsinline
      tabindex="-1"
    ></video>
  </div>
</template>

<style scoped>
.chat-remote-screen {
  pointer-events: none;
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 0.75rem;
}

.chat-remote-screen::after {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(90deg, rgb(250 250 250 / 0.96) 0%, rgb(250 250 250 / 0.7) 45%, rgb(250 250 250 / 0.18) 100%);
}

.chat-remote-screen-video {
  position: absolute;
  inset: 0 0 0 auto;
  width: min(72%, 720px);
  height: 100%;
  object-fit: contain;
  object-position: right center;
  opacity: 0.72;
  filter: saturate(0.9) contrast(0.92);
}

:global(.dark) .chat-remote-screen::after {
  background: linear-gradient(90deg, rgb(9 9 11 / 0.96) 0%, rgb(9 9 11 / 0.72) 45%, rgb(9 9 11 / 0.2) 100%);
}

@media (max-width: 639px) {
  .chat-remote-screen-video {
    width: 100%;
    opacity: 0.42;
  }

  .chat-remote-screen::after {
    background: rgb(250 250 250 / 0.48);
  }

  :global(.dark) .chat-remote-screen::after {
    background: rgb(9 9 11 / 0.52);
  }
}
</style>
