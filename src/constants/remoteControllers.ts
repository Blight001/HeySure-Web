import type { RemoteControllerAction, RemoteControllerControl, RemoteControllerTemplate } from '@/types/remoteController'

const button = (id: string, label: string, action: RemoteControllerAction, tone: RemoteControllerControl['tone'] = 'default'): RemoteControllerControl =>
  ({ id, kind: 'button', label, action, tone })
const armSlider = (joint: number): RemoteControllerControl => ({
  id: `joint${joint}`,
  kind: 'slider',
  label: `关节 ${joint}`,
  tone: 'default',
  action: { type: 'emit', event: `jibotarm.joint${joint}.position_p` },
  min: 500,
  max: 2500,
  step: 1,
})

export const BUILTIN_REMOTE_CONTROLLER_TEMPLATES: RemoteControllerTemplate[] = [
  {
    schema: 'remote_controller_template.v1', id: 'direction', name: '方向遥控器', revision: 1,
    builtin: true, deviceTypes: ['desktop', 'android', 'browser'], requiredCapabilities: ['remote_control'],
    layout: { columns: 3, gap: 'sm' },
    controls: [
      button('up', '上', { type: 'key', key: 'ArrowUp' }), button('left', '左', { type: 'key', key: 'ArrowLeft' }),
      button('ok', '确定', { type: 'key', key: 'Enter' }), button('right', '右', { type: 'key', key: 'ArrowRight' }),
      button('down', '下', { type: 'key', key: 'ArrowDown' }), button('back', '返回', { type: 'key', key: 'Escape' }),
    ],
  },
  {
    schema: 'remote_controller_template.v1', id: 'media', name: '媒体遥控器', revision: 1,
    builtin: true, deviceTypes: ['desktop', 'android'], requiredCapabilities: ['remote_control'],
    layout: { columns: 3, gap: 'sm' },
    controls: [
      button('previous', '上一首', { type: 'key', key: 'MediaTrackPrevious' }),
      button('play-pause', '播放/暂停', { type: 'key', key: 'MediaPlayPause' }),
      button('next', '下一首', { type: 'key', key: 'MediaTrackNext' }),
      button('volume-down', '音量-', { type: 'key', key: 'AudioVolumeDown' }),
      button('mute', '静音', { type: 'key', key: 'AudioVolumeMute' }),
      button('volume-up', '音量+', { type: 'key', key: 'AudioVolumeUp' }),
    ],
  },
  {
    schema: 'remote_controller_template.v1', id: 'presentation', name: '演示遥控器', revision: 1,
    builtin: true, deviceTypes: ['desktop'], requiredCapabilities: ['remote_control'],
    layout: { columns: 3, gap: 'sm' },
    controls: [
      button('previous', '上一页', { type: 'key', key: 'PageUp' }), button('next', '下一页', { type: 'key', key: 'PageDown' }),
      button('start', '开始', { type: 'key', key: 'F5' }), button('exit', '退出', { type: 'key', key: 'Escape' }),
    ],
  },
  {
    schema: 'remote_controller_template.v1', id: 'browser', name: '浏览器遥控器', revision: 1,
    builtin: true, deviceTypes: ['browser'], requiredCapabilities: ['remote_control'],
    layout: { columns: 3, gap: 'sm' },
    controls: [
      button('back', '后退', { type: 'browser', action: 'back' }), button('reload', '刷新', { type: 'browser', action: 'reload' }, 'primary'),
      button('forward', '前进', { type: 'browser', action: 'forward' }),
    ],
  },
  {
    schema: 'remote_controller_template.v1', id: 'jibotarm', name: 'AI Mechanical Arm', revision: 1,
    builtin: true, deviceTypes: ['custom'], requiredCapabilities: ['remote_control', 'remote_controller_templates'],
    layout: { columns: 2, gap: 'md' },
    controls: Array.from({ length: 6 }, (_, index) => armSlider(index + 1)),
  },
]
