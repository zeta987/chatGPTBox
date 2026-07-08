import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ensureStylesheet } from '../../../src/utils/ensure-stylesheet.mjs'

// Minimal fake DOM: just enough surface for ensureStylesheet to exercise its id-dedupe and
// link-creation logic without pulling in a full jsdom dependency.
function createFakeDocument() {
  const elementsById = new Map()
  const headChildren = []
  return {
    getElementById(id) {
      return elementsById.get(id) ?? null
    },
    createElement(tag) {
      const el = { tag, attributes: {} }
      return new Proxy(el, {
        set(target, prop, value) {
          target[prop] = value
          return true
        },
      })
    },
    head: {
      appendChild(el) {
        headChildren.push(el)
        if (el.id) elementsById.set(el.id, el)
      },
    },
    documentElement: null,
    _headChildren: headChildren,
  }
}

const fakeBrowser = {
  runtime: {
    getURL(path) {
      return `chrome-extension://test/${path}`
    },
  },
}

test('ensureStylesheet injects a link element pointing at the extension resource', () => {
  const doc = createFakeDocument()
  ensureStylesheet('my-css', 'my.css', doc, fakeBrowser)

  assert.equal(doc._headChildren.length, 1)
  const link = doc._headChildren[0]
  assert.equal(link.id, 'my-css')
  assert.equal(link.rel, 'stylesheet')
  assert.equal(link.href, 'chrome-extension://test/my.css')
})

test('ensureStylesheet is idempotent when the stylesheet id already exists', () => {
  const doc = createFakeDocument()
  ensureStylesheet('my-css', 'my.css', doc, fakeBrowser)
  ensureStylesheet('my-css', 'my.css', doc, fakeBrowser)

  assert.equal(doc._headChildren.length, 1)
})

test('ensureStylesheet no-ops when doc is falsy', () => {
  assert.doesNotThrow(() => ensureStylesheet('my-css', 'my.css', null, fakeBrowser))
})

test('ensureStylesheet falls back to documentElement when head is missing', () => {
  const doc = createFakeDocument()
  doc.head = null
  const documentElementChildren = []
  doc.documentElement = {
    appendChild(el) {
      documentElementChildren.push(el)
    },
  }

  ensureStylesheet('my-css', 'my.css', doc, fakeBrowser)

  assert.equal(documentElementChildren.length, 1)
  assert.equal(documentElementChildren[0].href, 'chrome-extension://test/my.css')
})
