/**
 * 复制文本到剪贴板，兼容聊天面板被移入 Document PiP（桌面置顶小窗）的场景。
 *
 * navigator.clipboard.writeText 要求"调用方文档处于聚焦状态"：面板在 PiP
 * 小窗里时用户聚焦的是 PiP 文档，主文档的 clipboard 会以 NotAllowedError
 * 拒绝写入。因此从触发元素反查它实际所在的 document/window，用那个窗口的
 * clipboard 写入；非安全上下文（http 直连 IP）没有 clipboard API，或写入
 * 失败时，退回该文档内的隐藏 textarea + execCommand 方案。
 *
 * @param text 要复制的文本
 * @param contextEl 触发复制的元素（用于定位真实所在窗口），缺省用主文档
 * @returns 是否复制成功
 */
export async function copyTextToClipboard(text: string, contextEl?: Element | null): Promise<boolean> {
  const value = String(text ?? '')
  if (!value) return false
  const doc = contextEl?.ownerDocument || document
  const win = doc.defaultView || window
  try {
    if (win.navigator?.clipboard?.writeText) {
      await win.navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // 文档未聚焦等原因写入失败，退回 execCommand
  }
  try {
    const textarea = doc.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    doc.body.appendChild(textarea)
    textarea.select()
    const ok = doc.execCommand('copy')
    doc.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
