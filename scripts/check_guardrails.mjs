/**
 * Progressive TypeScript / Vue complexity guardrail for HeySure Web.
 *
 * Same limits and baseline policy as deploy/server/other/scripts/check_guardrails.py:
 * existing debt is grandfathered; a run fails only when a violation is new or an
 * existing metric grows. --write-baseline is for reviewed reductions, never growth.
 */
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'guardrail_baseline.json')

const PRODUCTION_LIMITS = {
  file_lines: 500,
  function_lines: 80,
  complexity: 15,
  parameters: 8,
  nesting: 4,
  dependencies: 15,
}

const TEST_LIMITS = {
  file_lines: 800,
  function_lines: 120,
  complexity: 20,
  parameters: 8,
  nesting: 4,
  dependencies: 15,
}

const NESTING_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.SwitchStatement,
])

const BRANCH_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
])

function posixRel(path) {
  return relative(WEB_ROOT, path).split('\\').join('/')
}

function isTestPath(rel) {
  return /(^|\/)__tests__\//.test(rel) || /\.(spec|test)\.(ts|vue)$/.test(rel)
}

function walkSource(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walkSource(path, acc)
    else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) acc.push(path)
  }
  return acc
}

function extractTaggedBlocks(text, tag) {
  const blocks = []
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  let open
  while ((open = openRe.exec(text))) {
    const start = openRe.lastIndex
    const closeTag = `</${tag}>`
    const close = text.toLowerCase().indexOf(closeTag, start)
    if (close < 0) break
    blocks.push({ start, end: close, content: text.slice(start, close) })
    openRe.lastIndex = close + closeTag.length
  }
  return blocks
}

function padScriptSource(text) {
  const chars = Array.from(text, (ch) => (ch === '\n' || ch === '\r' ? ch : ' '))
  for (const block of extractTaggedBlocks(text, 'script')) {
    for (let i = block.start; i < block.end; i += 1) chars[i] = text[i]
  }
  return chars.join('')
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1
  }
  return line
}

function markupCodeLines(text, start, end, commentStart, commentEnd) {
  const lines = new Set()
  let inComment = false
  let line = lineOf(text, start)
  let i = start
  while (i < end) {
    if (!inComment && text.startsWith(commentStart, i)) {
      inComment = true
      i += commentStart.length
      continue
    }
    if (inComment && text.startsWith(commentEnd, i)) {
      inComment = false
      i += commentEnd.length
      continue
    }
    if (text[i] === '\n') {
      line += 1
      i += 1
      continue
    }
    if (!inComment && !/\s/.test(text[i])) {
      lines.add(line)
      while (i < end && text[i] !== '\n') i += 1
      continue
    }
    i += 1
  }
  return lines
}

function tsCodeLines(sourceText) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, sourceText)
  const lines = new Set()
  const skip = new Set([
    ts.SyntaxKind.SingleLineCommentTrivia,
    ts.SyntaxKind.MultiLineCommentTrivia,
    ts.SyntaxKind.NewLineTrivia,
    ts.SyntaxKind.WhitespaceTrivia,
    ts.SyntaxKind.ConflictMarkerTrivia,
  ])
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    if (skip.has(scanner.getToken())) continue
    const start = scanner.getTokenPos()
    const end = Math.max(scanner.getTextPos() - 1, start)
    const startLine = lineOf(sourceText, start)
    const endLine = lineOf(sourceText, end)
    for (let line = startLine; line <= endLine; line += 1) lines.add(line)
  }
  return lines
}

function fileCodeLines(path, text) {
  if (path.endsWith('.ts')) return tsCodeLines(text)
  const lines = tsCodeLines(padScriptSource(text))
  for (const block of extractTaggedBlocks(text, 'template')) {
    for (const line of markupCodeLines(text, block.start, block.end, '<!--', '-->')) lines.add(line)
  }
  for (const block of extractTaggedBlocks(text, 'style')) {
    for (const line of markupCodeLines(text, block.start, block.end, '/*', '*/')) lines.add(line)
  }
  return lines
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  )
}

function identifierName(node) {
  if (!node) return ''
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return ''
}

function declaredName(node) {
  const own = identifierName(node.name)
  if (own) return own
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  const parent = node.parent
  if (!parent) return ''
  if (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)
    || ts.isShorthandPropertyAssignment(parent) || ts.isParameter(parent)) {
    return identifierName(parent.name)
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return identifierName(parent.left)
  }
  return ''
}

function functionName(node, parents, sourceFile) {
  const name = declaredName(node)
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false)).line + 1
  const leaf = name || `<anonymous:${line}>`
  return parents.length ? `${parents.join('.')}.${leaf}` : leaf
}

function collectFunctions(sourceFile) {
  const found = []
  const visit = (node, parents) => {
    if (isFunctionLike(node)) {
      const name = functionName(node, parents, sourceFile)
      found.push({ node, name })
      ts.forEachChild(node, (child) => visit(child, [...parents, name.split('.').pop()]))
      return
    }
    const next = ts.isClassDeclaration(node) && node.name ? [...parents, node.name.text] : parents
    ts.forEachChild(node, (child) => visit(child, next))
  }
  visit(sourceFile, [])
  return found
}

function complexity(root) {
  let score = 1
  const visit = (node) => {
    if (BRANCH_KINDS.has(node.kind)) score += 1
    else if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken
        || op === ts.SyntaxKind.QuestionQuestionToken) score += 1
    } else if (ts.isSwitchStatement(node)) {
      score += Math.max(0, node.caseBlock.clauses.length - 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return score
}

function parameterCount(node) {
  return (node.parameters || []).filter((param) => identifierName(param.name) !== 'this').length
}

function nesting(root) {
  const visit = (node, depth) => {
    const next = NESTING_KINDS.has(node.kind) ? depth + 1 : depth
    let max = next
    ts.forEachChild(node, (child) => {
      max = Math.max(max, visit(child, next))
    })
    return max
  }
  return visit(root, 0)
}

function dependencies(sourceFile) {
  const modules = new Set()
  for (const stmt of sourceFile.statements) {
    if ((ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt))
      && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      modules.add(stmt.moduleSpecifier.text)
    }
  }
  return modules.size
}

function violation(metric, value, limit, path, symbol = '') {
  return {
    key: `${metric}:${path}${symbol ? `:${symbol}` : ''}`,
    metric,
    value,
    limit,
    path,
    symbol,
  }
}

function inspectFile(path, limits) {
  const rel = posixRel(path)
  const text = readFileSync(path, 'utf8')
  const codeLines = fileCodeLines(path, text)
  const scriptText = path.endsWith('.vue') ? padScriptSource(text) : text
  const sourceFile = ts.createSourceFile(rel, scriptText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found = []
  if (codeLines.size > limits.file_lines) {
    found.push(violation('file_lines', codeLines.size, limits.file_lines, rel))
  }
  const deps = dependencies(sourceFile)
  if (deps > limits.dependencies) {
    found.push(violation('dependencies', deps, limits.dependencies, rel))
  }
  for (const { node, name } of collectFunctions(sourceFile)) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false)).line + 1
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1
    let effective = 0
    for (const line of codeLines) {
      if (line >= start && line <= end) effective += 1
    }
    const metrics = {
      function_lines: [effective, limits.function_lines],
      complexity: [complexity(node), limits.complexity],
      parameters: [parameterCount(node), limits.parameters],
      nesting: [nesting(node), limits.nesting],
    }
    for (const [metric, [value, limit]] of Object.entries(metrics)) {
      if (value > limit) found.push(violation(metric, value, limit, rel, name))
    }
  }
  return found
}

function collect() {
  const files = []
  for (const root of ['src', join('game', 'src')]) {
    const abs = join(WEB_ROOT, root)
    if (existsSync(abs)) files.push(...walkSource(abs))
  }
  const violations = []
  for (const path of files.sort()) {
    const rel = posixRel(path)
    violations.push(...inspectFile(path, isTestPath(rel) ? TEST_LIMITS : PRODUCTION_LIMITS))
  }
  return violations.sort((a, b) => a.key.localeCompare(b.key))
}

function payload(violations) {
  const counts = {}
  for (const item of violations) counts[item.metric] = (counts[item.metric] || 0) + 1
  return {
    version: 1,
    limits: { production: PRODUCTION_LIMITS, tests: TEST_LIMITS },
    counts,
    violations: Object.fromEntries(violations.map((item) => [item.key, item.value])),
  }
}

function main(argv) {
  const writeBaseline = argv.includes('--write-baseline')
  const asJson = argv.includes('--json')
  const current = collect()
  const report = payload(current)
  if (writeBaseline) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`wrote ${posixRel(BASELINE_PATH)} with ${current.length} violations`)
    return 0
  }
  if (asJson) console.log(JSON.stringify(report, null, 2))
  if (!existsSync(BASELINE_PATH)) {
    console.error('guardrail baseline is missing; run with --write-baseline and review the result')
    return 2
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const old = baseline.violations || {}
  const regressions = current.filter((item) => !(item.key in old) || item.value > Number(old[item.key]))
  const log = asJson ? console.error : console.log
  if (regressions.length) {
    log('complexity guardrail regressions:')
    for (const item of regressions) {
      const symbol = item.symbol ? `::${item.symbol}` : ''
      log(`  ${item.path}${symbol} ${item.metric}=${item.value} (limit ${item.limit})`)
    }
    return 1
  }
  log(`guardrails passed: ${current.length} grandfathered violations; baseline cannot grow`)
  return 0
}

process.exit(main(process.argv.slice(2)))
