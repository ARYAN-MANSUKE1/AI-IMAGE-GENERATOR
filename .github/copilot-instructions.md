# AI Studio Copilot Instructions

## Project Overview
React + TypeScript bulk image generation app using ClipDrop's text-to-image API. Processes entire folders of images (including nested directories) and generates AI images based on a single prompt. Supports two saving modes: direct filesystem write (via File System Access API) or ZIP download with preserved folder structure.

## Architecture

### State Management Pattern
All state managed via React `useState` in [App.tsx](App.tsx). Key state:
- `items: ProcessingItem[]` - Processing queue with status tracking
- `status: AppStatus` - Global app state ('idle' | 'scanning' | 'ready' | 'processing' | 'done')
- `directoryHandle` - File System Access API handle (determines save mode)
- `config: BatchConfig` - AI generation settings

### File Processing Flow
1. **Folder Selection** - Tries File System Access API first (`showDirectoryPicker`), falls back to standard file input
2. **Recursive Scanning** - `scanDirectory()` walks directory tree, creates `ProcessingItem` for each image
3. **Concurrent Processing** - `startBatch()` uses worker pattern with configurable concurrency (default 3)
4. **Save Strategy** - Direct write if `directoryHandle` exists, otherwise ZIP download via JSZip

### Critical Services

#### `services/gemini.ts`
- `generateImage()` - Calls ClipDrop API with retry logic (3 attempts with exponential backoff)
- Returns base64 data URL from blob response
- Monitors credits via response headers (`x-remaining-credits`)
- Expects `process.env.API_KEY` set at build time

#### `components/ImageCard.tsx`
- Displays original image with status overlay (processing/completed/error)
- Shows folder path using `relativePath` from `ProcessingItem`

## Key Conventions

### API Integration
ClipDrop API requires:
- Header: `x-api-key: <CLIPDROP_API_KEY>`
- FormData with `prompt` (max 1000 chars)
- Returns PNG blob (converted to base64 data URL)

API key sourced from `process.env.API_KEY` - must be set in build config.

### File System Patterns
Two modes based on browser capabilities:
1. **Modern (File System Access API)**: Read/write directly to disk, saves results as `{original}_studio.png` in same folder
2. **Fallback**: Upload-only via file input, downloads ZIP preserving folder structure

Detect mode: `(window as any).showDirectoryPicker` existence check

### Type Definitions ([types.ts](types.ts))
- `ProcessingItem` - Includes both FileSystemHandle references and File objects for compatibility
- `handle` and `parentHandle` are placeholders (`{} as any`) in fallback mode

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server (default: localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

## Known Issues & Quirks

1. **Security Restrictions**: File System Access API often blocked in iframes (shown in console screenshot) - fallback required
2. **Environment Variables**: Vite requires `process.env.*` replacement at build time (not runtime)
3. **Empty vite.config.ts**: Uses Vite defaults with React plugin
4. **Tailwind in Production Warning**: CDN link in [index.html](index.html) should be replaced with PostCSS setup for production

## Testing Approach
No test framework configured. Manual testing via:
- Small folder with 2-3 images
- Mixed folder structure (nested dirs)
- Error scenarios (invalid API key, network failures)

## Extension Points

### Adding New AI Models
Update `config.model` in [App.tsx](App.tsx) and modify `generateImage()` to handle model-specific API calls.

### Custom Image Processing
Add new processing functions in [services/gemini.ts](services/gemini.ts) following `resizeImageLocally()` pattern (canvas-based).

### UI Customization
All styling is inline Tailwind classes. Key theme colors:
- Primary: `indigo-600`
- Background: `slate-950/900/800`
- Success: `emerald-500`
- Error: `red-400`
