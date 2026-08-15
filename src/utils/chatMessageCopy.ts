import { ref, type Ref } from 'vue'
import { copyTextToClipboard } from '@/utils/clipboard'

export const copyChatText = async (text: string, event?: Event) => {
  const value = String(text || '')
  if (!value) return false
  const contextEl = (event?.currentTarget || event?.target) as Element | null
  if (!(await copyTextToClipboard(value, contextEl))) {
    console.warn('copy failed')
    return false
  }
  return true
}

export const useCopiedTarget = () => {
  const copiedTarget = ref('')
  const markCopied = (target: string) => {
    copiedTarget.value = target
    window.setTimeout(() => {
      if (copiedTarget.value === target) copiedTarget.value = ''
    }, 1200)
  }
  const copyTarget = async (text: string, target: string, event?: Event) => {
    if (await copyChatText(text, event)) markCopied(target)
  }
  return { copiedTarget, copyTarget }
}

export type CopiedTargetRef = Ref<string>
