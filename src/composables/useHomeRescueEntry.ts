import { onBeforeUnmount, onMounted, ref } from 'vue'
import { checkHostRescue } from '@/api/hostRescue'

const OUTAGE_CONFIRM_MS = 2000
const NORMAL_CHECK_MS = 30000

export const useHomeRescueEntry = () => {
  const showAdminRescue = ref(false)
  let outageConfirmations = 0
  let timer: number | undefined
  let stopped = false

  const schedule = (delay: number) => {
    if (stopped) return
    timer = window.setTimeout(() => void check(), delay)
  }

  const check = async () => {
    try {
      const health = await checkHostRescue()
      outageConfirmations = health.all_runtimes_unavailable ? outageConfirmations + 1 : 0
    } catch {
      outageConfirmations = 0
    }
    showAdminRescue.value = outageConfirmations >= 2
    schedule(outageConfirmations === 1 ? OUTAGE_CONFIRM_MS : NORMAL_CHECK_MS)
  }

  onMounted(() => { void check() })
  onBeforeUnmount(() => {
    stopped = true
    if (timer !== undefined) window.clearTimeout(timer)
  })

  return { showAdminRescue }
}
