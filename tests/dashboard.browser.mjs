import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const executable = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
assert.ok(executable, 'Set CHROME_PATH to a Chromium browser executable.')
const origin = process.env.TEST_ORIGIN ?? 'http://localhost:5173'
const profile = await mkdtemp(join(tmpdir(), 'pulseops-browser-'))
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=19327', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let targets
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch('http://127.0.0.1:19327/json')).json(); break } catch { await delay(100) }
  }
  const target = targets?.find(item => item.type === 'page')
  assert.ok(target, 'Chrome debugging endpoint did not start.')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  socket.onmessage = event => {
    const result = JSON.parse(event.data)
    if (!result.id) return
    const handler = pending.get(result.id)
    if (!handler) return
    pending.delete(result.id)
    if (result.error) handler.reject(new Error(JSON.stringify(result.error)))
    else handler.resolve(result.result)
  }
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate('Boolean(' + expression + ')')) return
      await delay(50)
    }
    throw new Error('Timed out: ' + expression)
  }
  await command('Page.enable')
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__calls = []
    window.__sites = JSON.parse(sessionStorage.getItem('seedSites') ?? '[]')
    window.__failNextPost = false
    window.__failNextDelete = false
    window.__historyData = {}
    window.__failHistoryId = null
    window.__abortedHistory = []
    window.__historyDelay = 20
    const nativeSetTimeout = window.setTimeout.bind(window)
    const nativeClearTimeout = window.clearTimeout.bind(window)
    const scheduled = new Map()
    let timerId = 1000000
    window.setTimeout = (callback, ms, ...args) => {
      if (ms === 30000 || ms === 3000) {
        const id = timerId++
        scheduled.set(id, { callback: () => callback(...args), ms })
        return id
      }
      return nativeSetTimeout(callback, ms, ...args)
    }
    window.clearTimeout = id => { scheduled.delete(id); nativeClearTimeout(id) }
    window.__advance = ms => {
      const timers = [...scheduled].filter(([, item]) => item.ms === ms)
      for (const [id, item] of timers) { scheduled.delete(id); item.callback() }
    }
    window.__pollCount = () => [...scheduled.values()].filter(item => item.ms === 30000).length
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(url, location.origin)
      if (!parsed.pathname.startsWith('/api/v1/')) return nativeFetch(url, options)
      const method = options.method ?? 'GET'
      window.__calls.push({ path: parsed.pathname + parsed.search, method })
      await new Promise((resolve, reject) => {
        const id = nativeSetTimeout(resolve, method === 'POST' ? 250 : method === 'DELETE' ? 80 : parsed.pathname.endsWith('/history') ? window.__historyDelay : 20)
        options.signal?.addEventListener('abort', () => { nativeClearTimeout(id); if (parsed.pathname.endsWith('/history')) window.__abortedHistory.push(parsed.pathname + parsed.search); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      })
      if (method === 'POST') {
        if (window.__failNextPost) {
          window.__failNextPost = false
          return Response.json({ message: '등록 실패 테스트' }, { status: 409 })
        }
        const input = JSON.parse(options.body)
        window.__sites.push({ ...input, id: window.__sites.length + 1, enabled: true, status: 'UNKNOWN', httpStatusCode: null, responseTimeMs: null, lastCheckedAt: null, nextCheckAt: null })
        return Response.json(window.__sites.at(-1), { status: 201 })
      }
      if (method === 'DELETE') {
        if (window.__failNextDelete) {
          window.__failNextDelete = false
          return Response.json({ message: '삭제 실패 테스트' }, { status: 500 })
        }
        const id = Number(parsed.pathname.split('/').at(-1))
        window.__sites = window.__sites.filter(site => site.id !== id)
        return new Response(null, { status: 204 })
      }
      if (parsed.pathname.endsWith('/history')) {
        const siteId = Number(parsed.pathname.split('/').at(-2))
        if (window.__failHistoryId === siteId) return Response.json({ message: '이력 조회 실패 테스트' }, { status: 500 })
        return Response.json({ siteId, history: window.__historyData[siteId] ?? [] })
      }
      return Response.json(window.__sites)
    }
  ` })
  await command('Page.navigate', { url: origin })
  await waitFor("document.querySelector('.open-site-form') && !document.querySelector('.open-site-form').disabled && document.querySelector('.summary-value')?.textContent.includes('0')")
  await delay(150)
  let calls = await evaluate('window.__calls')
  assert.deepEqual(calls.map(call => call.method + ' ' + call.path), ['GET /api/v1/sites'])
  console.log('PASS: StrictMode initial mount sends exactly one list request.')
  assert.equal(await evaluate("document.querySelector('#site-name') === null"), true)
  await evaluate("document.querySelector('.open-site-form').focus(); document.querySelector('.open-site-form').click()")
  await waitFor("document.querySelector('[role=dialog]') && document.activeElement.id === 'site-name'")
  await evaluate("document.querySelector('.site-registration-popup form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))")
  await waitFor("document.querySelector('.form-error')")
  assert.equal(await evaluate('window.__calls.length'), 1)
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
  await waitFor("document.querySelector('[role=dialog]') === null")
  assert.equal(await evaluate("document.activeElement.matches('.open-site-form')"), true)
  await evaluate("document.querySelector('.open-site-form').click()")
  await waitFor("document.querySelector('#site-name')")
  console.log('PASS: registration opens in a Popup, validates before API calls, and supports Escape/focus restoration.')
  const fill = async (name, url) => {
    await evaluate(`(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      const name = document.querySelector('#site-name')
      const url = document.querySelector('#site-url')
      setter.call(name, ${JSON.stringify(name)})
      name.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(url, ${JSON.stringify(url)})
      url.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await delay(50)
  }
  await fill('Browser regression fixture', 'https://example.com')
  await evaluate(`(() => {
    const form = document.querySelector('.site-registration-popup form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    document.querySelector('.header-actions button').click()
    window.__advance(30000)
  })()`)
  await waitFor("document.querySelector('[role=dialog][aria-busy=true]')")
  assert.equal(await evaluate("[...document.querySelectorAll('[role=dialog] button')].every(button => button.disabled)"), true)
  await evaluate("document.querySelector('.popup-overlay').click(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
  assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), true)
  await waitFor("document.querySelector('.site-select') && document.querySelector('[role=dialog]') === null && window.__calls.some(call => call.path.includes('/history'))")
  await delay(200)
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(1).map(call => call.method + ' ' + call.path), [
    'POST /api/v1/sites', 'GET /api/v1/sites', 'GET /api/v1/sites/1/history?all=true',
  ])
  assert.equal(await evaluate('window.__pollCount()'), 1)
  assert.equal(await evaluate("document.querySelector('.common-toast--success [role=status]')?.textContent"), '사이트가 등록되었습니다.')
  assert.equal(await evaluate("document.querySelector('main .notice.success') === null"), true)
  console.log('PASS: double submit + manual refresh + due poll produce one POST, one list reload and one history request; success is a toast.')
  const beforePoll = calls.length
  await evaluate("document.querySelector('.open-site-form').click()")
  await waitFor("document.querySelector('#site-name')")
  assert.equal(await evaluate("document.querySelector('#site-name').value"), '')
  assert.equal(await evaluate("document.querySelector('#site-url').value"), '')
  await fill('Keep my draft', 'https://draft.example.com')
  await evaluate('window.__advance(30000)')
  await waitFor('window.__calls.length === ' + (beforePoll + 2))
  await delay(100)
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforePoll).map(call => call.method + ' ' + call.path), ['GET /api/v1/sites', 'GET /api/v1/sites/1/history?all=true'])
  assert.equal(await evaluate("document.querySelector('#site-name').value"), 'Keep my draft')
  assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), true)
  assert.equal(await evaluate('window.__pollCount()'), 1)
  console.log('PASS: one polling cycle refreshes list/history once and preserves form input.')
  await evaluate('window.__advance(3000)')
  await waitFor("document.querySelector('.common-toast') === null")
  console.log('PASS: success toast dismisses automatically.')
  await evaluate("window.__failNextPost = true; document.querySelector('.site-registration-popup form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))")
  await waitFor("document.querySelector('.common-toast--error')")
  assert.equal(await evaluate("document.querySelector('.common-toast--error [role=alert]').textContent"), '등록 실패 테스트 (HTTP 409)')
  assert.equal(await evaluate("document.querySelector('#site-name').value"), 'Keep my draft')
  await evaluate("document.querySelector('.common-toast button').click()")
  await waitFor("document.querySelector('.common-toast') === null")
  console.log('PASS: registration errors use a dismissible toast and preserve the draft.')
  await evaluate("document.querySelector('.popup-close').click()")
  await waitFor("document.querySelector('[role=dialog]') === null")
  await evaluate("document.querySelector('.open-site-form').click()")
  await waitFor("document.querySelector('#site-name')")
  assert.equal(await evaluate("document.querySelector('#site-name').value"), 'Keep my draft')
  console.log('PASS: registration success closes/resets the Popup; API failure keeps it open; cancel/reopen preserves the draft.')
  await evaluate("sessionStorage.setItem('seedSites', JSON.stringify(window.__sites))")
  await command('Page.reload')
  await waitFor("document.querySelector('.site-select') && window.__calls.some(call => call.path.includes('/history'))")
  await delay(200)
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.map(call => call.method + ' ' + call.path), ['GET /api/v1/sites', 'GET /api/v1/sites/1/history?all=true'])
  assert.equal(await evaluate('window.__pollCount()'), 1)
  console.log('PASS: StrictMode initial load with an existing site requests list/history once each.')
  const beforeDelete = calls.length
  await evaluate("document.querySelector('.icon-button.danger').focus(); document.querySelector('.icon-button.danger').click()")
  await waitFor("document.querySelector('[role=alertdialog]')")
  assert.equal(await evaluate("document.querySelector('[role=alertdialog]').textContent.includes('Browser regression fixture')"), true)
  assert.equal(await evaluate("document.activeElement.matches('[data-confirm-cancel]')"), true)
  assert.equal(await evaluate('window.__calls.length'), beforeDelete)
  await evaluate("document.querySelector('[data-confirm-cancel]').click()")
  await waitFor("document.querySelector('[role=alertdialog]') === null")
  assert.equal(await evaluate('window.__calls.length'), beforeDelete)
  assert.equal(await evaluate("document.activeElement.matches('.icon-button.danger')"), true)
  console.log('PASS: delete opens a custom Confirm popup; cancel makes no API request and restores focus.')
  await evaluate("document.querySelector('.icon-button.danger').click()")
  await waitFor("document.querySelector('[role=alertdialog]')")
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
  await waitFor("document.querySelector('[role=alertdialog]') === null")
  await evaluate("window.__failNextDelete = true; document.querySelector('.icon-button.danger').click()")
  await waitFor("document.querySelector('[role=alertdialog]')")
  await evaluate("document.querySelector('.delete-confirm-button').click()")
  await waitFor("document.querySelector('.common-toast--error') && document.querySelector('[role=alertdialog][aria-busy=false]')")
  assert.equal(await evaluate("document.querySelector('.common-toast--error').textContent.includes('삭제 실패 테스트')"), true)
  assert.equal(await evaluate("Boolean(document.querySelector('.site-select'))"), true)
  console.log('PASS: delete failure keeps the confirmation open and reports the error in a toast.')
  const beforeRetry = await evaluate('window.__calls.length')
  await evaluate("document.querySelector('.common-toast--error button').click(); document.querySelector('.delete-confirm-button').click(); document.querySelector('.delete-confirm-button').click()")
  await waitFor("document.querySelector('[role=alertdialog][aria-busy=true]')")
  assert.equal(await evaluate("[...document.querySelectorAll('[role=alertdialog] button')].every(button => button.disabled)"), true)
  await evaluate("document.querySelector('.confirm-overlay').click(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
  assert.equal(await evaluate("Boolean(document.querySelector('[role=alertdialog]'))"), true)
  await waitFor("document.querySelector('[role=alertdialog]') === null && document.querySelector('.site-select') === null")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeRetry).map(call => call.method + ' ' + call.path), ['DELETE /api/v1/sites/1', 'GET /api/v1/sites'])
  assert.equal(await evaluate("document.querySelector('.common-toast--success').textContent.includes('사이트가 삭제되었습니다.')"), true)
  console.log('PASS: confirmed delete is submitted once, blocks dismissal while pending, closes on success and shows a toast.')
  // These fixtures exist only in this isolated tab; no backend records are created.
  await evaluate(`(() => {
    const makeSite = (id, name) => ({ id, name, url: 'https://example.com/' + id, intervalSeconds: 60, enabled: true, status: 'UP', httpStatusCode: 200, responseTimeMs: 120, lastCheckedAt: null, nextCheckAt: null })
    window.__sites = [makeSite(11, 'Compare A'), makeSite(12, 'Compare B'), makeSite(13, 'Compare C')]
    const now = Date.now()
    const point = (offset, value, status = 'UP') => ({ checkedAt: new Date(now - offset).toISOString(), status, httpStatusCode: status === 'DOWN' ? null : 200, responseTimeMs: value })
    window.__historyData = {
      11: [point(50000, 100), point(30000, null, 'DOWN'), point(10000, 140)],
      12: [point(45000, 120), point(25000, 180), point(5000, 150)],
      13: [point(40000, 90), point(20000, 110)]
    }
    document.querySelector('.header-actions button').click()
  })()`)
  await waitFor("document.querySelectorAll('tbody input[type=checkbox]').length === 3 && !document.querySelector('.header-actions button').disabled")
  assert.equal(await evaluate("document.querySelectorAll('tbody input:checked').length"), 0)
  let beforeCompare = await evaluate('window.__calls.length')
  await evaluate("document.querySelector('input[aria-label=\"Compare A 차트 선택\"]').click()")
  await waitFor("document.querySelectorAll('.chart-series-legend li').length === 1 && !document.querySelector('.chart-meta [role=status]') && document.querySelector('.chart-canvas')")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeCompare).map(call => call.path), ['/api/v1/sites/11/history?all=true'])
  beforeCompare = calls.length
  await evaluate("document.querySelector('input[aria-label=\"Compare B 차트 선택\"]').click()")
  await waitFor("document.querySelectorAll('.chart-series-legend li').length === 2 && !document.querySelector('.chart-meta [role=status]') && document.querySelectorAll('.chart-canvas .recharts-line-dot').length === 5")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeCompare).map(call => call.path), ['/api/v1/sites/12/history?all=true'])
  assert.equal(await evaluate("document.querySelectorAll('.recharts-line').length"), 2)
  assert.equal(await evaluate("document.querySelectorAll('tr.selected-row').length"), 2)
  assert.equal(await evaluate("document.querySelector('thead input').indeterminate"), true)
  assert.equal(await evaluate("document.querySelectorAll('.chart-canvas .recharts-line-dot').length"), 5)
  console.log('PASS: checkboxes add independent chart series; only the newly checked site is fetched; null is not plotted as zero.')

  for (const [label, query] of [['1분', 'minutes=30'], ['5분', 'hours=1'], ['30분', 'hours=6'], ['1시간', 'hours=6'], ['6시간', 'all=true'], ['24시간', 'all=true']]) {
    const beforeRange = await evaluate('window.__calls.length')
    await evaluate("[...document.querySelectorAll('.range-control button')].find(button => button.textContent === " + JSON.stringify(label) + ").click()")
    await waitFor("window.__calls.length === " + (beforeRange + 2) + " && !document.querySelector('.chart-meta [role=status]') && document.querySelectorAll('.recharts-line').length === 2")
    calls = await evaluate('window.__calls')
    assert.deepEqual(calls.slice(beforeRange).map(call => call.path).sort(), ['/api/v1/sites/11/history?' + query, '/api/v1/sites/12/history?' + query])
    assert.equal(await evaluate("document.querySelectorAll('.recharts-line').length"), 2)
    const labels = await evaluate("[...document.querySelectorAll('.chart-canvas text')].map(node => node.textContent).filter(text => text.includes(':') || text.includes('/'))")
    assert.equal(labels.length, 7)
    const expectedStep = { '1분': 60000, '5분': 300000, '30분': 1800000, '1시간': 3600000, '6시간': 21600000, '24시간': 86400000 }[label]
    const positions = labels.map(text => {
      const match = text.match(/^(?:(\d{2})\/(\d{2}) )?(\d{2}):(\d{2})$/)
      if (match) return Date.UTC(2000, Number(match[1] ?? 1) - 1, Number(match[2] ?? 1), Number(match[3]), Number(match[4]))
      const [month, day] = text.split('/').map(Number)
      return Date.UTC(2000, month - 1, day)
    })
    for (let i = 1; i < positions.length; i++) assert.equal(positions[i] - positions[i - 1], expectedStep)
  }
  console.log('PASS: all six ranges refresh each checked site once with the correct minutes/hours parameter.')

  await evaluate("window.__failHistoryId = 12; [...document.querySelectorAll('.range-control button')].find(button => button.textContent === '5분').click()")
  await waitFor("document.querySelector('.inline-error') && !document.querySelector('.chart-meta [role=status]')")
  assert.equal(await evaluate("document.querySelector('.inline-error').textContent.includes('Compare B')"), true)
  assert.equal(await evaluate("document.querySelector('.chart-canvas') !== null"), true)
  assert.equal(await evaluate("document.querySelectorAll('.chart-canvas .recharts-line-dot').length"), 2)
  await evaluate("window.__failHistoryId = null; document.querySelector('.header-actions button').click()")
  await waitFor("!document.querySelector('.inline-error') && !document.querySelector('.chart-meta [role=status]') && document.querySelectorAll('.chart-canvas .recharts-line-dot').length === 5")
  console.log('PASS: one failed site preserves other chart series and recovers on refresh.')

  const beforeAll = await evaluate('window.__calls.length')
  await evaluate("document.querySelector('thead input').click()")
  await waitFor("document.querySelectorAll('.chart-series-legend li').length === 3 && !document.querySelector('.chart-meta [role=status]')")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeAll).map(call => call.path), ['/api/v1/sites/13/history?hours=1'])
  const beforeClear = calls.length
  await evaluate("document.querySelector('thead input').click()")
  await waitFor("document.querySelectorAll('.chart-series-legend li').length === 0")
  await evaluate('window.__advance(30000)')
  await waitFor("window.__calls.length === " + (beforeClear + 1) + " && !document.querySelector('.header-actions button').disabled")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeClear).map(call => call.path), ['/api/v1/sites'])
  assert.equal(await evaluate("document.querySelectorAll('tbody input:checked').length"), 0)
  console.log('PASS: select-all adds only missing sites; deselect-all stays empty after polling and sends no history requests.')

  await evaluate("window.__historyDelay = 500; document.querySelector('input[aria-label=\"Compare A 차트 선택\"]').click()")
  await waitFor("document.querySelector('.chart-meta [role=status]')")
  await evaluate("document.querySelector('input[aria-label=\"Compare A 차트 선택\"]').click()")
  await waitFor("window.__abortedHistory.includes('/api/v1/sites/11/history?hours=1')")
  await delay(550)
  assert.equal(await evaluate("document.querySelectorAll('.chart-series-legend li').length"), 0)
  assert.equal(await evaluate("document.querySelector('.chart-canvas') === null"), true)
  console.log('PASS: deselecting a site aborts its in-flight request and prevents stale chart data.')

  await evaluate("window.__historyDelay = 20; document.querySelector('input[aria-label=\"Compare A 차트 선택\"]').click()")
  await waitFor("!document.querySelector('.chart-meta [role=status]') && document.querySelector('.chart-canvas')")
  const beforeDates = await evaluate('window.__calls.length')
  await evaluate("document.querySelector('.history-query').click()")
  await waitFor("document.querySelector('.history-range-picker [role=alert]')")
  assert.equal(await evaluate('window.__calls.length'), beforeDates)
  for (const id of ['history-start', 'history-end']) {
    await evaluate('document.getElementById(' + JSON.stringify(id) + ').click()')
    await waitFor("document.querySelector('.date-picker__calendar')")
    await evaluate("document.querySelector('.date-picker__day[aria-current=date]').click()")
  }
  assert.equal(await evaluate('window.__calls.length'), beforeDates)
  await evaluate("document.querySelector('.history-query').click()")
  await waitFor("window.__pollCount() === 1 && document.querySelector('.history-mode').textContent.includes('지정 기간 조회') && !document.querySelector('.chart-meta [role=status]') && window.__calls.length > " + beforeDates)
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeDates).map(call => call.path), ['/api/v1/sites/11/history?all=true'])
  const beforeFrozenPoll = calls.length
  await evaluate('window.__advance(30000)')
  await waitFor('window.__calls.length > ' + beforeFrozenPoll + " && !document.querySelector('.header-actions button').disabled")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeFrozenPoll).map(call => call.path), ['/api/v1/sites'])
  await evaluate("document.querySelector('.history-reset').click()")
  await waitFor("window.__pollCount() === 1 && document.querySelector('.history-mode').textContent.includes('실시간 조회') && !document.querySelector('.chart-meta [role=status]') && [...document.querySelectorAll('.range-control button')].some(button => button.textContent === '24시간' && button.getAttribute('aria-pressed') === 'true')")
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.history-range-form input[type=hidden]')].map(input => input.value)"), ['', ''])
  const beforeLivePoll = await evaluate('window.__calls.length')
  await evaluate('window.__advance(30000)')
  await waitFor('window.__calls.length === ' + (beforeLivePoll + 2) + " && !document.querySelector('.chart-meta [role=status]')")
  calls = await evaluate('window.__calls')
  assert.deepEqual(calls.slice(beforeLivePoll).map(call => call.path), ['/api/v1/sites', '/api/v1/sites/11/history?all=true'])
  console.log('PASS: date selection is applied on query; fixed history does not poll; reset clears dates/restores defaults and live history polling.')
  console.log('All browser regressions passed; API fixtures existed only in the isolated test page.')
} finally {
  socket?.close()
  browser.kill()
  await delay(500)
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()))
  assert.ok(basename(profile).startsWith('pulseops-browser-'))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

