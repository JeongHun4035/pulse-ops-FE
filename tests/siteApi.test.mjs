import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/siteApi.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replace('import.meta.env.VITE_API_BASE_URL', "undefined"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { siteApi } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
const fixture = { id: 7, name: 'API contract fixture', url: 'https://example.com', intervalSeconds: 60, enabled: true, status: 'UNKNOWN', responseTimeMs: null, httpStatusCode: null, lastCheckedAt: null, nextCheckAt: null }
const httpSource = await readFile(new URL('../src/api/http.ts', import.meta.url), 'utf8')
const httpCompiled = ts.transpileModule(httpSource.replace('import.meta.env.VITE_API_BASE_URL', 'undefined'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { apiConfig, getRequestURL } = await import('data:text/javascript;base64,' + Buffer.from(httpCompiled).toString('base64'))
test('common Fetch/Axios URLs use the current origin and never duplicate /api', t => {
  const originalWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://pulseops.example' } }
  const originalBase = apiConfig.baseURL
  t.after(() => {
    apiConfig.baseURL = originalBase
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  })
  assert.equal(apiConfig.baseURL, '/api')
  for (const base of ['/api', '/api/']) {
    apiConfig.baseURL = base
    for (const path of ['/v1/sites', 'v1/sites', '/api/v1/sites', 'api/v1/sites']) {
      assert.equal(getRequestURL(path), 'https://pulseops.example/api/v1/sites')
    }
    assert.equal(getRequestURL('/api/v1/sites/7/history', { all: true }), 'https://pulseops.example/api/v1/sites/7/history?all=true')
  }
})
const signal = () => new AbortController().signal
test('API client contract and error handling', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  await t.test('raw and wrapped lists preserve UNKNOWN and null values', async () => {
    for (const payload of [[fixture], { data: [fixture] }, { content: [fixture] }, { sites: [fixture] }]) {
      globalThis.fetch = async () => Response.json(payload)
      assert.deepEqual(await siteApi.list(signal()), [fixture])
    }
  })
  await t.test('history sorts chronologically and preserves missing response times', async () => {
    globalThis.fetch = async url => {
      assert.match(url, /all=true$/)
      return Response.json({ siteId: 7, history: [
        { checkedAt: '2026-10-22T01:00:00Z', status: 'DOWN', httpStatusCode: null, responseTimeMs: null },
        { checkedAt: '2026-10-22T00:00:00Z', status: 'UP', httpStatusCode: 200, responseTimeMs: 142 },
      ] })
    }
    const rows = await siteApi.history(7, '6h', signal())
    assert.equal(rows[0].responseTimeMs, 142)
    assert.equal(rows[1].responseTimeMs, null)
    assert.equal(rows[1].status, 'DOWN')
  })
  await t.test('create, patch and delete use correct methods and support empty bodies', async () => {
    const calls = []
    globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return new Response(null, { status: 204 }) }
    await siteApi.create({ name: 'contract', url: 'https://example.com', intervalSeconds: 60 }, signal())
    await siteApi.update(7, 300, signal())
    await siteApi.remove(7, signal())
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PATCH', 'DELETE'])
    assert.equal(calls[1].url, '/api/v1/sites/7')
    assert.deepEqual(JSON.parse(calls[1].body), { intervalSeconds: 300 })
  })
  await t.test('minute and hour ranges use exactly one supported query parameter', async () => {
    for (const [range, expected] of [['1m', 'minutes=30'], ['5m', 'hours=1'], ['30m', 'hours=6'], ['1h', 'hours=6'], ['6h', 'all=true'], ['24h', 'all=true']]) {
      globalThis.fetch = async url => {
        assert.equal(url, '/api/v1/sites/7/history?' + expected)
        return Response.json({ siteId: 7, history: [] })
      }
      assert.deepEqual(await siteApi.history(7, range, signal()), [])
    }
  })
  await t.test('HTTP errors include backend message and status', async () => {
    globalThis.fetch = async () => Response.json({ message: 'Duplicate URL' }, { status: 409 })
    await assert.rejects(siteApi.list(signal()), /Duplicate URL.*409/)
  })
  await t.test('date ranges include the full end date and exclude adjacent dates', async () => {
    const localDate = (day, time) => new Date(day + 'T' + time).toISOString()
    globalThis.fetch = async url => {
      assert.match(url, /all=true$/)
      return Response.json({ siteId: 7, history: [
        { checkedAt: localDate('2026-10-21', '23:59:59'), status: 'UP', httpStatusCode: 200, responseTimeMs: 1 },
        { checkedAt: localDate('2026-10-22', '00:00:00'), status: 'UP', httpStatusCode: 200, responseTimeMs: 2 },
        { checkedAt: localDate('2026-10-22', '23:59:59.999'), status: 'DOWN', httpStatusCode: null, responseTimeMs: null },
        { checkedAt: localDate('2026-10-23', '00:00:00'), status: 'UP', httpStatusCode: 200, responseTimeMs: 4 },
      ] })
    }
    const result = await siteApi.history(7, '1m', signal(), { startDate: '2026-10-22', endDate: '2026-10-22' })
    assert.equal(result.length, 2)
    assert.equal(result[0].responseTimeMs, 2)
    assert.equal(result[1].responseTimeMs, null)
  })
  await t.test('network failures and malformed responses do not return successful data', async () => {
    globalThis.fetch = async () => { throw new TypeError('fetch failed') }
    await assert.rejects(siteApi.list(signal()), /API에 연결할 수 없습니다/)
    globalThis.fetch = async () => Response.json({ unexpected: true })
    await assert.rejects(siteApi.list(signal()), /배열이 아닙니다/)
  })
  await t.test('unmount cancellation is passed to fetch', async () => {
    const controller = new AbortController()
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
    const pending = siteApi.list(controller.signal)
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
  })
})

