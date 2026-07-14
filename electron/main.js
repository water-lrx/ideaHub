const { app, BrowserWindow, ipcMain, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const CATEGORY_LABELS = new Set(["todo", "plan", "idea", "record", "archive"]);
const PRIORITIES = new Set(["high", "medium", "low"]);
const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", requiresKey: true },
  zhipu: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", requiresKey: true },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen3-8B", requiresKey: true },
  dashscope: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo", requiresKey: true },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", requiresKey: true },
  custom: { baseUrl: "http://localhost:11434/v1", model: "local-model", requiresKey: false },
};
const REPORT_STYLE_LABELS = {
  summary: "总结汇报",
  review: "复盘汇报",
  mentor: "导师汇报",
  custom: "自定义汇报",
};
const REPORT_PERIOD_LABELS = {
  day: "日报",
  week: "周报",
  month: "月报",
  year: "年报",
  custom: "自定义范围",
};
const REPORT_TONE_LABELS = {
  concise: "简洁正式",
  detailed: "详细完整",
  academic: "学术导师风",
  casual: "自然口语",
};

let mainWindow = null;
let localServer = null;
const MAX_LOG_ENTRIES = 300;

function utcNow() {
  return new Date().toISOString();
}

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function appRoot() {
  return app.getAppPath();
}

function dataDir() {
  return path.join(app.getPath("userData"), "data");
}

function dataFile() {
  return path.join(dataDir(), "items.json");
}

function stagedFile() {
  return path.join(dataDir(), "staged.json");
}

function configFile() {
  return path.join(dataDir(), "config.json");
}

function logFile() {
  return path.join(dataDir(), "logs.json");
}

function sanitizeLogText(value) {
  return String(value || "")
    .replace(/(authorization\s*[:=]\s*["']?bearer\s+)[^\s"']+/gi, "$1[已隐藏]")
    .replace(/(["']?apiKey["']?\s*[:=]\s*["'])[^"']+(["'])/gi, "$1[已隐藏]$2")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "sk-[已隐藏]")
    .slice(0, 12000);
}

function readLogs() {
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(logFile())) return [];
  try {
    const logs = JSON.parse(fs.readFileSync(logFile(), "utf8") || "[]");
    return Array.isArray(logs) ? logs.slice(0, MAX_LOG_ENTRIES) : [];
  } catch (_error) {
    return [];
  }
}

function writeLogs(logs) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(logFile(), JSON.stringify(logs.slice(0, MAX_LOG_ENTRIES), null, 2), "utf8");
}

function recordMainLog(level, source, message, error = null) {
  const details = error instanceof Error ? error.stack || error.message : error || "";
  const entry = {
    id: crypto.randomUUID(),
    level: ["error", "warn", "info"].includes(level) ? level : "info",
    source: sanitizeLogText(source || "桌面后端"),
    message: sanitizeLogText(message || "未知日志"),
    details: sanitizeLogText(details),
    createdAt: utcNow(),
  };
  try {
    writeLogs([entry, ...readLogs()]);
  } catch (writeError) {
    console.error("Failed to persist desktop log", writeError);
  }
}

function ensureDataFile() {
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(dataFile())) {
    fs.writeFileSync(dataFile(), "[]", "utf8");
  }
}

function readConfig() {
  fs.mkdirSync(dataDir(), { recursive: true });
  const defaults = {
    provider: "deepseek",
    baseUrl: PROVIDER_DEFAULTS.deepseek.baseUrl,
    model: PROVIDER_DEFAULTS.deepseek.model,
    apiKey: "",
    apiKeys: {},
  };
  if (!fs.existsSync(configFile())) return defaults;
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(configFile(), "utf8") || "{}"));
  } catch (error) {
    console.error("Failed to read config", error);
    recordMainLog("error", "配置读取", "读取模型配置失败", error);
    return defaults;
  }
}

function writeConfig(config = {}) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const saved = normalizeConfig(config);
  fs.writeFileSync(configFile(), JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

function normalizeConfig(config = {}) {
  let provider = String(config.provider === "local" ? "deepseek" : config.provider || "deepseek");
  if (!PROVIDER_DEFAULTS[provider]) provider = "custom";
  const hasApiKeyMap = config.apiKeys && typeof config.apiKeys === "object" && !Array.isArray(config.apiKeys);
  const apiKeys = hasApiKeyMap
    ? Object.fromEntries(Object.entries(config.apiKeys).map(([key, value]) => [key, String(value || "")]))
    : {};
  if (!hasApiKeyMap && config.apiKey) apiKeys[provider] = String(config.apiKey);
  const apiKey = apiKeys[provider] || String(config.apiKey || "");
  apiKeys[provider] = apiKey;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
  return {
    provider,
    baseUrl: String(config.baseUrl || defaults.baseUrl),
    model: String(config.model || defaults.model),
    apiKey,
    apiKeys,
  };
}

function readItems() {
  ensureDataFile();
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile(), "utf8") || "[]");
    return Array.isArray(raw) ? raw.map(normalizeItem) : [];
  } catch (error) {
    console.error("Failed to read items", error);
    recordMainLog("error", "记录读取", "读取已分类记录失败", error);
    return [];
  }
}

function writeItems(items) {
  ensureDataFile();
  const normalized = items.map(normalizeItem);
  fs.writeFileSync(dataFile(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function readStaged() {
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(stagedFile())) {
    fs.writeFileSync(stagedFile(), "[]", "utf8");
  }
  try {
    const raw = JSON.parse(fs.readFileSync(stagedFile(), "utf8") || "[]");
    return Array.isArray(raw) ? raw.map(normalizeStagedItem) : [];
  } catch (error) {
    console.error("Failed to read staged items", error);
    recordMainLog("error", "缓冲区读取", "读取缓冲区失败", error);
    return [];
  }
}

function writeStaged(items) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const normalized = items.map(normalizeStagedItem);
  fs.writeFileSync(stagedFile(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function trimText(value, max) {
  const text = String(value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function makeTitle(content) {
  const firstLine = String(content || "").split(/\n+/)[0]?.trim() || "";
  return trimText(firstLine.replace(/^(想法|计划|待办|记录)[:：]\s*/, ""), 24) || "未命名条目";
}

function summarize(content) {
  return trimText(String(content || "").replace(/\s+/g, " "), 70);
}

function normalizeDueDate(value) {
  const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return "";
  const [year, month, day] = match[0].split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? match[0] : "";
}

function normalizeItem(raw = {}) {
  const content = String(raw.content || "");
  const createdAt = raw.createdAt || raw.created_at || utcNow();
  const category = CATEGORY_LABELS.has(raw.category) ? raw.category : "record";
  const priority = PRIORITIES.has(raw.priority) ? raw.priority : "medium";
  const tags = Array.isArray(raw.tags) ? raw.tags.slice(0, 4).map(String) : [];
  return {
    id: String(raw.id || crypto.randomUUID()),
    title: trimText(String(raw.title || makeTitle(content)), 32),
    summary: trimText(String(raw.summary || summarize(content)), 110),
    content,
    category,
    priority,
    status: String(raw.status || "active"),
    source: String(raw.source || "缓冲区"),
    tags,
    dueDate: normalizeDueDate(raw.dueDate || raw.due_date),
    createdAt,
    updatedAt: raw.updatedAt || raw.updated_at || createdAt,
  };
}

function normalizeStagedItem(raw = {}) {
  return {
    id: String(raw.id || crypto.randomUUID()),
    content: String(raw.content || ""),
    createdAt: raw.createdAt || utcNow(),
  };
}

function parseModelJson(text) {
  const cleaned = String(text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model returned no JSON");
  return JSON.parse(match[0]);
}

function normalizeAnalysis(raw, originalContent) {
  const rawItems = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : raw ? [raw] : [];
  const seen = new Set();
  const items = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const content = String(item.content || originalContent || "").trim();
    if (!content || seen.has(content)) continue;
    seen.add(content);
    items.push({
      ...item,
      content,
      title: trimText(String(item.title || makeTitle(content)), 32),
      summary: trimText(String(item.summary || summarize(content)), 110),
      category: CATEGORY_LABELS.has(item.category) ? item.category : "record",
      priority: PRIORITIES.has(item.priority) ? item.priority : "medium",
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 4).map(String) : [],
      dueDate: normalizeDueDate(item.dueDate || item.due_date),
    });
  }
  if (!items.length) {
    throw new Error("model returned no valid items");
  }
  return items;
}

function analysisMessages(content) {
  const today = localDateKey();
  return [
    {
      role: "system",
      content:
        '你是个人与团队信息中台的内容拆分与分类器。用户可能一次输入多个互不相同的信息单元。先拆分成原子条目，再分别分类。只返回 JSON，不要 Markdown。返回格式必须是 {"items":[{"content":"","title":"","summary":"","category":"","priority":"","tags":[],"dueDate":""}]}. category 只能是 todo、plan、idea、record。priority 只能是 high、medium、low。dueDate 是代办或计划的发生日期/截止日期，必须用 YYYY-MM-DD；没有明确日期就返回空字符串。拆分规则：问答保持在同一条；公式/loss、问题、怀疑、待研究问题、论文摘录应拆成不同条；不要丢失原文关键信息。',
    },
    {
      role: "user",
      content: `今天是 ${today}。请拆分并分类下面内容；遇到“明天、后天、下周、下午、月底”等相对时间时，请相对今天解析 dueDate：\n\n${content}`,
    },
  ];
}

function reportItemLine(item, index) {
  const normalized = normalizeItem(item);
  const tags = normalized.tags.length ? ` 标签：${normalized.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  const due = normalized.dueDate ? ` 日程：${normalized.dueDate}` : "";
  const status = normalized.status === "done" ? "/已完成" : "";
  return [
    `${index + 1}. [${CATEGORY_LABELS_TEXT(normalized.category)}/${normalized.priority}${status}] ${normalized.title}`,
    `   日期：${normalized.dueDate || String(normalized.createdAt).slice(0, 10)} 来源：${normalized.source}${due}${tags}`,
    `   摘要：${normalized.summary}`,
    `   内容：${String(normalized.content || "").slice(0, 360)}`,
  ].join("\n");
}

function CATEGORY_LABELS_TEXT(category) {
  return { todo: "代办", plan: "计划", idea: "想法", record: "记录", archive: "归档" }[category] || category;
}

function reportMessages(reportRange = {}, items = [], options = {}) {
  const style = String(options.style || "summary");
  const tone = String(options.tone || "concise");
  const custom = String(options.customPrompt || "").trim();
  const styleInstruction = {
    summary: "输出一份阶段总结汇报，突出完成事项、重要进展、待跟进事项和下一步计划。",
    review: "输出一份复盘汇报，包含目标回顾、完成情况、亮点、问题、原因分析、改进动作和下一周期计划。",
    mentor: "输出一份适合发给导师/上级的汇报，表达清楚研究或工作进展、遇到的问题、需要反馈的点和下一步安排。",
    custom: custom || "按用户记录生成一份结构清晰的自定义汇报。",
  }[style] || "输出一份结构清晰的阶段汇报。";
  const content = items.map(reportItemLine).join("\n");
  return [
    {
      role: "system",
      content:
        "你是一个严谨的个人工作复盘与汇报助手。你只根据用户给出的记录生成中文汇报，不编造未出现的事实。可以进行归纳、合并和措辞优化。输出 Markdown，结构清晰，可直接复制给他人。",
    },
    {
      role: "user",
      content: [
        `汇报周期：${REPORT_PERIOD_LABELS[reportRange.period] || "自定义范围"}`,
        `日期范围：${reportRange.start} 至 ${reportRange.end}`,
        `汇报形式：${REPORT_STYLE_LABELS[style] || "汇报"}`,
        `语言风格：${REPORT_TONE_LABELS[tone] || "简洁正式"}`,
        custom ? `补充要求：${custom}` : "",
        `记录数量：${items.length}`,
        "",
        "请按以下要求生成：",
        styleInstruction,
        "请包含：标题、概览、分类进展、关键事项、问题/风险、下一步计划。若是导师汇报，请额外加入“需要请教/反馈的问题”。",
        "",
        "原始记录：",
        content,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

async function analyzeContent(content, requestConfig = {}) {
  const config = { ...readConfig(), ...requestConfig };
  const provider = config.provider || "deepseek";
  const baseUrl = config.baseUrl || "";
  const model = config.model || "";
  const apiKey = config.apiKey || "";

  ensureModelReady({ provider, baseUrl, model, apiKey });

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: analysisMessages(content),
    }),
  });
  if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  return normalizeAnalysis(parseModelJson(text), content);
}

async function generateReport(reportRange, items, options = {}, requestConfig = {}) {
  const config = { ...readConfig(), ...requestConfig };
  const provider = config.provider || "deepseek";
  const baseUrl = config.baseUrl || "";
  const model = config.model || "";
  const apiKey = config.apiKey || "";

  ensureModelReady({ provider, baseUrl, model, apiKey });

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: reportMessages(reportRange, items, options),
    }),
  });
  if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
  const data = await response.json();
  const text = String(data.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("model returned empty report");
  return text;
}

function ensureModelReady(config) {
  if (!config.provider || config.provider === "local" || !config.baseUrl || !config.model) {
    throw new Error("请先配置 DeepSeek 或兼容模型接口");
  }
  const defaults = PROVIDER_DEFAULTS[config.provider] || PROVIDER_DEFAULTS.custom;
  if (defaults.requiresKey && !config.apiKey) {
    throw new Error("请先填写 API Key");
  }
}

function isModelConfigured(config) {
  if (!config.provider || config.provider === "local" || !config.baseUrl || !config.model) return false;
  const defaults = PROVIDER_DEFAULTS[config.provider] || PROVIDER_DEFAULTS.custom;
  return !defaults.requiresKey || Boolean(config.apiKey);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, payload, status = 200) {
  const body = status === 204 ? "" : JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendError(response, status, message) {
  sendJson(response, { error: message }, status);
}

function mimeType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
  }[path.extname(filePath)] || "application/octet-stream";
}

function serveStatic(urlPath, response) {
  const requestPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const target = path.resolve(appRoot(), requestPath.replace(/^\/+/, ""));
  const root = path.resolve(appRoot());
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return sendError(response, 403, "forbidden");
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return sendError(response, 404, "not found");
  }
  const data = fs.readFileSync(target);
  const headers = {
    "Content-Type": mimeType(target),
    "Content-Length": data.length,
  };
  if ([".html", ".css", ".js", ".webmanifest"].includes(path.extname(target))) {
    headers["Cache-Control"] = "no-cache";
  }
  response.writeHead(200, headers);
  response.end(data);
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      const config = readConfig();
      return sendJson(response, {
        ok: true,
        store: "desktop-file",
        desktop: true,
        dataDir: dataDir(),
        config,
        modelConfigured: isModelConfigured(config),
        memosConfigured: false,
      });
    }
    if (request.method === "GET" && url.pathname === "/api/config") {
      return sendJson(response, { config: readConfig() });
    }
    if (request.method === "GET" && url.pathname === "/api/logs") {
      return sendJson(response, { logs: readLogs() });
    }
    if (request.method === "DELETE" && url.pathname === "/api/logs") {
      writeLogs([]);
      return sendJson(response, {}, 204);
    }
    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody(request);
      return sendJson(response, { config: writeConfig(body.config || body) });
    }
    if (request.method === "GET" && url.pathname === "/api/items") {
      return sendJson(response, { items: readItems() });
    }
    if (request.method === "GET" && url.pathname === "/api/staged") {
      return sendJson(response, { items: readStaged() });
    }
    if (request.method === "POST" && url.pathname === "/api/classify") {
      const body = await readBody(request);
      const items = await analyzeContent(String(body.content || ""), body.config || {});
      return sendJson(response, { result: items[0], items });
    }
    if (request.method === "POST" && url.pathname === "/api/report") {
      const body = await readBody(request);
      const report = await generateReport(body.range || {}, body.items || [], body.options || {}, body.config || {});
      return sendJson(response, { report });
    }
    if (request.method === "POST" && url.pathname === "/api/staged") {
      const body = await readBody(request);
      const content = String(body.content || "").trim();
      if (!content) return sendError(response, 400, "content is required");
      const current = readStaged();
      const item = normalizeStagedItem({ ...body, content, createdAt: utcNow() });
      writeStaged([item, ...current]);
      return sendJson(response, { item, items: [item, ...current] }, 201);
    }
    if (request.method === "POST" && url.pathname === "/api/staged/sync") {
      const body = await readBody(request);
      if (!Array.isArray(body.items)) return sendError(response, 400, "items must be an array");
      return sendJson(response, { items: writeStaged(body.items) });
    }
    if (request.method === "POST" && url.pathname === "/api/items") {
      const body = await readBody(request);
      const content = String(body.content || "").trim();
      if (!content) return sendError(response, 400, "content is required");
      const analyzed = await analyzeContent(content, body.config || {});
      const current = readItems();
      const created = analyzed.map((result) =>
        normalizeItem({
          ...result,
          source: body.source || "缓冲区",
          status: "active",
          createdAt: utcNow(),
        }),
      );
      writeItems([...created, ...current]);
      return sendJson(response, { item: created[0], items: created }, 201);
    }
    if (request.method === "POST" && url.pathname === "/api/import") {
      const body = await readBody(request);
      if (!Array.isArray(body.items)) return sendError(response, 400, "items must be an array");
      return sendJson(response, { items: writeItems(body.items) });
    }
    if (url.pathname.startsWith("/api/items/")) {
      const itemId = decodeURIComponent(url.pathname.replace("/api/items/", ""));
      const items = readItems();
      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) return sendError(response, 404, "item not found");
      if (request.method === "PATCH") {
        const patch = await readBody(request);
        items[index] = normalizeItem({ ...items[index], ...patch, id: itemId, updatedAt: utcNow() });
        writeItems(items);
        return sendJson(response, { item: items[index] });
      }
      if (request.method === "DELETE") {
        items.splice(index, 1);
        writeItems(items);
        return sendJson(response, {}, 204);
      }
    }
    if (url.pathname.startsWith("/api/staged/")) {
      const itemId = decodeURIComponent(url.pathname.replace("/api/staged/", ""));
      if (request.method === "DELETE") {
        writeStaged(readStaged().filter((item) => item.id !== itemId));
        return sendJson(response, {}, 204);
      }
    }
    return sendError(response, 404, "not found");
  } catch (error) {
    console.error(error);
    recordMainLog("error", "桌面 API", `${request.method} ${url.pathname} 处理失败`, error);
    return sendError(response, 500, error.message || "internal error");
  }
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        handleApi(request, response, url);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendError(response, 405, "method not allowed");
        return;
      }
      serveStatic(url.pathname, response);
    });
    server.on("error", (error) => {
      recordMainLog("error", "本地服务", "本地服务启动失败", error);
      reject(error);
    });
    server.listen(0, "127.0.0.1", () => {
      localServer = server;
      resolve(server.address().port);
    });
  });
}

async function createWindow() {
  const port = await startLocalServer();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 720,
    show: false,
    title: "IdeaHub",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    recordMainLog("error", "渲染进程", `界面进程异常退出：${details.reason}`, JSON.stringify(details));
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    recordMainLog("error", "页面加载", `页面加载失败：${errorCode} ${errorDescription}`, validatedURL);
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.handle("ideahub:quit", () => {
  app.quit();
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
