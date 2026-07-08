import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkEdgeApiKeyExpiry,
  EDGE_PUBLISH_API_URL,
} from '../../../scripts/check-edge-api-key-expiry.mjs'

test('checkEdgeApiKeyExpiry passes when the Edge API key expires after the warning window', () => {
  const result = checkEdgeApiKeyExpiry({
    expiresAt: '2026-07-15',
    now: new Date('2026-06-29T00:00:00Z'),
  })

  assert.deepEqual(result, {
    ok: true,
    daysRemaining: 16,
    message: `Edge API key expires on 2026-07-15, 16 days remaining. Renew at ${EDGE_PUBLISH_API_URL}`,
  })
})

test('checkEdgeApiKeyExpiry fails when the Edge API key is close to expiry', () => {
  const result = checkEdgeApiKeyExpiry({
    expiresAt: '2026-07-14',
    now: new Date('2026-06-29T00:00:00Z'),
  })

  assert.equal(result.ok, false)
  assert.equal(result.daysRemaining, 15)
  assert.match(result.message, /expires in 15 days/)
  assert.match(
    result.message,
    new RegExp(EDGE_PUBLISH_API_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
})

test('checkEdgeApiKeyExpiry fails when the Edge API key expiry date is missing or invalid', () => {
  assert.deepEqual(checkEdgeApiKeyExpiry({ expiresAt: '' }), {
    ok: false,
    daysRemaining: null,
    message: `EDGE_API_KEY_EXPIRES_AT is required. Set it to YYYY-MM-DD after renewing the key at ${EDGE_PUBLISH_API_URL}`,
  })

  assert.deepEqual(checkEdgeApiKeyExpiry({ expiresAt: '2026/07/20' }), {
    ok: false,
    daysRemaining: null,
    message: 'EDGE_API_KEY_EXPIRES_AT must use YYYY-MM-DD format, got: 2026/07/20',
  })
})
