# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

- `npm run dev` - Start development mode with webpack watch
- `npm run build` - Build production bundle
- `npm run lint` - Run ESLint checks
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run pretty` - Format code with Prettier
- `npm run verify` - Verify search engine configurations
- `npm run analyze` - Analyze bundle size

## Testing
There is no test framework configured. Manual testing is required through browser extension development tools.

## Architecture Overview

This is a browser extension that integrates ChatGPT into web browsers. The codebase follows a typical browser extension architecture:

### Core Components
- **Background Script** (`src/background/`) - Service worker handling API requests and extension lifecycle
- **Content Scripts** (`src/content-script/`) - Injected into web pages to provide ChatGPT integration
- **Popup** (`src/popup/`) - Extension popup UI
- **Independent Panel** (`src/pages/IndependentPanel/`) - Standalone chat interface

### Key Services
- **API Services** (`src/services/`) - Handles different AI provider integrations (OpenAI, Claude, Bing, etc.)
- **Site Adapters** (`src/content-script/site-adapters/`) - Custom integrations for specific websites (GitHub, YouTube, Reddit, etc.)
- **Selection Tools** (`src/content-script/selection-tools/`) - Floating toolbar for text selection actions

### Technology Stack
- **Frontend**: Preact (aliased as React) with React-compatible libraries
- **Bundler**: Custom Webpack configuration (`build.mjs`)
- **Styling**: SCSS, Pico CSS framework
- **i18n**: i18next with support for 14 languages
- **Markdown**: react-markdown with KaTeX for math, rehype-highlight for code
- **Storage**: Chrome Storage API for persistence

### Development Workflow
1. Run `npm run dev` to start webpack in watch mode
2. Load the extension from `build/` directory in browser developer mode
3. Code changes auto-rebuild but require extension reload in browser
4. Use browser developer tools for debugging content scripts and background scripts

### Code Conventions
- Use single quotes, no semicolons (enforced by Prettier)
- 2-space indentation
- React components use `.jsx` extension
- Background scripts use `.mjs` extension
- Follow existing patterns for site adapters and selection tools when adding new integrations