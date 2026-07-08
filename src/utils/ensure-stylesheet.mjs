import Browser from 'webextension-polyfill'

/**
 * Idempotently injects a `<link rel="stylesheet">` pointing at an extension-bundled CSS asset.
 * Used to lazy-load stylesheets (e.g. katex.css, fonts.css) that must NOT be statically bundled
 * into content-script.css, since that file is injected into every http/https page — including
 * Cloudflare Managed Challenge pages, where extra @font-face rules break Cloudflare's
 * font-fingerprinting check. No-ops if `doc` is falsy or the stylesheet is already present.
 * @param {string} id - unique element id used to dedupe repeated calls
 * @param {string} resourcePath - path passed to Browser.runtime.getURL, e.g. 'katex.css'
 * @param {Document} [doc]
 * @param {typeof Browser} [browser]
 */
export function ensureStylesheet(id, resourcePath, doc = document, browser = Browser) {
  if (!doc || doc.getElementById(id)) return
  const link = doc.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = browser.runtime.getURL(resourcePath)
  const parent = doc.head || doc.documentElement
  parent.appendChild(link)
}
