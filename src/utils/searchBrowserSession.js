/** Start search injection as soon as the document is usable, without waiting for images. */
export async function openSearchBrowserSession(browser, options, { getCode, onClose }) {
  let id = null
  let disposed = false
  let injectCount = 0
  const handles = []
  const timers = new Set()
  const earlyCloses = new Set()

  const dispose = async () => {
    if (disposed) return
    disposed = true
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    onClose?.()
    await Promise.allSettled(handles.map(handle => handle.remove()))
  }

  const inject = async () => {
    // Never omit id: doing so can execute in a different, more recently opened tab.
    if (disposed || !id || injectCount >= 12) return
    injectCount++
    try {
      await browser.executeScript({ id, code: getCode() })
    } catch (error) {
      console.warn('[searchBrowser] injection failed:', error?.message || error)
    }
  }

  const onReady = event => {
    if (id && event?.id === id) void inject()
  }

  try {
    // Register before opening so even a cached page's load/close event is covered.
    handles.push(await browser.addListener('browserPageLoaded', onReady))
    handles.push(await browser.addListener('urlChangeEvent', onReady))
    handles.push(await browser.addListener('closeEvent', event => {
      if (!id) {
        if (event?.id) earlyCloses.add(event.id)
      } else if (event?.id === id) {
        void dispose()
      }
    }))
    const result = await browser.openWebView({ ...options, isPresentAfterPageLoad: false })
    id = result?.id
    if (!id) throw new Error('Search browser returned no webview id')
    if (earlyCloses.has(id)) {
      await dispose()
    } else {
      // The injected scripts check their origin, DOM readiness and run token.
      // Early retries cover a document still being created; load events cover reloads/login.
      void inject()
      for (const delay of [150, 650, 2500, 6000, 12000, 20000]) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          void inject()
        }, delay)
        timers.add(timer)
      }
    }
    return { id, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
