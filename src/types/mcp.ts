export interface McpStatusPayload {
  userId?: number
  aiConfigId?: number
  state?: string
  tool?: string
  updatedAt?: number
}

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: Record<string, any>
  destructive?: boolean
  minRole?: string
  mcpSource?: 'server' | 'desktop' | 'browser'
  zhLabel?: string
  zhDescription?: string
  zhTags?: string[]
}

export interface McpToolParamRow {
  name: string
  type: string
  required: boolean
  description: string
}
