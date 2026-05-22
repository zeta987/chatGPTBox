Long time no see — here is another maintenance and feature release for ChatGPTBox.

This release continues maintaining the current ChatGPTBox codebase while the WXT rewrite is still in progress. Since v2.5.9, this version focuses on new model support, a more flexible OpenAI-compatible provider system, reliability fixes, security hardening, and a much stronger build/test foundation.

Existing custom API modes and API keys are migrated automatically, with legacy fields kept in sync for backward compatibility.

> Developer note: the minimum Node.js version for development and builds is now **Node.js 22+**. This does not affect normal browser-extension users.

## Changes

### Features

- Add a **Custom Provider Editor** for OpenAI-compatible API modes, allowing custom providers to be created and managed directly from settings instead of repeatedly entering custom URLs.
- Add a unified OpenAI-compatible provider registry covering OpenAI, DeepSeek, Kimi.Moonshot, OpenRouter, AI/ML, ChatGLM, Ollama, and legacy Custom Model modes.
- Add OpenRouter Auto Router and Free Models Router presets.
- Refresh AI/ML default model presets for newer representative models.

### New Models

- Add OpenAI GPT-5-family presets, including chat-latest, GPT-5, GPT-5.1, GPT-5.2, GPT-5.2 latest, GPT-5.3 latest, GPT-5.4, GPT-5.4 mini/nano, and GPT-5.5.
- Add Anthropic Claude Opus 4.1 / 4.5 / 4.6, Claude Sonnet 4.5 / 4.6, and Claude Haiku 4.5.
- Add OpenRouter Gemini 3 / 3.1 and updated Claude / Gemini / OpenAI model entries.
- Remove retired or unavailable OpenAI, Anthropic, OpenRouter, and AI/ML models to keep model lists cleaner.

### Improvements

- Refactor OpenAI-compatible provider execution into a shared core and provider registry, improving maintainability across OpenAI, DeepSeek, Kimi.Moonshot, OpenRouter, AI/ML, ChatGLM, Ollama, and custom APIs.
- Improve custom API mode migration and provider binding so existing API keys, custom modes, and saved conversations continue to work after the provider architecture refresh.
- Improve GPT-5-family token parameter handling with provider-aware request logic, especially for models that require `max_completion_tokens`.
- Improve model and provider display names, and align LLM provider naming with common industry terminology.
- Improve build performance and configurability with the updated Webpack / esbuild / thread-loader pipeline.
- Make static card initialization non-blocking.
- Improve background-script and content-script error handling for better runtime stability.

### Fixes

- Fix opening the side panel from context menu and shortcuts by preserving the required browser user gesture (#963).
- Fix ChatGPT access-token retrieval when `Browser.cookies` is unavailable in some environments (#965).
- Support the new Claude Web `sk-ant-sid02` session key format, as well as future numeric `sk-ant-sid` versions (#960).
- Fix Bilibili video summaries so null subtitle entries no longer become literal `"null"` strings.
- Fix invalid backup/import handling in popup settings to avoid broken or inconsistent configuration state.
- Fix site-adapter display-name casing, such as `GitHub` and `arXiv`.
- Fix various minor stability issues and edge cases.

### Security

- Harden `GET_COOKIE` message handling with sender authorization, payload validation, URL validation, and protocol/header checks.
- Guard proxy message forwarding and custom API mode overrides.
- Add sensitive-field redaction for background diagnostics and improve handling of circular or deeply nested objects.
- Update dependencies and apply npm audit fixes for security advisories.

### Chores / Developer Experience

- Upgrade the development requirement from Node.js 20 to Node.js 22.
- Add a Node.js unit-test baseline with browser shims.
- Expand test coverage across config migration, provider registry, API clients, popup logic, services, wrappers, and utilities.
- Add CI test/coverage workflows, PR checks, and README coverage badge updates.
- Update GitHub Actions dependencies such as checkout, setup-node, setup-python, cache, and upload-artifact.
- Refactor the build pipeline for better reliability and clearer failure handling.
- Remove the obsolete OpenAI balance-check feature because the old billing endpoint no longer provides reliable results.
- Improve AGENTS.md and reorganize test files.
- Apply various code formatting and maintenance cleanups.

## Contributors

A huge thank you to everyone who contributed to this release through code, bug reports, reviews, testing, and ideas.

**Full Changelog**: [v2.5.9...v2.6.0](https://github.com/ChatGPTBox-dev/chatGPTBox/compare/v2.5.9...v2.6.0)
