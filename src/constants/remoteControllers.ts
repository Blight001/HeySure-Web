import type { RemoteControllerPreset } from '@/types/remoteController'

export const REMOTE_CONTROLLER_PRESETS: RemoteControllerPreset[] = [
  {
    id: 'direction',
    label: '方向遥控器',
    modes: ['android', 'desktop', 'browser'],
    sections: [{
      kind: 'dpad',
      id: 'direction-pad',
      buttons: [
        { id: 'up', label: '↑', command: 'dpad.up' },
        { id: 'left', label: '←', command: 'dpad.left' },
        { id: 'ok', label: '确定', command: 'dpad.ok', tone: 'primary' },
        { id: 'right', label: '→', command: 'dpad.right' },
        { id: 'down', label: '↓', command: 'dpad.down' },
      ],
    }, {
      kind: 'grid',
      id: 'navigation',
      columns: 2,
      buttons: [
        { id: 'back', label: '返回', command: 'nav.back' },
        { id: 'home', label: '主页', command: 'nav.home' },
      ],
    }],
  },
  {
    id: 'media',
    label: '媒体',
    modes: ['android', 'desktop', 'browser'],
    sections: [{
      kind: 'grid',
      id: 'media-playback',
      columns: 3,
      buttons: [
        { id: 'previous', label: '上一首', command: 'media.previous' },
        { id: 'play', label: '播放/暂停', command: 'media.play_pause', tone: 'primary' },
        { id: 'next', label: '下一首', command: 'media.next' },
        { id: 'volume-down', label: '音量 −', command: 'media.volume_down' },
        { id: 'mute', label: '静音', command: 'media.mute' },
        { id: 'volume-up', label: '音量 ＋', command: 'media.volume_up' },
      ],
    }],
  },
  {
    id: 'presentation',
    label: '演示',
    modes: ['desktop', 'browser'],
    sections: [{
      kind: 'grid',
      id: 'presentation-control',
      columns: 2,
      buttons: [
        { id: 'previous', label: '上一页', command: 'presentation.previous' },
        { id: 'next', label: '下一页', command: 'presentation.next', tone: 'primary' },
        { id: 'start', label: '开始放映', command: 'presentation.start' },
        { id: 'exit', label: '退出放映', command: 'presentation.exit', tone: 'danger' },
      ],
    }],
  },
  {
    id: 'browser',
    label: '浏览器',
    modes: ['browser'],
    sections: [{
      kind: 'grid',
      id: 'browser-navigation',
      columns: 3,
      buttons: [
        { id: 'back', label: '后退', command: 'browser.back' },
        { id: 'reload', label: '刷新', command: 'browser.reload', tone: 'primary' },
        { id: 'forward', label: '前进', command: 'browser.forward' },
      ],
    }],
  },
]
