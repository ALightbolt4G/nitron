// Runs the generated runtime script in Node against a fake native bridge.
// Usage: node runtime-script.test.mjs <script.js>
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const script = readFileSync(process.argv[2], 'utf-8')
let passed = 0, failed = 0
const check = (cond, name) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`) }
const tick = () => new Promise(r => setTimeout(r, 5))

const nativeCalls = []
const bridgeCalls = []
let bridgeMode = 'ok'

const window = {}
window.Nitron = {
  showNotification: (t, m) => { nativeCalls.push(['notify', t, m]); return 'native-return' },
  requestCameraPermission: () => nativeCalls.push(['camera']),
}
window.__NitronPlugins = {
  invoke(plugin, method, argsJson, id) {
    bridgeCalls.push({ plugin, method, args: JSON.parse(argsJson), id })
    if (bridgeMode === 'throw') throw new Error('bridge down')
    setTimeout(() => {
      if (bridgeMode === 'ok') window.__nitronResolve(id, true, JSON.stringify({ echoed: JSON.parse(argsJson) }))
      else if (bridgeMode === 'reject') window.__nitronResolve(id, false, JSON.stringify({ code: 'PLUGIN_ERROR', message: 'boom' }))
      else if (bridgeMode === 'raw') window.__nitronResolve(id, true, 'not json')
    }, 0)
  },
}

const ctx = vm.createContext({ window, console, Promise, setTimeout, Math, JSON, Error })
vm.runInContext(script, ctx)

console.log('runtime script')
const N = window.Nitron

check(typeof N.plugins.Echo.echo === 'function' && typeof N.plugins.Echo.boom === 'function', 'plugin methods exist')
check(typeof N.plugins.Battery.getStatus === 'function', 'second plugin exists')
check(N.plugins.Echo.nothing === undefined, 'unknown method does not exist')

check(N.showNotification('T', 'M') === 'native-return' && nativeCalls[0][1] === 'T', 'built-in showNotification still forwards to native')
N.requestCameraPermission()
check(nativeCalls[1][0] === 'camera', 'other built-ins forward too')

const r = await N.plugins.Echo.echo({ x: 1 })
check(r.echoed.x === 1, 'call resolves with parsed JSON')
check(bridgeCalls[0].plugin === 'Echo' && bridgeCalls[0].method === 'echo', 'bridge receives plugin and method')

await N.plugins.Echo.echo()
check(JSON.stringify(bridgeCalls[1].args) === '{}', 'no argument becomes {}')

const ids = new Set(bridgeCalls.map(c => c.id))
await Promise.all([N.plugins.Echo.echo({}), N.plugins.Echo.echo({}), N.plugins.Battery.getStatus()])
check(new Set(bridgeCalls.map(c => c.id)).size === bridgeCalls.length, 'every call gets a unique id')
check(/^[A-Za-z0-9_-]{1,64}$/.test(bridgeCalls[0].id), 'ids match the pattern the Java side accepts')

bridgeMode = 'reject'
try { await N.plugins.Echo.boom({}); check(false, 'rejection') }
catch (e) { check(e instanceof Error && e.message === 'boom' && e.code === 'PLUGIN_ERROR', 'rejected call becomes Error with message and code') }

bridgeMode = 'throw'
try { await N.plugins.Echo.echo({}); check(false, 'bridge throw') }
catch (e) { check(e.message === 'bridge down', 'bridge exception rejects the promise') }

bridgeMode = 'raw'
check((await N.plugins.Echo.echo({})) === 'not json', 'non-JSON payload is passed through')

// events
const got = []
const h1 = v => got.push(['h1', v])
const h2 = () => { throw new Error('bad handler') }
const h3 = v => got.push(['h3', v])
N.on('Echo:tick', h1); N.on('Echo:tick', h2); N.on('Echo:tick', h3)
window.__nitronEmit('Echo:tick', '{"v":1}')
check(got.length === 2 && got[0][1].v === 1, 'event reaches handlers; a throwing handler does not stop the others')
N.off('Echo:tick', h1)
window.__nitronEmit('Echo:tick', '{"v":2}')
check(got.length === 3 && got[2][0] === 'h3', 'off() removes a handler')
window.__nitronEmit('Other:none', '{}')
check(true, 'event without listeners is ignored')

// resolving an unknown id is harmless
window.__nitronResolve('nope', true, '{}')
check(true, 'unknown call id is ignored')

// running the script twice must not reset anything
const before = window.Nitron
vm.runInContext(script, ctx)
check(window.Nitron === before, 'script is idempotent')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
