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
- **工作概览**：集中查看当前分类分布和最近更新的记录。
- **阶段汇报**：按日、周、月、年或自定义时间范围生成总结、复盘、导师或自定义汇报。
- **研究雷达**：扫描本地 Markdown 简报，分别提取文章 Idea、可借鉴思路、实验思路和带来源的证据索引。
- **模块开关**：在设置里显示或隐藏任意功能模块，只保留自己需要的入口；设置保存在本机浏览器中。
- **索引自动校正**：简报源文件被移动、改名或删除后，索引会自动标记为「源文件缺失」并移出待分析列表，不会再卡住分析流程；可在研究雷达内重新匹配文件或一键清理。
- **手动修正**：已经分类的记录可以手动移动到其他分类。
- **批量删除**：支持多选、一键全选和批量删除。
- **布局模式**：可以选择单页模式，也可以选择导航栏分区模式。
- **主题切换**：支持浅色、深色和跟随系统三种主题。
- **独立模型配置**：不同模型服务商分别保存自己的 API Key，切换服务商时不会相互覆盖。
- **本地运行日志**：在应用内查看错误、警告和运行信息；日志会隐藏常见 API Key 和授权字段。
- **本地优先存储**：支持浏览器存储、JSON 文件存储，也可以选配 Memos。
- **PWA 支持**：可在支持的浏览器中安装，也支持 `/?focus=capture` 等快捷入口。
- **安卓手机可用**：通过局域网地址在手机 Chrome 中打开并「添加到主屏幕」，即可当作应用使用；界面已按手机屏幕适配触控尺寸、输入缩放和安全区。
- **桌面应用**：Electron 桌面壳，默认只监听本机，并提供退出按钮，退出后不会继续留在后台运行。
- **导入导出**：通过 JSON 迁移文件备份或迁移数据；导出文件不会包含 API Key。

## 模块化开关

IdeaHub 的每个一级功能都是一个独立模块，可以在 **设置 → 功能模块** 中随时显示或隐藏：

| 模块 | 说明 |
| --- | --- |
| 收集箱 | 快速记录、缓冲区与条目管理（应用入口，始终显示） |
| 日历 | 按日期查看和安排记录 |
| 概览 | 分类统计与最近动态 |
| 汇报 | 按周期生成工作总结与汇报 |
| 研究雷达 | 扫描简报目录并提取研究线索 |
| 分类看板 | 按分类和状态浏览全部条目 |
| 运行日志 | 查看应用运行与错误记录 |

隐藏模块后，它的导航入口不再显示，对应的界面区块也会一起隐藏；如果当前正停留在被隐藏的模块上，会自动回到收集箱。开关状态保存在本机浏览器（`localStorage` 的 `ideahub.ui.v1`），不影响其他设备，也不会修改或删除任何数据——重新打开即可恢复。收集箱作为应用入口始终保留，避免把自己锁在外面。

## 隐私模型

IdeaHub 不会主动上传你的内容。

- 浏览器静态模式使用 `localStorage`。
- Python 服务模式会把记录保存到 `data/items.json`，把缓冲区内容保存到 `data/staged.json`。
- 研究雷达的文档索引和提取结果单独保存在 `research.json`，不会自动混入普通记录。
- 桌面模式会把数据保存在操作系统的应用数据目录。
- 运行日志只保存在本机，不会随导出包上传；常见密钥和授权字段会被隐藏。
- 研究雷达扫描目录、计算文件哈希和建立索引都只在本机进行。
- 只有点击模型测试、提交缓冲区分类，或确认“AI 提取所选”后，对应文本才会发送给你配置的模型服务商。
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

同一目录下的 `staged.json`、`research.json`、`config.json` 和 `logs.json` 分别保存缓冲区、研究雷达、模型配置和本地日志。

## 研究雷达

研究雷达适合处理每天积累的 Markdown 简报、论文阅读记录或项目调研笔记，并与日常想法库保持隔离。

1. 在导航模式中打开 **研究雷达**。
2. 桌面版点击 **选择目录**；Python 服务模式直接填写本机目录路径并点击 **应用**。
3. 点击 **扫描变化**。扫描、标题/日期读取和 SHA-256 文件哈希都在本机完成。
4. 勾选准备分析的文档，再点击 **AI 提取所选**。确认后，只有所选文档正文会发送给当前模型。
5. 分别查看文章 Idea、可借鉴思路、实验思路和证据索引。每条结果都保留来源文档、相对路径、日期、章节和原文摘录。
6. 需要进入日常流程的结果必须手动点击 **转入缓冲区**，之后才会参与普通分类。

文档修改后，旧提取结果会标记为“来源已更新”，提醒重新分析。单篇文档发送给模型的内容上限为 60,000 个字符，长文会在来源列表中显示截取状态。纯静态 `index.html` 模式不能读取本地目录，请使用桌面版或 `python3 server.py`。

### 源文件缺失与待分析列表清理

简报目录里的文件被移动、改名或删除后，索引不会一直停留在旧的“待分析”状态：

- 打开研究雷达时，应用会核对每一条索引对应的源文件是否还存在。已经消失的条目会立即变成 **源文件缺失**，并自动移出待分析列表，不再阻塞其他简报的分析。
- **重新匹配文件**：简报被改名或移动后（例如重新导出时文件名多了 emoji 前缀），按归一化文件名重新关联，可恢复为待分析状态。
- **清理失效条目**：删除所有源文件已不存在的索引条目。
- **清空待分析**：清空当前待分析列表，但不影响已分析的结果。
- **清空全部索引**：重置整个简报索引及已提取的研究发现，操作不可撤销。

对应的接口是 `POST /api/research/recover` 和 `POST /api/research/clear`（`scope` 可选 `missing`、`pending`、`analyzed`、`failed`、`all`）。

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
MODEL_NAME=deepseek-v4-flash
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

### 国内模型平台预设

设置弹窗内置了几个国内访问相对友好的 OpenAI 兼容平台预设：

| 平台 | 默认模型 | Base URL | API Key / 控制台 |
| --- | --- | --- | --- |
| DeepSeek | `deepseek-v4-flash` | `https://api.deepseek.com/v1` | [DeepSeek API Keys](https://platform.deepseek.com/api_keys) |
| 智谱 GLM | `glm-4-flash` | `https://open.bigmodel.cn/api/paas/v4` | [BigModel API Keys](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) |
| 硅基流动 | `Qwen/Qwen3-8B` | `https://api.siliconflow.cn/v1` | [SiliconFlow API Keys](https://cloud.siliconflow.cn/account/ak) |
| 阿里百炼 / DashScope | `qwen-turbo` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | [百炼控制台](https://bailian.console.aliyun.com/) |

免费额度和免费模型会随平台策略变化。请以对应控制台显示为准。如果平台调整了推荐模型名或 Workspace URL，可以直接在设置里修改 **模型** 或 **Base URL**。

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

IdeaHub 内置 PWA，可以直接在安卓手机上作为应用安装，不需要单独打包 APK。

> **注意：桌面版不能给手机用。** Electron 桌面版只监听 `127.0.0.1`，不对外提供局域网服务。手机端必须通过 `python3 server.py`（或 Docker）来访问。

### 在电脑上启动服务

```bash
python3 server.py
```

服务默认监听 `0.0.0.0:5173`。先查一下电脑的局域网 IP：

```bash
# macOS
ipconfig getifaddr en0
# Linux
hostname -I
# Windows
ipconfig
```

假设得到 `192.168.1.20`，手机和电脑连同一个 Wi-Fi 后，用手机 Chrome 打开：

```text
http://192.168.1.20:5173
```

如果打不开，检查电脑防火墙是否放行了 5173 端口（macOS：系统设置 → 网络 → 防火墙）。

### 在安卓上安装

1. 用 Chrome 打开上面的局域网地址。
2. 点击右上角菜单里的 **添加到主屏幕**（部分版本显示为「安装应用」）。
3. 安装后从桌面图标启动，会以独立窗口运行，没有浏览器地址栏。

### 界面适配

所有按钮的点击区域不小于 44px，输入框使用 16px 字号以避免安卓自动缩放，并处理了刘海屏和手势条的 `safe-area` 内边距。窄屏下建议在设置里选择 **单页模式**；如需顶部切换模块，可选择 **导航栏模式**。

### 关于 HTTP 和 Service Worker

安卓 Chrome 只把 **HTTPS** 和 **localhost** 视为安全上下文。通过 `http://192.168.x.x:5173` 访问时：

- 应用功能**完全可用**：记录、分类、日历、概览、汇报、研究雷达都能正常使用。
- Service Worker **无法注册**，因此没有离线缓存，也不会有完整的 PWA 安装体验（但「添加到主屏幕」仍然可用）。

如果你需要离线缓存或完整安装体验，请把服务部署在 HTTPS 后面，例如：

- Cloudflare Tunnel 或 Tailscale Funnel 提供快速 HTTPS。
- VPS/NAS + 域名 + HTTPS 反向代理（Nginx、Caddy）。
- Tailscale/ZeroTier 仅限私有设备访问。

需要注意：研究雷达需要读取电脑本地磁盘上的简报目录，所以手机端使用时，分析的是**运行 `server.py` 那台电脑上**的文件。

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

迁移包会保留研究结果和来源的相对路径，但会移除简报目录的绝对路径。换设备后重新选择对应的简报根目录并扫描，即可恢复文件关联。导出包不包含 API Key，也不包含简报原文。

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
- `GET /api/research`
- `POST /api/research/settings`
- `POST /api/research/scan`
- `POST /api/research/analyze`
- `POST /api/research/recover`
- `POST /api/research/clear`
- `POST /api/research/import`
- `PATCH /api/research/insights/:id`
- `DELETE /api/research/insights/:id`

`POST /api/items` 和 `POST /api/classify` 可能返回多条 `items`，因为模型可能会把一段输入拆分成多条记录。

`GET /api/research` 返回索引前会先核对文件是否仍然存在，因此消失的文件会立即显示为 `missing`，不会一直占用待分析列表。

`POST /api/research/clear` 接受 `{"scope": "missing" | "pending" | "analyzed" | "failed" | "all"}`，默认 `missing`，返回 `{"research": ..., "removed": n, "scope": ...}`。

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
