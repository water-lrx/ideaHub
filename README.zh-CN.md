# IdeaHub

中文文档 | [English](README.md)

IdeaHub 是一个本地优先的私人想法收集箱和数字大屏。它适合把临时想法、计划、代办、学习记录和碎片内容先全部丢进缓冲区，再通过兼容 OpenAI 接口的大模型统一拆分、整理和分类。

核心流程很简单：

1. 把所有内容先写进缓冲区。
2. 准备整理时点击 **入库**。
3. 模型会把混合输入拆成多条记录，并分类为代办、计划、想法或记录。
4. 在日历、看板、时间线和数字大屏中查看整理后的内容。

IdeaHub 面向个人知识管理和隐私场景设计。默认情况下，数据保存在本地设备。只有在测试模型配置或提交缓冲区进行分类时，才会调用外部模型接口。

## 功能特点

- **缓冲区优先**：先收集，再整理，不会每写一句就立刻入库。
- **AI 分类**：支持 DeepSeek，以及兼容 `/v1/chat/completions` 的 OpenAI、Ollama、LM Studio 等接口。
- **多内容拆分**：一段很长的混合记录可以被拆成多个代办、计划、想法和普通记录。
- **日历视图**：记录会展示在月历中；带有 `dueDate` 的代办和计划会在对应日期重点标记。
- **数字大屏**：展示统计、分类图表、优先事项、分类看板和时间线。
- **手动修正**：已经分类的记录可以手动移动到其他分类。
- **批量删除**：支持多选、一键全选和批量删除。
- **布局模式**：可以选择单页模式，也可以选择导航栏分区模式。
- **本地优先存储**：支持浏览器存储、JSON 文件存储，也可以选配 Memos。
- **PWA 支持**：可在支持的浏览器中安装，也支持 `/?focus=capture` 等快捷入口。
- **桌面应用**：Electron 桌面壳，默认只监听本机，并提供退出按钮，退出后不会继续留在后台运行。
- **导入导出**：通过 JSON 迁移文件备份或迁移数据；导出文件不会包含 API Key。

## 隐私模型

IdeaHub 不会主动上传你的内容。

- 浏览器静态模式使用 `localStorage`。
- Python 服务模式会把记录保存到 `data/items.json`，把缓冲区内容保存到 `data/staged.json`。
- 桌面模式会把数据保存在操作系统的应用数据目录。
- 只有点击模型测试或提交缓冲区分类时，文本才会发送给你配置的模型服务商。
- `.env`、本地数据文件、构建产物和桌面打包目录都已被 Git 忽略。

请不要提交真实 API Key、Memos Token、Cloudflare Tunnel Token 或个人 `data/*.json` 数据文件。

## 快速开始

### 下载桌面应用

普通用户请从 GitHub **Releases** 页面下载最新桌面文件夹包，不要下载源码 ZIP。

- macOS：下载 `IdeaHub-mac-*-folder.zip`，解压后双击 `IdeaHub.app`。
- Windows：下载 `IdeaHub-windows-x64-folder.zip`，解压后进入 `win-unpacked`，双击 `IdeaHub.exe`。
- Linux：下载 `IdeaHub-linux-x64-folder.tar.gz`，解压后运行 `linux-unpacked` 里的 `ideahub`。

GitHub 自动生成的 Source code ZIP 是给开发者看的，不包含 `IdeaHub.app` 或 `IdeaHub.exe`。

### 浏览器/PWA 模式

只用 Python 也可以启动：

```bash
python3 server.py
```

打开：

```text
http://localhost:5173
```

也可以直接打开 `index.html` 做静态体验。静态模式下数据保存在浏览器 `localStorage`，无法使用服务端模型代理或 Memos 存储。

### 桌面开发模式

安装依赖：

```bash
npm install
```

启动 Electron 桌面应用：

```bash
npm run desktop
```

桌面应用默认只监听 `127.0.0.1` 的随机本地端口，不会暴露局域网或公网服务。

桌面数据位置：

- macOS：`~/Library/Application Support/IdeaHub/data/items.json`
- Windows：`%APPDATA%\IdeaHub\data\items.json`
- Linux：`~/.config/IdeaHub/data/items.json`

### 构建桌面文件夹

生成未打包的桌面文件夹：

```bash
npm run folder:mac
npm run folder:win
npm run folder:linux
```

生成安装包或系统包：

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

构建产物会输出到 `dist/`。公开发布时，请把构建结果上传到 GitHub Releases，不要提交到源码仓库。

## 模型配置

如果使用 Python 或 Docker 服务，可以复制环境变量示例：

```bash
cp .env.example .env
```

DeepSeek 配置示例：

```text
MODEL_PROVIDER=deepseek
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-chat
MODEL_API_KEY=your_api_key
```

本地 OpenAI 兼容模型示例：

```text
MODEL_PROVIDER=custom
MODEL_BASE_URL=http://localhost:11434/v1
MODEL_NAME=your-local-model
MODEL_API_KEY=
```

也可以直接在应用的设置弹窗中配置服务商、Base URL、模型名称和 API Key。

## Docker

启动 IdeaHub 和 Memos：

```bash
cp .env.example .env
docker compose up -d --build
```

默认地址：

```text
IdeaHub: http://localhost:5173
Memos:   http://localhost:5230
```

如果要使用 Memos 作为记录存储，请先初始化 Memos，创建访问令牌，然后配置：

```text
MEMOS_BASE_URL=http://memos:5230
MEMOS_ACCESS_TOKEN=your_memos_token
```

重启 IdeaHub：

```bash
docker compose up -d --build ideahub
```

## PWA 和手机访问

本地开发时使用：

```text
http://localhost:5173
```

如果手机和电脑在同一个 Wi-Fi，可以打开电脑的局域网地址，例如：

```text
http://192.168.1.20:5173
```

长期手机访问建议部署在 HTTPS 后面。浏览器 PWA 安装和 Service Worker 在 HTTPS 或 localhost 下最稳定。

常用快捷入口：

```text
/?focus=capture   # 聚焦输入框
/?mode=screen     # 进入数字大屏模式
```

可选部署方式：

- VPS/NAS/家庭服务器 + 域名 + HTTPS 反向代理。
- Cloudflare Tunnel 或 Tailscale Funnel，用于快速 HTTPS 访问。
- Tailscale/ZeroTier，用于仅限私有设备访问。

如果你非常重视隐私，推荐优先使用桌面应用或本机局域网访问，不把服务暴露到公网。

## 数据迁移和备份

在应用中使用 **导出** 下载 JSON 迁移文件，然后在另一台设备上使用 **导入**。

服务端部署时可以备份：

```bash
tar czf ideahub-backup.tgz data .env docker-compose.yml
```

如果 Docker 中使用了 Memos，也要备份 Memos 数据卷。

## API

Python 服务提供以下接口：

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

`POST /api/items` 和 `POST /api/classify` 可能返回多条 `items`，因为模型可能会把一段输入拆分成多条记录。

## 项目结构

```text
.
├── index.html              # 应用页面
├── styles.css              # 响应式界面和大屏样式
├── app.js                  # 前端状态、模型调用和渲染逻辑
├── sw.js                   # PWA Service Worker
├── manifest.webmanifest    # PWA Manifest
├── icons/                  # PWA 图标
├── electron/               # Electron 主进程和 preload
├── server.py               # 静态服务、API 代理、JSON/Memos 存储
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── data/                   # 本地 JSON 存储目录，除 .gitkeep 外被忽略
```

## 开发检查

运行基础检查：

```bash
node --check app.js
node --check electron/main.js
python3 -m py_compile server.py
```

前端故意不引入构建步骤。Python 服务也只依赖标准库，方便迁移和本地使用。

## 许可证

MIT
