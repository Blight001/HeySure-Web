/**
 * 文本格式化工具：去除 AI 原始输出中的代码块、思考标签、内部状态标记，
 * 生成适合界面展示的预览文本。MemberActor 气泡和成员面板对话侧栏共用。
 */
export const speechPreview = (raw: string): string =>
  String(raw || '')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/<\/?think>/gi, '')
    .replace(/__HS_MCP_STATE__=.*$/s, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
