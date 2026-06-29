/* global process */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const EDGE_PUBLISH_API_URL =
  'https://partner.microsoft.com/zh-cn/dashboard/microsoftedge/publishapi'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toUtcDate(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function parseExpiryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const time = Date.UTC(year, month - 1, day)
  const parsed = new Date(time)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return parsed
}

export function checkEdgeApiKeyExpiry({ expiresAt, now = new Date(), warningDays = 15 } = {}) {
  if (!expiresAt) {
    return {
      ok: false,
      daysRemaining: null,
      message: `EDGE_API_KEY_EXPIRES_AT is required. Set it to YYYY-MM-DD after renewing the key at ${EDGE_PUBLISH_API_URL}`,
    }
  }

  const expiryDate = parseExpiryDate(expiresAt)
  if (!expiryDate) {
    return {
      ok: false,
      daysRemaining: null,
      message: `EDGE_API_KEY_EXPIRES_AT must use YYYY-MM-DD format, got: ${expiresAt}`,
    }
  }

  const daysRemaining = Math.floor((toUtcDate(expiryDate) - toUtcDate(now)) / MS_PER_DAY)
  if (daysRemaining < 0) {
    return {
      ok: false,
      daysRemaining,
      message: `Edge API key expired on ${expiresAt}. Renew it at ${EDGE_PUBLISH_API_URL}`,
    }
  }

  if (daysRemaining <= warningDays) {
    return {
      ok: false,
      daysRemaining,
      message: `Edge API key expires in ${daysRemaining} days on ${expiresAt}. Renew it at ${EDGE_PUBLISH_API_URL}`,
    }
  }

  return {
    ok: true,
    daysRemaining,
    message: `Edge API key expires on ${expiresAt}, ${daysRemaining} days remaining. Renew at ${EDGE_PUBLISH_API_URL}`,
  }
}

function appendStepSummary(result) {
  if (!process.env.GITHUB_STEP_SUMMARY) return

  const status = result.ok ? 'OK' : 'Action required'
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      '## Edge API key expiry',
      '',
      `Status: ${status}`,
      '',
      result.message,
      '',
      `Partner Center: ${EDGE_PUBLISH_API_URL}`,
      '',
    ].join('\n'),
  )
}

export function runCli({ env = process.env } = {}) {
  const result = checkEdgeApiKeyExpiry({
    expiresAt: env.EDGE_API_KEY_EXPIRES_AT,
  })

  appendStepSummary(result)

  if (result.ok) {
    console.log(result.message)
    return 0
  }

  console.error(result.message)
  return 1
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.exitCode = runCli()
}
