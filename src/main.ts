import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import { applyUiPreferencesToDocument, getInitialUiPreferences } from './utils/uiPreferences'

declare global {
  interface Window {
    __HEYSURE_STARTUP__?: { startedAt: number; update: (progress: number, detail: string) => void; stop: () => void }
  }
}

window.__HEYSURE_STARTUP__?.update(28, '网页脚本已下载，正在启动 Vue 应用')

const initialUiPreferences = getInitialUiPreferences()
applyUiPreferencesToDocument(initialUiPreferences.themeMode, initialUiPreferences.fontSize)

createApp(App).mount('#app')
window.__HEYSURE_STARTUP__?.update(42, 'Vue 应用已挂载，正在恢复登录状态')
