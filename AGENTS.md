# AGENTS.md — SuperBar

Chrome Extension (Manifest V3), TypeScript, Webpack. No tests.

## Commands

```bash
npm run dev          # webpack --watch, outputs to dist/
npm run build        # clean + webpack production build
npm run type-check   # tsc --noEmit (no emit, just validation)
npm run lint         # eslint src/ (.ts only)
```

Verify before declaring done: `npm run type-check && npm run lint`.

## Architecture

- `src/background.ts` — service worker (init, keyboard shortcut, action click → opens search-overlay window)
- `src/pages/search-overlay.ts` — main command-palette UI (popup window 600×500)
- `src/pages/settings.ts` — options page (triggered on first install)
- `src/pages/popup.ts` — toolbar popup
- `src/content-script.ts` — stub only, not used (popup-only architecture)
- `src/utils.ts` — shared utilities (bookmark usage tracking)
- `public/` — static assets copied verbatim to `dist/` (manifest.json, HTML, CSS)

## Key facts

- Keyboard shortcut: `Ctrl+Shift+K` / `Cmd+Shift+K` opens search-overlay as a detached popup window (not injected into pages).
- Config stored in `chrome.storage.local` under key `superbarConfig`.
- Default config: `{ enabled, searchEngines: ['google'], showBookmarkPath, excludedFolderNames }`.
- Permissions: `storage`, `bookmarks`, `commands`, `windows`, `tabs`, `history`.
- `manifest.json` lives in `public/` (not `src/`), gets copied by CopyPlugin.
- `package.json` uses `"type": "module"` — webpack config is ESM (`export default`).
- No eslintrc in repo root; lint config may be missing — add one if linting fails.

## Load extension in Chrome

1. `npm run build`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `dist/`
