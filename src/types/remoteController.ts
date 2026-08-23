export type RemoteControllerKind = 'button' | 'dpad' | 'keypad' | 'slider' | 'joystick' | 'textInput'
export type RemoteControllerPhase = 'trigger' | 'start' | 'update' | 'end'
export type RemoteControllerAction =
  | { type: 'key'; key: string }
  | { type: 'browser'; action: 'back' | 'forward' | 'reload' }
  | { type: 'emit'; event: string }

export interface RemoteControllerControl {
  id: string
  kind: RemoteControllerKind
  label: string
  tone?: 'default' | 'primary' | 'danger'
  action: RemoteControllerAction
  min?: number
  max?: number
  step?: number
  deadZone?: number
  maxLength?: number
}

export interface RemoteControllerTemplate {
  schema: 'remote_controller_template.v1'
  id: string
  name: string
  revision: number
  builtin?: boolean
  deviceTypes: Array<'android' | 'desktop' | 'browser'>
  requiredCapabilities: string[]
  layout: { columns: number; gap: 'xs' | 'sm' | 'md' | 'lg' }
  controls: RemoteControllerControl[]
}

export interface RemoteControllerActionEnvelope {
  kind: 'controller-action'
  v: 1
  templateId: string
  controlId: string
  seq: number
  phase: RemoteControllerPhase
  event: string
  value?: null | number | string | { x: number; y: number }
  ts: number
}
