/**
 * Default MCP tool allow-list. Used as the initial selection for a new AI
 * configuration and as the fallback when `task_payload.mcp_tools_override`
 * is empty.
 */
export const DEFAULT_MCP_TOOLS = [
  'mcp.describe+tool',
  'workspace.search',
  'workspace.run+command',
  'member.manage',
  'device+mcp.manage',
  'todo.manage',
  'knowledge.manage',
  'message.send+to',
  'conversation.manage',
] as const
