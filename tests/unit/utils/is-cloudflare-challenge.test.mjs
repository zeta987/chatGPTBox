import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { isCloudflareChallengePage } from '../../../src/utils/is-cloudflare-challenge.mjs'

const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')

const restoreGlobal = (name, descriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor)
  } else {
    delete globalThis[name]
  }
}

const setPageState = ({
  pathname = '/',
  hostname = 'example.com',
  cfChlOpt,
  title = '',
  elementIds = [],
  querySelectorMatches = [],
} = {}) => {
  Object.defineProperty(globalThis, 'location', {
    value: { pathname, hostname },
    configurable: true,
  })

  Object.defineProperty(globalThis, 'window', {
    value: cfChlOpt !== undefined ? { _cf_chl_opt: cfChlOpt } : {},
    configurable: true,
  })

  Object.defineProperty(globalThis, 'document', {
    value: {
      title,
      getElementById: (id) => (elementIds.includes(id) ? {} : null),
      querySelector: (selector) =>
        querySelectorMatches.some((match) => selector.includes(match)) ? {} : null,
    },
    configurable: true,
  })
}

afterEach(() => {
  restoreGlobal('location', originalLocationDescriptor)
  restoreGlobal('window', originalWindowDescriptor)
  restoreGlobal('document', originalDocumentDescriptor)
})

test('isCloudflareChallengePage returns false for a normal page', () => {
  setPageState({ pathname: '/some-article', hostname: 'example.com', title: 'My Blog Post' })

  assert.equal(isCloudflareChallengePage(), false)
})

test('isCloudflareChallengePage detects cdn-cgi challenge-platform path', () => {
  setPageState({ pathname: '/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1' })

  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage detects challenges.cloudflare.com hostname', () => {
  setPageState({ hostname: 'challenges.cloudflare.com' })

  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage detects window._cf_chl_opt runtime global', () => {
  setPageState({ cfChlOpt: { cvId: '2', cType: 'managed' } })

  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage detects known challenge titles case-insensitively', () => {
  setPageState({ title: 'Just a moment...' })
  assert.equal(isCloudflareChallengePage(), true)

  setPageState({ title: 'ATTENTION REQUIRED!' })
  assert.equal(isCloudflareChallengePage(), true)

  setPageState({ title: '請稍候' })
  assert.equal(isCloudflareChallengePage(), true)

  setPageState({ title: '请稍候...' })
  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage does not false-positive on benign titles that merely contain a challenge phrase', () => {
  // "Un momento" is a common Spanish phrase opener; the ambiguous locale entries were dropped
  // entirely rather than trying to disambiguate them, so these titles must never match.
  setPageState({ title: 'Un momento en la historia' })
  assert.equal(isCloudflareChallengePage(), false)

  setPageState({ title: 'Um momento, por favor: uma reflexão sobre a vida' })
  assert.equal(isCloudflareChallengePage(), false)

  // A long marketing/storefront title that merely starts with a CJK challenge phrase must not
  // match either — only the short interstitial placeholder itself should.
  setPageState({ title: '请稍候，我们马上回来 - 商城' })
  assert.equal(isCloudflareChallengePage(), false)
})

test('isCloudflareChallengePage detects challenge-form element', () => {
  setPageState({ elementIds: ['challenge-form'] })

  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage detects challenge-running element', () => {
  setPageState({ elementIds: ['challenge-running'] })

  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage detects turnstile widget selectors', () => {
  setPageState({ querySelectorMatches: ['.cf-turnstile'] })

  assert.equal(isCloudflareChallengePage(), true)
})

test('isCloudflareChallengePage is defensive when document is unavailable', () => {
  Object.defineProperty(globalThis, 'location', {
    value: { pathname: '/', hostname: 'example.com' },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  delete globalThis.document

  assert.equal(isCloudflareChallengePage(), false)
})
