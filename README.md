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
- **Manual correction**: move existing records between categories without calling the model again.
- **Bulk deletion**: select multiple records, select all visible records, and delete in one action.
- **Layout modes**: choose between a full single-page layout and a navigation layout with separate sections.
- **Local-first storage**: browser storage, JSON files, or optional Memos integration.
- **PWA support**: install from supported browsers and use quick links such as `/?focus=capture`.
- **Desktop app**: Electron wrapper with a local-only server and a Quit button that stops the app process.
- **Import/export**: move data with a JSON migration package; API keys are not included in exports.

## Privacy Model

IdeaHub does not upload content by itself.

- Browser-only mode stores data in `localStorage`.
- Python server mode stores records in `data/items.json` and staged notes in `data/staged.json`.
- Desktop mode stores data in the operating system app data directory.
- Model providers receive text only when you click model test or submit the buffer.
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
MODEL_NAME=deepseek-chat
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

For local development, use:

```text
http://localhost:5173
```

For phone access on the same Wi-Fi, open the computer's LAN address, for example:

```text
http://192.168.1.20:5173
```

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

`POST /api/items` and `POST /api/classify` can return multiple `items` because the model may split one input into several records.

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
