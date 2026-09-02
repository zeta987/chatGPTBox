Here is another feature and maintenance release for ChatGPTBox.

This release adds four built-in API providers, refreshes major model presets, makes temperature overrides opt-in, and delivers a broad set of streaming, configuration, and browser-integration reliability improvements.

Existing API mode selections, custom provider settings, and API keys are migrated automatically.

> Compatibility note: `ChatGPT (Web)` is no longer enabled by default, because persistent login and unusual activity failures have made the reverse-engineered integration increasingly difficult to maintain reliably. Existing selections are preserved. The obsolete Poe Web integration has been removed, and existing Poe Web modes and sessions are no longer available.

## Changes

### Features

- Add **Google Gemini**, **xAI**, **NVIDIA NIM**, and **Mistral AI** as built-in OpenAI-compatible API providers, with dedicated API key setup and request routing.
- Add an explicit **Override provider temperature** setting. By default, `temperature` is omitted so each provider or model can use its own default, while known incompatible models never receive the parameter.

### New Models

- Add OpenAI GPT-5.6, including the GPT-5.6 Sol, Terra, and Luna tiers.
- Add Anthropic Claude Sonnet 5 and Claude Opus 5, with Claude Opus 5 as the default Opus-tier API option.
- Add xAI Grok 4.3, Grok 4.5, and Grok 4.6.
- Add Google Gemini 2.5 and 3.x model presets, with Gemini 3.1 Pro Preview and Gemini 3.7 Flash enabled by default.
- Add Mistral Medium / Small / Large and selected NVIDIA NIM models, including Nemotron 3 Super and Nemotron 3 Ultra.

### Improvements

- Refresh the default-enabled API modes with current OpenAI, Anthropic, Google, xAI, Mistral AI, NVIDIA NIM, and OpenRouter choices. OpenRouter Auto Router and Free Models Router are now enabled by default.
- Preserve configured API mode selections when defaults change, and allow future defaults to be added to customized mode lists without restoring choices that users previously removed.
- Allow custom provider endpoints to be edited, improve the provider editor, and preserve provider identity, API keys, and historical conversation routing when provider IDs are migrated or become reserved.
- Improve request error reporting by distinguishing invalid endpoints, request transport failures, and interrupted response streams, with localized and more actionable diagnostics.
- Improve Claude streaming and completion handling so refusals, response limits, token limits, and incomplete streams are reported correctly instead of appearing to finish successfully.
- Add ChatGPTBox app attribution headers to requests sent directly to OpenRouter, without forwarding them to third-party proxy endpoints.
- Improve input resizing on the independent conversation page with pointer and keyboard controls.

### Fixes

- Fix conversations remaining stuck on **Stop** when requests are slow, cancelled, or interrupted by a proxy-tab disconnect, while preserving partial streamed answers where possible (#995).
- Fix server-sent events being lost when CRLF delimiters are split across response chunks (#1036).
- Fix Enter used to confirm an IME candidate accidentally sending a message or stopping the current response (#1038).
- Fix rapid storage updates overwriting earlier configuration changes (#1037).
- Fix asynchronous edge cases involving background fetches, extension tab opening, **Close All Chats In This Page**, and deferred input focus (#1004, #1014, #1015, #1018).
- Fix Brave and DuckDuckGo integrations giving up before dynamically rendered search-result containers appear (#1016).
- Fix GitHub issue and pull request URL variants being missed or unnecessarily remounting summaries, and reject malformed nested thread paths (#1039, #1046).
- Fix fetch-based GitHub and GitLab analysis treating HTTP 4xx or 5xx error pages as valid content (#1035).

### Removed

- Remove the obsolete reverse-engineered Poe Web integration, including its models, sign-in flow, streaming, and session handling.

### Security

- Replace `jsonwebtoken` and its browser crypto polyfill chain with focused HS256 signing backed by `@noble/hashes`, reducing bundled crypto dependencies while preserving existing token behavior.
- Harden the Firefox metadata workflow against command injection by validating and safely passing manually supplied version values.
- Apply non-breaking npm audit updates for multiple transitive dependency advisories.

### Chores / Developer Experience

- Standardize Safari builds on the canonical ChatGPTBox name, make packaging reproducible from the committed lockfile, and add app-signature and DMG integrity verification to pull request CI.
- Add Firefox metadata recovery and update workflows, including retry handling while newly submitted AMO versions become available.
- Improve search-engine configuration verification reliability and execution limits without changing extension runtime behavior.
- Expand automated test coverage across configuration migration, provider routing, streaming, browser operations, and UI behavior.
- Refresh project documentation, privacy wording, translated READMEs, localization guidance, GitHub Actions dependencies, and maintenance automation.

## Contributors

A huge thank you to everyone who contributed to this release through code, bug reports, reviews, testing, and ideas.

**Full Changelog**: [v2.6.1...v2.7.0](https://github.com/ChatGPTBox-dev/chatGPTBox/compare/v2.6.1...v2.7.0)
