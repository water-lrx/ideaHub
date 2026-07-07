const { app, BrowserWindow, ipcMain } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const CATEGORY_LABELS = new Set(["todo", "plan", "idea", "record", "archive"]);
const PRIORITIES = new Set(["high", "medium", "low"]);

let mainWindow = null;
let localServer = null;

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
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
    apiKey: "",
  };
  if (!fs.existsSync(configFile())) return defaults;
  try {
    const saved = { ...defaults, ...JSON.parse(fs.readFileSync(configFile(), "utf8") || "{}") };
    return saved.provider === "local" ? defaults : saved;
  } catch (error) {
    console.error("Failed to read config", error);
    return defaults;
  }
}

function writeConfig(config = {}) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const saved = {
    provider: String(config.provider === "local" ? "deepseek" : config.provider || "deepseek"),
    baseUrl: String(config.baseUrl || ""),
    model: String(config.model || ""),
    apiKey: String(config.apiKey || ""),
  };
  fs.writeFileSync(configFile(), JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

function readItems() {
  ensureDataFile();
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile(), "utf8") || "[]");
    return Array.isArray(raw) ? raw.map(normalizeItem) : [];
  } catch (error) {
    console.error("Failed to read items", error);
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

function ensureModelReady(config) {
  if (!config.provider || config.provider === "local" || !config.baseUrl || !config.model) {
    throw new Error("请先配置 DeepSeek 或兼容模型接口");
  }
  if (["deepseek", "openai"].includes(config.provider) && !config.apiKey) {
    throw new Error("请先填写 API Key");
  }
}

function isModelConfigured(config) {
  if (!config.provider || config.provider === "local" || !config.baseUrl || !config.model) return false;
  return !["deepseek", "openai"].includes(config.provider) || Boolean(config.apiKey);
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
    server.on("error", reject);
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
