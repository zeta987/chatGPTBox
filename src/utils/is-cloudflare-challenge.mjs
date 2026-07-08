// Known page titles used by Cloudflare's Managed Challenge / "Just a moment..." interstitials.
// Matched as an anchored, case-insensitive prefix (see titleMatchesChallenge below), not a
// loose substring, since a substring match false-positives on legitimate pages that happen to
// contain the phrase (e.g. "Un momento para reflexionar", long CJK loading placeholders).
// The ambiguous Spanish/Portuguese "un momento"/"um momento" entries were dropped entirely:
// they are common phrase openers on legitimate pages, and real Cloudflare challenge pages in
// those locales are still caught by the _cf_chl_opt global, the /cdn-cgi/ path check, and the
// DOM marker checks below.
const CLOUDFLARE_CHALLENGE_TITLES = [
  'just a moment...',
  'attention required!',
  '请稍候',
  '請稍候',
  '正在验证',
  '正在執行安全驗證',
]

// How much slack (beyond the known phrase's own length) a title is allowed before it's
// considered a different, longer page title rather than the Cloudflare interstitial itself.
// This allows for trailing punctuation like '...' or '…' while rejecting titles that merely
// start with the phrase and then continue into unrelated marketing copy.
const TITLE_MATCH_SLACK = 3

/**
 * Anchored match: the trimmed, lowercased title must start with a known challenge phrase and
 * be no longer than that phrase plus a small slack for trailing ellipsis punctuation.
 * @param {string} title
 * @returns {boolean}
 */
function titleMatchesChallenge(title) {
  const normalized = title.trim().toLowerCase()
  return CLOUDFLARE_CHALLENGE_TITLES.some(
    (known) =>
      normalized.startsWith(known) && normalized.length <= known.length + TITLE_MATCH_SLACK,
  )
}

/**
 * Detects whether the current document is a Cloudflare Managed Challenge / Turnstile page.
 * Must stay defensive: this can run at document_start when document.body is still null,
 * and must never throw regardless of the page's DOM shape.
 * @returns {boolean}
 */
export function isCloudflareChallengePage() {
  try {
    if (
      typeof location !== 'undefined' &&
      typeof location.pathname === 'string' &&
      location.pathname.includes('/cdn-cgi/challenge-platform')
    ) {
      return true
    }

    if (typeof location !== 'undefined' && location.hostname === 'challenges.cloudflare.com') {
      return true
    }

    if (typeof window !== 'undefined' && window._cf_chl_opt !== undefined) {
      return true
    }

    if (typeof document !== 'undefined' && typeof document.title === 'string') {
      if (titleMatchesChallenge(document.title)) {
        return true
      }
    }

    if (typeof document !== 'undefined' && document.getElementById) {
      if (
        document.getElementById('challenge-form') ||
        document.getElementById('challenge-running')
      ) {
        return true
      }
    }

    if (typeof document !== 'undefined' && document.querySelector) {
      if (document.querySelector('#cf-challenge-running, .cf-turnstile, #turnstile-wrapper')) {
        return true
      }
    }
  } catch (error) {
    console.debug(
      '[is-cloudflare-challenge] Detection failed, assuming not a challenge page.',
      error,
    )
  }

  return false
}
