/**
 * Default MCP tool allow-list. Used as the initial selection for a new AI
 * configuration and as the fallback when `task_payload.mcp_tools_override`
 * is empty.
 */
export const DEFAULT_MCP_TOOLS = [
  'mcp.describe+tool',
  'workspace.search',
  'workspace.run+command',
  'admin.manage',
  'device+mcp.manage',
  'task.manage',
  'todo.manage',
  'prompt.manage',
  'mode.manage',
  'knowledge.manage',
  'message.send+to',
  'conversation.manage',
] as const
