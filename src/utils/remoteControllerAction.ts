import type { RcBrowserCommand, RcInput, RcMode } from '@/composables/useRemoteControl'
import type { RemoteControllerCommand } from '@/types/remoteController'

const DESKTOP_KEYS: Partial<Record<RemoteControllerCommand, string>> = {
  'dpad.up': 'ArrowUp',
  'dpad.down': 'ArrowDown',
  'dpad.left': 'ArrowLeft',
  'dpad.right': 'ArrowRight',
  'dpad.ok': 'Enter',
  'nav.back': 'Escape',
  'nav.home': 'Home',
  'media.play_pause': 'MediaPlayPause',
  'media.previous': 'MediaTrackPrevious',
  'media.next': 'MediaTrackNext',
  'media.volume_down': 'AudioVolumeDown',
  'media.volume_up': 'AudioVolumeUp',
  'media.mute': 'AudioVolumeMute',
  'presentation.previous': 'PageUp',
  'presentation.next': 'PageDown',
  'presentation.start': 'F5',
  'presentation.exit': 'Escape',
}

const ANDROID_KEYS: Partial<Record<RemoteControllerCommand, string>> = {
  ...DESKTOP_KEYS,
  'dpad.up': 'dpad_up',
  'dpad.down': 'dpad_down',
  'dpad.left': 'dpad_left',
  'dpad.right': 'dpad_right',
  'dpad.ok': 'dpad_center',
  'nav.back': 'back',
  'nav.home': 'home',
  'media.play_pause': 'media_play_pause',
  'media.previous': 'media_previous',
  'media.next': 'media_next',
  'media.volume_down': 'volume_down',
  'media.volume_up': 'volume_up',
  'media.mute': 'volume_mute',
}

const browserCommand = (command: RemoteControllerCommand): RcBrowserCommand | null => {
  if (command === 'browser.back') return { action: 'back' }
  if (command === 'browser.forward') return { action: 'forward' }
  if (command === 'browser.reload') return { action: 'reload' }
  return null
}

export const dispatchRemoteControllerAction = (
  command: RemoteControllerCommand,
  mode: RcMode,
  sendInput: (input: RcInput) => void,
  sendBrowserCommand: (command: RcBrowserCommand) => void,
) => {
  const browser = browserCommand(command)
  if (browser) {
    sendBrowserCommand(browser)
    return
  }
  const key = (mode === 'android' ? ANDROID_KEYS : DESKTOP_KEYS)[command]
  if (!key) return
  sendInput({ type: 'key', key, action: mode === 'android' ? undefined : 'tap' })
}
