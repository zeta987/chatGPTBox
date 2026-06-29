import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SOURCE_REVIEW_TEXT,
  shouldExcludeSourcePath,
} from '../../../scripts/create-firefox-sources-zip.mjs'

test('SOURCE_REVIEW_TEXT matches AMO review instructions', () => {
  assert.equal(
    SOURCE_REVIEW_TEXT,
    `Required System:
Windows 10/ Windows 11. Otherwise, the newline character in the output will be different.

Build steps:
npm ci
npm run build

firefox.zip is the output addon
please unzip it and compare its contents with the submitted files, ensuring that the contents are consistent
`,
  )
})

test('shouldExcludeSourcePath excludes generated and local-only paths', () => {
  const excluded = [
    'node_modules/preact/index.js',
    'build/firefox.zip',
    '.git/config',
    '.idea/workspace.xml',
    '.cache/webpack/a',
    'coverage/lcov.info',
    '.tmp-audit/report.json',
    'chatGPTBox.zip',
    'build/chromium.zip',
  ]

  for (const path of excluded) {
    assert.equal(shouldExcludeSourcePath(path), true, path)
  }
})

test('shouldExcludeSourcePath keeps reviewable project source paths', () => {
  const included = [
    'src/manifest.v2.json',
    'tests/unit/config/user-config.test.mjs',
    'safari/build.sh',
    '.github/workflows/scripts/verify-search-engine-configs.mjs',
    'build.mjs',
    'package.json',
    'package-lock.json',
    'SOURCE_CODE_REVIEW.md',
  ]

  for (const path of included) {
    assert.equal(shouldExcludeSourcePath(path), false, path)
  }
})
