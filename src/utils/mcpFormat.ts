export const createMcpCallBlockPattern = () =>
  /<mcp[-_]call>\s*([\s\S]*?)\s*<\/\s*(?:mcp[-_]call|[｜|]*\s*DSML\s*[｜|]*\s*(?:invoke|tool[-_]?calls?))\s*>/gi

// Anthropic / DSML style: <...invoke name="tool">...</...invoke> (namespace prefixes allowed).
const createInvokeBlockPattern = () =>
  /<[^<>]*?\binvoke\b[^<>]*?\bname\s*=\s*["']?[^"'>\s]+["']?[^<>]*?>[\s\S]*?<\/[^<>]*?\binvoke\b[^<>]*?>/gi

// Hermes / Qwen style: <tool_call> {json} </tool_call> (plural <tool_calls> wrapper excluded).
const createToolCallBlockPattern = () =>
  /<[^<>]*?\btool[_-]?call\b[^<>]*?>[\s\S]*?<\/[^<>]*?\btool[_-]?call\b[^<>]*?>/gi

// Grok / xAI style: <xai:function_call name="tool">...</xai:function_call>.
// Removing the complete block here (not just its tags) keeps the partial-tail
// pattern from also swallowing legitimate prose after the block.
const createFunctionCallBlockPattern = () =>
  /<[^<>]*?\bfunction[_-]?call\b[^<>]*?\bname\s*=\s*["']?[^"'>\s]+["']?[^<>]*?>[\s\S]*?<\/[^<>]*?\bfunction[_-]?call\b[^<>]*?>/gi

// Leftover wrapper tags, e.g. <mcp:tool_calls> … </function_calls>.
const createWrapperTagPattern = () =>
  /<\/?[^<>]*?\b(?:tool[_-]?calls?|function[_-]?calls?)\b[^<>]*?>/gi

// A tool-call block that started but never closed (streaming tail).
const createPartialTailPattern = () =>
  /<[^<>]*?\b(?:mcp[-_]call|invoke|parameter|tool[_-]?calls?|function[_-]?calls?)\b[\s\S]*$/i

export const stripMcpCallBlocks = (raw?: string) => {
  return String(raw || '')
    .replace(createMcpCallBlockPattern(), '')
    .replace(createInvokeBlockPattern(), '')
    .replace(createToolCallBlockPattern(), '')
    .replace(createFunctionCallBlockPattern(), '')
    .replace(createWrapperTagPattern(), '')
    .replace(createPartialTailPattern(), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface McpToolBubbleSections {
  tool: string
  params: string
  result: string
  error: string
  command: McpCommandDetails | null
  copyText: string
}

export interface McpCommandDetails {
  command: string
  cwd: string
  timeoutSeconds: number | null
  success: boolean | null
  summary: string
  taskId: string
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
}

const MCP_TOOL_LINE_RE = /^工具[：:]\s*.+$/m
const MCP_STATUS_LINE_RE = /^状态[：:]\s*.+$/m
const MCP_NEXT_SECTION_RE = /\n(?:\[(?:参数|结果|错误)\]|结果[：:]|错误[：:])\s*(?:\n|$)/

const stripLeadingMcpMetaLines = (raw: string) => {
  let body = String(raw || '').trim()
  let error = ''
  let changed = true
  while (changed) {
    changed = false
    const lines = body.split('\n')
    if (!lines.length) break
    const first = lines[0].trim()
    if (MCP_TOOL_LINE_RE.test(first) || MCP_STATUS_LINE_RE.test(first)) {
      body = lines.slice(1).join('\n').trim()
      changed = true
      continue
    }
    const errMatch = first.match(/^错误[：:]\s*(.+)$/)
    if (errMatch) {
      error = errMatch[1].trim()
      body = lines.slice(1).join('\n').trim()
      changed = true
    }
  }
  return { body, error }
}

const sliceUntilNextSection = (content: string) => {
  const nextIdx = content.search(MCP_NEXT_SECTION_RE)
  return (nextIdx >= 0 ? content.slice(0, nextIdx) : content).trim()
}

const extractBracketSection = (body: string, label: '参数' | '结果' | '错误') => {
  const marker = `[${label}]`
  const start = body.indexOf(marker)
  if (start < 0) return ''
  const content = body.slice(start + marker.length).replace(/^\s*\n?/, '')
  return sliceUntilNextSection(content)
}

const extractResultSection = (body: string) => {
  const bracketed = extractBracketSection(body, '结果')
  if (bracketed) return bracketed
  const legacyMarkers = ['结果：', '结果:'] as const
  for (const marker of legacyMarkers) {
    const start = body.indexOf(marker)
    if (start < 0) continue
    const content = body.slice(start + marker.length).replace(/^\s*\n?/, '')
    return sliceUntilNextSection(content)
  }
  return ''
}

const extractErrorSection = (body: string) => {
  const fromBracket = extractBracketSection(body, '错误')
  if (fromBracket) return fromBracket
  const markers = ['错误：', '错误:'] as const
  for (const marker of markers) {
    const start = body.indexOf(marker)
    if (start < 0) continue
    const content = body.slice(start + marker.length).replace(/^\s*\n?/, '')
    return sliceUntilNextSection(content)
  }
  return ''
}

const buildMcpCopyText = (sections: Pick<McpToolBubbleSections, 'params' | 'result' | 'error'>) => {
  const copyParts: string[] = []
  if (sections.params) copyParts.push(`[参数]\n${sections.params}`)
  if (sections.result) copyParts.push(`[结果]\n${sections.result}`)
  if (sections.error) copyParts.push(`[错误]\n${sections.error}`)
  return copyParts.join('\n')
}

const jsonObject = (raw: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const textValue = (value: unknown) => typeof value === 'string' ? value : ''

const numberValue = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const parseCommandDetails = (params: string, result: string): McpCommandDetails | null => {
  const args = jsonObject(params)
  const command = textValue(args?.command).trim()
  if (!command) return null

  const envelope = jsonObject(result)
  const nested = envelope?.result && typeof envelope.result === 'object' && !Array.isArray(envelope.result)
    ? envelope.result as Record<string, unknown>
    : null
  const payload = nested || envelope
  const explicitSuccess = typeof envelope?.success === 'boolean' ? envelope.success : null
  const exitCode = numberValue(payload?.exit_code)

  return {
    command,
    cwd: textValue(args?.cwd) || textValue(payload?.cwd),
    timeoutSeconds: numberValue(args?.timeout_seconds),
    success: explicitSuccess ?? (exitCode === null ? null : exitCode === 0),
    summary: textValue(envelope?.summary),
    taskId: textValue(envelope?.taskId),
    exitCode,
    timedOut: payload?.timed_out === true,
    stdout: textValue(payload?.stdout) || textValue(payload?.output),
    stderr: textValue(payload?.stderr),
  }
}

const prettyJson = (raw: string) => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export const parseMcpToolBubbleDetails = (raw?: string, fallbackTool = ''): McpToolBubbleSections => {
  const normalized = String(raw || '')
    .replace(/^\[MCP工具\]\s*/i, '')
    .replace(/\n*\[截图\]\s*\n\s*\S+\s*$/s, '')
    .trim()

  const tool = String(normalized.match(/^工具[：:]\s*(.+)$/m)?.[1] || fallbackTool).trim()

  let body = normalized
    .replace(/^工具[：:][^\n]*\n?/m, '')
    .replace(/^状态[：:][^\n]*\n?/m, '')
    .trim()

  let params = extractBracketSection(body, '参数')
  let result = extractResultSection(body)
  let error = extractErrorSection(body)

  if (!params && !result && !error && body) {
    const stripped = stripLeadingMcpMetaLines(body)
    result = stripped.body
    error = stripped.error
  } else if (result) {
    const stripped = stripLeadingMcpMetaLines(result)
    result = stripped.body
    if (!error && stripped.error) error = stripped.error
  }

  const command = parseCommandDetails(params, result)
  // Tool payloads sometimes arrive with escaped line breaks. Display them as
  // actual lines inside the preformatted detail panel instead of showing `\n`.
  const restoreEscapedLineBreaks = (value: string) => value.replace(/\\n/g, '\n')
  params = restoreEscapedLineBreaks(prettyJson(params))
  result = restoreEscapedLineBreaks(prettyJson(result))
  error = restoreEscapedLineBreaks(error)

  const sections = { tool, params, result, error, command }
  return {
    ...sections,
    copyText: buildMcpCopyText(sections) || body,
  }
}
