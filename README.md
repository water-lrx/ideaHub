# IdeaHub

IdeaHub 是一个本地优先的信息收集与数字大屏项目。用户把想法、计划、代办、会议记录、灵感直接丢进收集箱，内容会先进入“想法缓冲区”；等用户点击“提交入库”时，系统再通过 DeepSeek 或 OpenAI-compatible API 统一拆分、分类并写入正式记录。

> 开源仓库只包含源码、示例配置和文档；不会提交本机记录、缓冲区数据、API Key、Memos token 或桌面端构建产物。

项目按“可迁移、可替换、可渐进增强”设计：

- 前端：PWA 单页应用，包含数字大屏和收集箱，不依赖构建工具。
- 后端：零第三方 Python 依赖，负责静态资源、AI 代理、数据持久化。
- 存储：正式记录默认写入 `data/items.json`，缓冲区写入 `data/staged.json`，配置 Memos 后正式记录可切换为 Memos。
- 模型：默认推荐 DeepSeek，也支持 OpenAI、Ollama、LM Studio 或任何兼容 `/v1/chat/completions` 的服务。

## 开源与脱敏

上传 GitHub 前请确认只提交源码文件。以下内容已经通过 `.gitignore` 排除：

- `.env`、`.env.*` 等本机环境变量文件。
- `data/*.json`，包括正式记录和缓冲区内容。
- `node_modules/`、`dist/`、`release-folders/` 等依赖和构建产物。
- `.DS_Store`、日志、压缩包、安装包等本机或生成文件。

推荐发布流程：

```bash
cp .env.example .env
# 只在本机 .env 中填写真实 API Key，不要提交 .env

git init
git add .
git status
git commit -m "Initial open-source release"
git branch -M main
git remote add origin https://github.com/<your-name>/ideahub.git
git push -u origin main
```

如果要发布可双击运行的桌面版，建议在 GitHub Releases 上传 `dist/` 或 `release-folders/` 里的产物，不要把这些二进制文件直接提交到源码仓库。

## 快速运行

### 桌面版双击使用

当前项目已经加入 Electron 桌面壳。打包后的应用自带 Chromium 和 Node 运行时，最终用户不需要安装 Python、Node 或浏览器扩展，直接双击即可打开。

如果你想要“不安装、复制文件夹就能运行”的绿色版，使用：

```bash
npm run folder:mac
npm run folder:win
```

本机可以整理绿色版目录：

```text
release-folders/
├── IdeaHub-mac-arm64/      # macOS Apple Silicon，双击 IdeaHub.app
└── IdeaHub-windows-x64/    # Windows x64，双击 IdeaHub.exe
```

Windows 版必须复制整个 `IdeaHub-windows-x64` 文件夹，不要只复制 `IdeaHub.exe`，因为旁边的运行时文件也是应用的一部分。

桌面版默认只监听 `127.0.0.1` 的随机端口，不暴露到局域网或公网；数据写入系统应用数据目录：

- macOS: `~/Library/Application Support/IdeaHub/data/items.json`
- Windows: `%APPDATA%\IdeaHub\data\items.json`
- Linux: `~/.config/IdeaHub/data/items.json`

桌面版右上角会显示「退出」按钮，点击后会调用 Electron 主进程退出应用，并关闭内置本地服务，不会继续在后台运行。

开发预览桌面版：

```bash
npm install
npm run desktop
```

生成当前系统安装包：

```bash
npm run build
```

按平台分别构建：

```bash
npm run build:mac      # macOS: dmg + zip
npm run build:win      # Windows: 安装包 + portable
npm run build:linux    # Linux: AppImage + deb
```

构建产物会输出到 `dist/`。跨系统打包最稳的方式是在对应系统上构建，或者用 GitHub Actions / CI 分别跑 macOS、Windows、Linux 三个任务。

### 浏览器/PWA 版

本地运行：

```bash
python3 server.py
```

然后访问：

```text
http://localhost:5173
```

纯静态试用也可以直接打开 `index.html`。这种模式会使用浏览器 `localStorage`，不会启用服务端代理和 Memos。

## PWA 多端访问

IdeaHub 现在可以作为 PWA 使用：

- 手机、平板、电脑访问同一个服务地址。
- 在 Chrome / Edge / Android 浏览器中可点击页面右上角「安装」。
- 在 iOS Safari 中使用「分享」-「添加到主屏幕」。
- 安装后可以像 App 一样从桌面打开。
- 已缓存的应用壳可以离线打开；新增和同步仍需要后端可访问。

本机开发时访问：

```text
http://localhost:5173
```

同一局域网手机访问时，用电脑的局域网 IP，例如：

```text
http://192.168.1.20:5173
```

正式部署到公网时建议使用 HTTPS；大多数浏览器只允许在 HTTPS 或 localhost 下完整启用 PWA 安装和 Service Worker。

PWA 快捷入口：

```text
/?focus=capture   # 打开后自动聚焦收集箱
/?mode=screen     # 打开后直接进入数字大屏模式
```

如果刚更新代码后页面还看不到新模块，通常是旧 PWA 缓存没有刷新。处理方式：

1. 在浏览器里刷新页面一次。
2. 如果仍然是旧界面，打开开发者工具的 Application / 应用面板，清除 Service Worker 和 Cache Storage。
3. 或者访问 `http://localhost:5173/?v=latest` 触发重新加载。

## Docker 运行

复制环境变量模板：

```bash
cp .env.example .env
```

填写 `.env` 里的 `MODEL_API_KEY`。DeepSeek 推荐配置：

```text
MODEL_PROVIDER=deepseek
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-chat
MODEL_API_KEY=你的 key
```

启动：

```bash
docker compose up -d --build
```

访问：

```text
IdeaHub: http://localhost:5173
Memos:   http://localhost:5230
```

## 接入 Memos

首次启动后，先访问 `http://localhost:5230` 初始化 Memos。随后在 Memos 中创建访问令牌，把令牌填入 `.env`：

```text
MEMOS_BASE_URL=http://memos:5230
MEMOS_ACCESS_TOKEN=你的 Memos token
```

重启 IdeaHub：

```bash
docker compose up -d --build ideahub
```

之后新增内容会写入 Memos，并附带 `#ideahub`、分类标签和隐藏 JSON 元数据。数字大屏会从 Memos 拉取这些条目。

## 功能

- 一键收集：输入任何自然语言内容，先进入想法缓冲区。
- 提交入库：点击「提交入库」后，才调用大模型统一拆分和分类。
- 自动拆分：一次提交多个问题、公式、怀疑、论文摘录时，会拆成多条记录分别入库。
- 智能分类：通过 DeepSeek / OpenAI-compatible API 自动识别 `代办`、`计划`、`想法`、`记录`。
- 优先级识别：输出 `high`、`medium`、`low`。
- 标签提取：由大模型输出标签。
- 数字大屏：统计指标、分类柱状图、今日推进、四象限看板、时间线。
- 日志日历：按月查看每天记录数量，点击日期筛选当天记录。
- 模型设置：右上角齿轮弹窗配置模型，不占用首屏工作区。
- 手动移动：已入库条目可以直接移动到其他分类，不需要重新调用模型。
- 本地优先：数据保存在本机；只有点击「提交入库」或「测试」时才会调用外部模型。
- 桌面退出：Electron 桌面版提供「退出」按钮，一键关闭窗口和内置本地服务。
- 状态流转：完成、归档、删除。
- 导入导出：JSON 迁移包，默认不导出 API Key。
- 双模式存储：浏览器本地、服务端 JSON、Memos 三种模式自动适配。
- PWA 安装：支持 manifest、Service Worker、桌面图标和快捷入口。

## 外网和手机访问

局域网访问只适合电脑在身边、手机和电脑连同一个 Wi-Fi 的场景。真正的多端使用，需要让 IdeaHub 后端有一个手机随时能访问的 HTTPS 地址。

只买域名还不够。域名只是一个好记的入口，完整链路还需要：

- 一台一直在线的机器：云服务器、NAS、家用服务器，或本机加隧道。
- DNS 解析：把域名指向服务器或隧道地址。
- HTTPS 证书：PWA 安装、Service Worker 和手机访问都更依赖 HTTPS。
- 反向代理：常用 Caddy / Nginx Proxy Manager / Cloudflare。
- 数据备份：至少备份 `data/`、`.env` 和 Memos volume。

推荐路线：

1. **云服务器 + 域名 + HTTPS**
   - 适合长期使用和团队使用。
   - 在 VPS / NAS / 家庭服务器上运行 `docker compose up -d --build`。
   - 用 Caddy、Nginx Proxy Manager 或 Cloudflare 代理配置 HTTPS。
   - 手机访问 `https://你的域名`，再添加到主屏幕。

2. **Cloudflare Tunnel / Tailscale Funnel**
   - 适合不想折腾公网 IP 和端口转发。
   - 本地或 NAS 运行 IdeaHub，再通过 Tunnel 暴露 HTTPS。
   - 优点是部署快，缺点是依赖第三方隧道服务。
   - 本项目已内置可选 `cloudflared` 服务，填好 `CLOUDFLARED_TOKEN` 后可运行：

```bash
docker compose --profile tunnel up -d --build
```

3. **Tailscale / ZeroTier 私有网络**
   - 适合个人使用，不想公开到公网。
   - 手机和电脑都装 Tailscale，用虚拟内网地址访问。
   - 安全性好，但每台设备都需要安装客户端。

当前项目最推荐第 1 条或第 2 条。PWA 安装、Service Worker、手机桌面快捷方式在 HTTPS 下体验最完整。

## 目录结构

```text
.
├── index.html          # 单页应用入口
├── styles.css          # 响应式界面和大屏样式
├── app.js              # 前端状态、分类调用、看板渲染
├── sw.js               # PWA 离线缓存和资源代理
├── manifest.webmanifest
├── icons/              # PWA 图标
├── electron/           # 桌面版主进程和预加载脚本
├── package.json        # Electron 打包配置
├── server.py           # 静态服务、AI 代理、JSON/Memos 存储适配
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── data/               # JSON 存储目录
```

## 迁移和备份

轻量迁移：

1. 在页面点击「导出」，得到 JSON 迁移包。
2. 在新设备部署 IdeaHub。
3. 点击「导入」恢复内容。

服务器迁移：

```bash
tar czf ideahub-backup.tgz data .env docker-compose.yml
```

如果使用 Memos，还需要备份 Docker volume：

```bash
docker run --rm -v ideahub_memos-data:/data -v "$PWD":/backup alpine tar czf /backup/memos-data.tgz /data
```

## API

IdeaHub 后端暴露以下接口：

- `GET /api/health`
- `GET /api/items`
- `POST /api/items`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`
- `POST /api/classify`
- `POST /api/import`

`POST /api/items` 和 `POST /api/classify` 都可能返回多条 `items`，用于承载一次混合输入拆出的多个原子条目；同时保留 `item` / `result` 字段作为单条兼容入口。

前端不会直接依赖 Memos API，而是通过 `server.py` 的存储适配层读写。以后把 Memos 替换成 SQLite、PostgreSQL、Supabase、PocketBase 或企业内部接口时，只需要替换后端 store。

## 设计取舍

当前版本把核心闭环先做完整：收集、拆分、分类、展示、迁移、部署。Memos 负责成熟的自托管记录底座，IdeaHub 专注 AI 拆分分类和大屏展示。这样既能快速落地，也保留了后续扩展空间，比如移动端快捷入口、团队权限、周期计划、Webhook、日历同步和多模型路由。
