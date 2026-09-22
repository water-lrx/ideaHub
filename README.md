# IdeaHub

[中文文档](README.zh-CN.md) | English

IdeaHub is a local-first idea inbox and dashboard. It helps you capture messy thoughts first, then commit them into structured records with an OpenAI-compatible model such as DeepSeek, OpenAI, Ollama, or LM Studio.

The core workflow is intentionally simple:

1. Write everything into the buffer.
2. Click **Submit to Library** when you are ready.
3. The model splits mixed input into atomic records and classifies them as todos, plans, ideas, or notes.
4. Review the result in the calendar, dashboard, timeline, and category boards.

IdeaHub is designed for private personal knowledge work. Data stays on the local device by default. External model calls happen only when you test a model configuration or submit the buffer for classification.

## Features

- **Buffer-first capture**: raw thoughts are staged first instead of being classified immediately.
- **AI classification**: batch classify staged content with DeepSeek or any OpenAI-compatible `/v1/chat/completions` API.
- **Multi-item splitting**: one long mixed note can become multiple todos, plans, ideas, and records.
- **Calendar view**: records appear on a monthly calendar; todos and plans with `dueDate` are highlighted on their scheduled date.
- **Dashboard**: metrics, category chart, priority list, board columns, and timeline.
- **Workspace overview**: review the current category distribution and recently updated records in one place.
- **Periodic reports**: generate daily, weekly, monthly, yearly, or custom-range summaries, reviews, mentor updates, and custom reports.
- **Research radar**: scan local Markdown briefs and separately extract article ideas, transferable methods, experiment ideas, and source-backed evidence indexes.
- **Module toggles**: show or hide any top-level module from Settings so only the sections you need stay visible; the choice is stored locally.
- **Self-healing index**: when a brief is moved, renamed, or deleted, its index entry is marked **source file missing** and dropped from the pending queue instead of blocking analysis; re-match files or clean up the list from inside Research Radar.
- **Manual correction**: move existing records between categories without calling the model again.
- **Bulk deletion**: select multiple records, select all visible records, and delete in one action.
- **Layout modes**: choose between a full single-page layout and a navigation layout with separate sections.
- **Theme switching**: use light mode, dark mode, or follow the operating-system theme.
- **Per-provider credentials**: each model provider keeps its own API key instead of sharing one global key.
- **Local runtime logs**: inspect errors, warnings, and status information in the app; common API-key and authorization fields are redacted.
- **Local-first storage**: browser storage, JSON files, or optional Memos integration.
- **PWA support**: install from supported browsers and use quick links such as `/?focus=capture`.
- **Android phone support**: open the LAN address in mobile Chrome and use "Add to Home screen" as an app; the interface is adapted for phone touch targets, input zoom, and safe areas.
- **Desktop app**: Electron wrapper with a local-only server and a Quit button that stops the app process.
- **Import/export**: move data with a JSON migration package; API keys are not included in exports.

## Module Toggles

Every top-level feature is an independent module that can be shown or hidden from **Settings → 功能模块**:

| Module | Purpose |
| --- | --- |
| 收集箱 (Capture) | Quick capture, staging buffer, and record management (app entry point, always visible) |
| 日历 (Calendar) | Browse and schedule records by date |
| 概览 (Overview) | Category distribution and recent activity |
| 汇报 (Reports) | Generate periodic summaries and reports |
| 研究雷达 (Research Radar) | Scan brief folders and extract research leads |
| 分类看板 (Board) | Browse all records by category and status |
| 运行日志 (Logs) | Inspect runtime and error logs |

Hiding a module removes its navigation entry and hides the matching section. If you are currently viewing a module you just hid, the app returns to Capture. The choice is stored in your browser (`ideahub.ui.v1` in `localStorage`), so it does not affect other devices and never modifies or deletes data — re-enable it any time. Capture is always kept as the application entry point so you cannot lock yourself out.

## Privacy Model

IdeaHub does not upload content by itself.

- Browser-only mode stores data in `localStorage`.
- Python server mode stores records in `data/items.json` and staged notes in `data/staged.json`.
- Research document indexes and extracted findings are stored separately in `research.json` and never enter the normal idea library automatically.
- Desktop mode stores data in the operating system app data directory.
- Runtime logs stay on the local device and are excluded from exports; common credential and authorization fields are redacted.
- Research folder scanning, file hashing, and indexing happen locally.
- Model providers receive text only when you test a model, submit the buffer, or explicitly confirm analysis of selected research documents.
- `.env`, local data files, build outputs, and packaged desktop folders are ignored by Git.

Do not commit real API keys, Memos tokens, Cloudflare Tunnel tokens, or personal `data/*.json` files.

## Quick Start

### Download a Desktop App

For normal users, download the latest desktop folder package from the GitHub **Releases** page instead of downloading the source code ZIP.

- macOS: download `IdeaHub-mac-*-folder.zip`, unzip it, then double-click `IdeaHub.app`.
- Windows: download `IdeaHub-windows-x64-folder.zip`, unzip it, then double-click `IdeaHub.exe` inside `win-unpacked`.
- Linux: download `IdeaHub-linux-x64-folder.tar.gz`, extract it, then run the `ideahub` executable inside `linux-unpacked`.

The source code ZIP is for developers. It does not include `IdeaHub.app` or `IdeaHub.exe`.

### Browser/PWA Mode

IdeaHub can run with Python only:

```bash
python3 server.py
```

Open:

```text
http://localhost:5173
```

You can also open `index.html` directly for a static browser-only trial. In that mode, data is stored in browser `localStorage`, and server-side model proxying or Memos storage is not available.

### Desktop Development

Install dependencies:

```bash
npm install
```

Run the Electron desktop app:

```bash
npm run desktop
```

The desktop app listens only on `127.0.0.1` with a random local port and does not expose a LAN or public service.

Desktop data locations:

- macOS: `~/Library/Application Support/IdeaHub/data/items.json`
- Windows: `%APPDATA%\IdeaHub\data\items.json`
- Linux: `~/.config/IdeaHub/data/items.json`

The same directory contains `staged.json`, `research.json`, `config.json`, and `logs.json` for the buffer, research radar, model settings, and local logs.

## Research Radar

Research Radar is designed for daily Markdown briefs, paper-reading notes, and project research while keeping those findings separate from everyday captured ideas.

1. Open **Research Radar** in navigation mode.
2. In the desktop app, click **Choose Folder**. With the Python server, type a local directory path and click **Apply**.
3. Click **Scan Changes**. Scanning, title/date extraction, and SHA-256 hashing all happen locally.
4. Select documents and click **AI Analyze Selected**. Only the selected document bodies are sent after confirmation.
5. Review article ideas, transferable methods, experiment ideas, and evidence indexes. Each finding retains its source document, relative path, date, section, and excerpt.
6. Use **Transfer to Buffer** explicitly when a finding should enter the normal IdeaHub workflow.

When a source document changes, previous findings are marked stale until the document is analyzed again. At most 60,000 characters per document are sent to the model, and truncated long documents are labeled in the source list. Static `index.html` mode cannot read local directories; use the desktop app or `python3 server.py`.

### Missing Source Files and Clearing the Pending Queue

When a brief is moved, renamed, or deleted from the folder, its index entry does not stay stuck in the pending state:

- Opening Research Radar checks whether each indexed file still exists. Entries whose source is gone immediately become **source file missing** and leave the pending queue, so they no longer block analysis of other briefs.
- **Re-match Files** relinks briefs that were renamed or moved (for example re-exported with an emoji prefix) by normalized file name, returning them to the pending state.
- **Clean Up Missing** removes index entries whose source file no longer exists.
- **Clear Pending** empties the current pending queue without touching analyzed results.
- **Clear All** resets the entire brief index and extracted findings. It cannot be undone.

The matching endpoints are `POST /api/research/recover` and `POST /api/research/clear` with a `scope` of `missing`, `pending`, `analyzed`, `failed`, or `all`.

### Build Desktop Folders

Create unpacked desktop folders:

```bash
npm run folder:mac
npm run folder:win
npm run folder:linux
```

Build installers/packages:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Build outputs are written to `dist/`. For public releases, upload generated artifacts to GitHub Releases instead of committing them to the source repository.

## Model Configuration

Copy the example environment file if you use the Python or Docker server:

```bash
cp .env.example .env
```

DeepSeek-compatible configuration:

```text
MODEL_PROVIDER=deepseek
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-v4-flash
MODEL_API_KEY=your_api_key
```

OpenAI-compatible local model examples:

```text
MODEL_PROVIDER=custom
MODEL_BASE_URL=http://localhost:11434/v1
MODEL_NAME=your-local-model
MODEL_API_KEY=
```

You can also configure the provider, base URL, model name, and API key from the app settings dialog.

### Domestic Provider Presets

The settings dialog includes presets for several China-friendly OpenAI-compatible providers:

| Provider | Default model | Base URL | API key / console |
| --- | --- | --- | --- |
| DeepSeek | `deepseek-v4-flash` | `https://api.deepseek.com/v1` | [DeepSeek API Keys](https://platform.deepseek.com/api_keys) |
| Zhipu GLM | `glm-4-flash` | `https://open.bigmodel.cn/api/paas/v4` | [BigModel API Keys](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) |
| SiliconFlow | `Qwen/Qwen3-8B` | `https://api.siliconflow.cn/v1` | [SiliconFlow API Keys](https://cloud.siliconflow.cn/account/ak) |
| Alibaba Bailian / DashScope | `qwen-turbo` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | [Bailian Console](https://bailian.console.aliyun.com/) |

Free credits and free models change over time. Always check the provider console for the current quota, model availability, and pricing. If a provider changes its recommended model name or workspace URL, edit the **Model** or **Base URL** field in settings.

## Docker

Start IdeaHub and Memos:

```bash
cp .env.example .env
docker compose up -d --build
```

Default URLs:

```text
IdeaHub: http://localhost:5173
Memos:   http://localhost:5230
```

To use Memos as the record store, initialize Memos, create an access token, and set:

```text
MEMOS_BASE_URL=http://memos:5230
MEMOS_ACCESS_TOKEN=your_memos_token
```

Restart IdeaHub:

```bash
docker compose up -d --build ideahub
```

## PWA and Mobile Access

IdeaHub ships a built-in PWA, so it can be installed on an Android phone as an app without packaging a separate APK.

> **The desktop app cannot serve your phone.** The Electron build listens only on `127.0.0.1` and exposes no LAN service. Phone access requires `python3 server.py` (or Docker).

### Start the server on your computer

```bash
python3 server.py
```

It listens on `0.0.0.0:5173`. Find your computer's LAN address:

```bash
# macOS
ipconfig getifaddr en0
# Linux
hostname -I
# Windows
ipconfig
```

Assuming `192.168.1.20`, open this in Chrome on a phone joined to the same Wi-Fi:

```text
http://192.168.1.20:5173
```

If it does not load, check that your firewall allows port 5173 (macOS: System Settings → Network → Firewall).

### Installing on Android

1. Open the LAN address in Chrome.
2. Choose **Add to Home screen** (shown as "Install app" on some versions).
3. Launch it from the home-screen icon; it runs in a standalone window without browser chrome.

### Interface adaptation

Every control has a tap target of at least 44px, form fields use a 16px font so Android does not zoom on focus, and notch/gesture-bar `safe-area` insets are respected. On narrow screens, **single-page mode** is recommended; switch to **navigation mode** if you prefer switching modules from the top bar.

### HTTP and the Service Worker

Android Chrome treats only **HTTPS** and **localhost** as secure contexts. When you open `http://192.168.x.x:5173`:

- All application features work: capture, classification, calendar, overview, reports, and Research Radar.
- The Service Worker **cannot register**, so there is no offline cache and no full PWA install experience ("Add to Home screen" still works).

For offline caching or a complete install experience, put the server behind HTTPS:

- Cloudflare Tunnel or Tailscale Funnel for quick HTTPS.
- VPS/NAS + domain + HTTPS reverse proxy (Nginx, Caddy).
- Tailscale/ZeroTier for private-device-only access.

Note that Research Radar reads brief folders from local disk, so from your phone it analyzes the files on **the computer running `server.py`**.

For long-term mobile use, deploy behind HTTPS. Browser PWA installation and Service Worker behavior are most reliable on HTTPS or localhost.

Useful shortcuts:

```text
/?focus=capture   # focus the capture box
/?mode=screen     # start in dashboard screen mode
```

Deployment options:

- VPS/NAS/home server + domain + HTTPS reverse proxy.
- Cloudflare Tunnel or Tailscale Funnel for quick HTTPS access.
- Tailscale/ZeroTier for private-device-only access.

## Data Migration and Backup

In the app, use **Export** to download a JSON migration file, then **Import** on another device.

Migration packages retain research findings and relative source paths while removing absolute folder paths. On a new device, select the matching brief root folder and scan again to restore file associations. Exports contain neither API keys nor source Markdown bodies.

For server deployments, back up:

```bash
tar czf ideahub-backup.tgz data .env docker-compose.yml
```

If you use Memos with Docker, also back up the Memos volume.

## API

The Python server exposes:

- `GET /api/health`
- `GET /api/items`
- `POST /api/items`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`
- `GET /api/staged`
- `POST /api/staged`
- `POST /api/staged/sync`
- `DELETE /api/staged/:id`
- `POST /api/classify`
- `POST /api/import`
- `GET /api/research`
- `POST /api/research/settings`
- `POST /api/research/scan`
- `POST /api/research/analyze`
- `POST /api/research/recover`
- `POST /api/research/clear`
- `POST /api/research/import`
- `PATCH /api/research/insights/:id`
- `DELETE /api/research/insights/:id`

`POST /api/items` and `POST /api/classify` can return multiple `items` because the model may split one input into several records.

`GET /api/research` verifies that each indexed file still exists before responding, so vanished files are reported as `missing` immediately instead of occupying the pending queue.

`POST /api/research/clear` accepts `{"scope": "missing" | "pending" | "analyzed" | "failed" | "all"}`, defaults to `missing`, and returns `{"research": ..., "removed": n, "scope": ...}`.

## Project Structure

```text
.
├── index.html              # App shell
├── styles.css              # Responsive UI and dashboard styles
├── app.js                  # Frontend state, model calls, rendering
├── sw.js                   # PWA service worker
├── manifest.webmanifest    # PWA manifest
├── icons/                  # PWA icons
├── electron/               # Electron main process and preload
├── server.py               # Static server, API proxy, JSON/Memos storage
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── data/                   # Local JSON storage directory, ignored except .gitkeep
```

## Development Notes

Run basic checks:

```bash
node --check app.js
node --check electron/main.js
python3 -m py_compile server.py
```

The frontend intentionally avoids a build step. The Python server intentionally uses only the standard library.

## License

MIT
