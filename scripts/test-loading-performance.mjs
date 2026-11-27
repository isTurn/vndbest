import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { openSearchBrowserSession } from '../src/utils/searchBrowserSession.js'

globalThis.window = { requestIdleCallback() {} }
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) ?? null }
const { cacheManager, CACHE_TTL } = await import('../src/utils/cacheManager.js')
let fetchImpl
const requests = []
globalThis.fetch = async (url, options) => {
  requests.push({ url, options })
  const data = await fetchImpl(url, options)
  return { ok: true, status: 200, text: async () => JSON.stringify(data) }
}
globalThis.__loadingTest = { cacheManager, CACHE_TTL, Capacitor: { isNativePlatform: () => false }, CapacitorHttp: {} }
let source = await fs.readFile(new URL('../src/api/vndb.js', import.meta.url), 'utf8')
source = source.replace(/^import .* from '@capacitor\/core'\r?\n/m, 'const { Capacitor, CapacitorHttp } = globalThis.__loadingTest\n')
  .replace(/^import .* from '@\/utils\/cacheManager'\r?\n/m, 'const { cacheManager, CACHE_TTL } = globalThis.__loadingTest\n')
  .replaceAll('import.meta.env.DEV', 'false')
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const reset = () => {
  cacheManager.memory.clear()
  cacheManager.inFlightRequests.clear()
  cacheManager.idb.get = async () => null
  cacheManager.idb.set = async () => true
  requests.length = 0
  storage.clear()
  fetchImpl = async () => ({ ok: true })
}
const persistent = { cache: { persistent: true, ttl: 300000 } }
const checks = []

reset()
let reads = 0
cacheManager.idb.get = async () => { reads++; await delay(30); return null }
await Promise.all(Array.from({ length: 5 }, () => api.getStats(persistent)))
assert.equal(reads, 1)
assert.equal(requests.length, 1)
checks.push('concurrent cache reads and network requests coalesce')

reset()
const old = deferred(), fresh = deferred()
fetchImpl = () => requests.length === 1 ? old.promise : fresh.promise
const normalRequest = api.getStats()
await delay(0)
const forcedRequest = api.getStats({ forceReload: true })
await delay(0)
assert.equal(requests.length, 2)
fresh.resolve({ version: 'fresh' })
assert.equal((await forcedRequest).version, 'fresh')
old.resolve({ version: 'old' })
await normalRequest
assert.equal((await api.getStats()).version, 'fresh')
assert.equal(requests.length, 2)
checks.push('force refresh bypasses old requests and retains its newer cache result')

reset()
for (const path of ['/authinfo', '/ulist']) {
  await api.request(path)
  await api.request(path)
}
await api.getStats({ cache: false })
await api.getStats({ cache: false })
assert.equal(requests.length, 6)
checks.push('private data and explicit cache bypass stay uncached')

reset()
fetchImpl = async url => ({ source: url })
const production = await api.getStats()
storage.set('vndb_use_sandbox', 'true')
const sandbox = await api.getStats()
assert.notEqual(production.source, sandbox.source)
assert.equal(requests.length, 2)
checks.push('sandbox and production caches remain isolated')

reset()
let writes = 0
cacheManager.idb.set = async () => { writes++; return true }
for (const name of ['getVnList', 'getReleaseList', 'getCharacterList', 'getProducerList', 'getStaffList']) {
  await api[name]([], { results: 1 }, persistent)
  const payload = JSON.parse(requests.at(-1).options.body)
  assert.equal(payload.results, 1)
  assert.equal(payload.cache, undefined)
}
assert.equal(writes, 5)
checks.push('all homepage list helpers forward cache policy outside API payloads')

reset()
fetchImpl = async () => { throw new Error('fixture offline') }
await assert.rejects(api.getStats(), /fixture offline/)
fetchImpl = async () => ({ recovered: true })
assert.equal((await api.getStats()).recovered, true)
checks.push('failed requests release the coalescing slot')

reset()
cacheManager.idb.get = () => new Promise(() => {})
const started = performance.now()
await api.getStats(persistent)
const blockedMs = performance.now() - started
assert.ok(blockedMs >= 170 && blockedMs < 900, `blocked cache took ${blockedMs}ms`)
checks.push('blocked IndexedDB falls back to the network within its read budget')

reset()
const record = { data: { shortLived: true }, expireAt: Date.now() + 60 }
cacheManager.idb.get = async () => record
assert.equal((await cacheManager.get('expiry')).shortLived, true)
await delay(90)
assert.equal(cacheManager.memory.get('expiry'), null)
assert.equal(await cacheManager.get('expiry'), null)
const capacity = cacheManager.memory.maxSize
cacheManager.memory.maxSize = 2
cacheManager.memory.set('a', 1, 1000)
cacheManager.memory.set('b', 2, 1000)
cacheManager.memory.set('b', 3, 1000)
assert.equal(cacheManager.memory.get('a'), 1)
cacheManager.memory.maxSize = capacity
checks.push('disk promotion preserves expiry; updating LRU entries keeps unrelated data')

function browserFixture({ failOpen = false, closeBeforeOpen = false, missingId = false } = {}) {
  const handlers = new Map()
  const calls = []
  let removed = 0
  return {
    handlers, calls,
    get removed() { return removed },
    async addListener(name, handler) {
      handlers.set(name, handler)
      return { async remove() { removed++; handlers.delete(name) } }
    },
    async openWebView(options) {
      assert.equal(handlers.size, 3)
      assert.equal(options.isPresentAfterPageLoad, false)
      if (failOpen) throw new Error('fixture open failed')
      handlers.get('browserPageLoaded')({ id: 'search-1' })
      if (closeBeforeOpen) handlers.get('closeEvent')({ id: 'search-1' })
      return missingId ? {} : { id: 'search-1' }
    },
    async executeScript(options) { calls.push(options) }
  }
}
let browser = browserFixture()
let closed = 0
const session = await openSearchBrowserSession(browser, {}, { getCode: () => 'search()', onClose: () => closed++ })
assert.equal(browser.calls.length, 1, 'inject immediately after the id is available')
assert.equal(browser.calls[0].id, 'search-1')
browser.handlers.get('urlChangeEvent')({ id: 'other-tab' })
assert.equal(browser.calls.length, 1)
browser.handlers.get('urlChangeEvent')({ id: 'search-1' })
assert.equal(browser.calls.length, 2, 'start injection before full page load')
await session.dispose()
await delay(200)
assert.equal(browser.calls.length, 2, 'closing clears delayed injection timers')
assert.equal(browser.removed, 3)
assert.equal(closed, 1)
checks.push('search injection starts early, targets its tab and cleans up on close')

for (const options of [{ failOpen: true }, { missingId: true }, { closeBeforeOpen: true }]) {
  browser = browserFixture(options)
  const result = openSearchBrowserSession(browser, {}, { getCode: () => 'search()' })
  if (options.closeBeforeOpen) await result
  else await assert.rejects(result)
  assert.equal(browser.removed, 3)
  assert.equal(browser.calls.length, 0)
}
checks.push('browser open failures and very early closes release listeners without injection')

console.log(JSON.stringify({ passed: checks.length, checks, blockedCacheMs: Math.round(blockedMs) }, null, 2))
