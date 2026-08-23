export type RemoteControllerCommand =
  | 'dpad.up' | 'dpad.down' | 'dpad.left' | 'dpad.right' | 'dpad.ok'
  | 'nav.back' | 'nav.home'
  | 'media.play_pause' | 'media.previous' | 'media.next'
  | 'media.volume_down' | 'media.volume_up' | 'media.mute'
  | 'presentation.previous' | 'presentation.next' | 'presentation.start' | 'presentation.exit'
  | 'browser.back' | 'browser.forward' | 'browser.reload'

export interface RemoteControllerButton {
  id: string
  label: string
  command: RemoteControllerCommand
  tone?: 'default' | 'primary' | 'danger'
}

export type RemoteControllerSection =
  | { kind: 'dpad'; id: string; buttons: RemoteControllerButton[] }
  | { kind: 'grid'; id: string; columns: 2 | 3; buttons: RemoteControllerButton[] }

export interface RemoteControllerPreset {
  id: 'direction' | 'media' | 'presentation' | 'browser'
  label: string
  modes: Array<'android' | 'desktop' | 'browser'>
  sections: RemoteControllerSection[]
}
