/**
 * Live-refresh cadence for the GodDashboard background poll.
 *
 * The interval is selected dynamically based on what the user is currently looking
 * at: rapid polling while an AI is streaming thinking output, slower polling when
 * the tab is hidden or socket is connected (since socket events also drive updates).
 */
export const DASHBOARD_REFRESH_STREAM_MS = 600
// 触屏/紧凑布局中避免高频数据替换与卡片重排挤占滚动主线程。
export const DASHBOARD_REFRESH_MOBILE_STREAM_MS = 1200
export const DASHBOARD_REFRESH_FAST_MS = 2000
export const DASHBOARD_REFRESH_NORMAL_MS = 8000
export const DASHBOARD_REFRESH_HIDDEN_MS = 30000

/** Project id reserved for AIs not yet bound to a real project. */
export const UNASSIGNED_PROJECT_ID = 'unassigned'

/** Token budget defaults applied when the backend does not return one. */
export const TOKEN_LIMIT_DEFAULTS = {
  admin: 50000,
  worker: 10000,
} as const
