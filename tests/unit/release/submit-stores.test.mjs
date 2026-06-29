import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFirefoxReleaseNotes,
  buildPublishExtensionArgs,
  findMissingArtifacts,
  findMissingEnv,
  parseArgs,
  stripFirefoxExtensionId,
  updateFirefoxVersionNotes,
} from '../../../scripts/submit-stores.mjs'

test('parseArgs detects dry run', () => {
  assert.deepEqual(parseArgs(['--dry-run']), { dryRun: true })
  assert.deepEqual(parseArgs([]), { dryRun: false })
})

test('findMissingEnv reports all required secrets', () => {
  const missing = findMissingEnv({})
  assert.deepEqual(missing, [
    'CHROME_EXTENSION_ID',
    'CHROME_CLIENT_ID',
    'CHROME_CLIENT_SECRET',
    'CHROME_REFRESH_TOKEN',
    'FIREFOX_EXTENSION_ID',
    'FIREFOX_JWT_ISSUER',
    'FIREFOX_JWT_SECRET',
    'EDGE_PRODUCT_ID',
    'EDGE_CLIENT_ID',
    'EDGE_API_KEY',
  ])
})

test('findMissingEnv accepts required secrets', () => {
  const env = {
    CHROME_EXTENSION_ID: 'chrome-id',
    CHROME_CLIENT_ID: 'chrome-client',
    CHROME_CLIENT_SECRET: 'chrome-secret',
    CHROME_REFRESH_TOKEN: 'chrome-refresh',
    FIREFOX_EXTENSION_ID: 'chatgptbox',
    FIREFOX_JWT_ISSUER: 'firefox-issuer',
    FIREFOX_JWT_SECRET: 'firefox-secret',
    EDGE_PRODUCT_ID: 'edge-product',
    EDGE_CLIENT_ID: 'edge-client',
    EDGE_API_KEY: 'edge-key',
  }

  assert.deepEqual(findMissingEnv(env), [])
})

test('findMissingArtifacts reports missing artifacts', async () => {
  const exists = async (file) => file.endsWith('firefox.zip')
  const missing = await findMissingArtifacts({ exists })

  assert.deepEqual(missing, ['build/chromium.zip', 'build/firefox-sources.zip'])
})

test('buildPublishExtensionArgs includes all stores and dry run', () => {
  const args = buildPublishExtensionArgs({ dryRun: true })

  assert.deepEqual(args, [
    '--dry-run',
    '--chrome-zip',
    'build/chromium.zip',
    '--firefox-zip',
    'build/firefox.zip',
    '--firefox-sources-zip',
    'build/firefox-sources.zip',
    '--edge-zip',
    'build/chromium.zip',
  ])
})

test('buildFirefoxReleaseNotes returns the fixed GitHub release URL', () => {
  assert.equal(
    buildFirefoxReleaseNotes('2.6.1'),
    'https://github.com/josStorer/chatGPTBox/releases/tag/v2.6.1',
  )
})

test('stripFirefoxExtensionId removes AMO GUID braces', () => {
  assert.equal(stripFirefoxExtensionId('{chatgptbox@example.com}'), 'chatgptbox@example.com')
  assert.equal(stripFirefoxExtensionId('chatgptbox'), 'chatgptbox')
})

test('updateFirefoxVersionNotes patches release notes for the matching AMO version', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })

    if (String(url).includes('/versions/?page_size=50')) {
      return {
        ok: true,
        async json() {
          return {
            results: [
              { id: 100, version: '2.6.0' },
              { id: 101, version: '2.6.1' },
            ],
          }
        },
      }
    }

    return {
      ok: true,
      async text() {
        return ''
      },
    }
  }

  await updateFirefoxVersionNotes({
    extensionId: '{chatgptbox}',
    version: '2.6.1',
    jwtIssuer: 'issuer',
    jwtSecret: 'secret',
    fetchImpl,
    logger: () => {},
  })

  assert.equal(calls.length, 2)
  assert.equal(
    calls[0].url,
    'https://addons.mozilla.org/api/v5/addons/addon/chatgptbox/versions/?page_size=50',
  )
  assert.equal(
    calls[1].url,
    'https://addons.mozilla.org/api/v5/addons/addon/chatgptbox/versions/101/',
  )
  assert.equal(calls[1].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    release_notes: {
      'en-US': 'https://github.com/josStorer/chatGPTBox/releases/tag/v2.6.1',
    },
  })
})
