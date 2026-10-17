/**
 * One local/CI verification entrypoint for HeySure Web.
 * Mirrors deploy/server/other/scripts/verify_server.py: guardrails first, then typecheck.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function run(label, command, args) {
  console.log(`\n== ${label} ==`)
  const result = spawnSync(command, args, {
    cwd: WEB_ROOT,
    stdio: 'inherit',
    shell: false,
  })
  return result.status ?? 1
}

function main() {
  const skipTypecheck = process.argv.includes('--skip-typecheck')
  const checks = [
    ['complexity guardrails', process.execPath, [join('scripts', 'check_guardrails.mjs')]],
    ['unit and security tests', process.execPath, [join('node_modules', 'vitest', 'vitest.mjs'), 'run']],
  ]
  if (!skipTypecheck) {
    const vueTsc = join('node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
    checks.push(['typecheck', process.execPath, [vueTsc, '-b', '--pretty', 'false']])
  }
  for (const [label, command, args] of checks) {
    const code = run(label, command, args)
    if (code) {
      console.log(`verification stopped at ${label} (exit ${code})`)
      return code
    }
  }
  console.log('\nweb verification passed')
  return 0
}

process.exit(main())
