const STORAGE_KEY = "ideahub.items.v1";
const STAGED_KEY = "ideahub.staged.v1";
const CONFIG_KEY = "ideahub.config.v1";
const UI_CONFIG_KEY = "ideahub.ui.v1";
const SYSTEM_DARK_QUERY = window.matchMedia?.("(prefers-color-scheme: dark)");

const CATEGORY_LABELS = {
  todo: "代办",
  plan: "计划",
  idea: "想法",
  record: "记录",
  archive: "归档",
};

const CATEGORY_COLORS = {
  todo: "#b34258",
  plan: "#4252a2",
  idea: "#a76112",
  record: "#13798a",
  archive: "#607080",
};

const DEFAULT_CONFIG = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-v4-flash",
  apiKey: "",
};

const PROVIDER_DEFAULTS = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
    label: "DeepSeek",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    note: "推荐默认服务商。打开链接创建 API Key 后粘贴到下方。",
    requiresKey: true,
  },
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    label: "智谱 GLM",
    apiKeyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    note: "适合想先试用免费 Flash 模型的用户，额度和免费模型以智谱控制台为准。",
    requiresKey: true,
  },
  siliconflow: {
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-8B",
    label: "硅基流动",
    apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
    note: "聚合多种国产和开源模型，常见免费额度或免费模型以控制台为准。",
    requiresKey: true,
  },
  dashscope: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
    label: "阿里百炼 Qwen",
    apiKeyUrl: "https://bailian.console.aliyun.com/",
    note: "百炼支持 OpenAI 兼容模式；新控制台若要求 Workspace URL，请按页面提示替换 Base URL。",
    requiresKey: true,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    label: "OpenAI",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    note: "适合已有 OpenAI API Key 的用户。",
    requiresKey: true,
  },
  custom: {
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
    label: "自定义接口",
    apiKeyUrl: "",
    note: "用于 Ollama、LM Studio 或其他 OpenAI 兼容服务；本地服务通常可以不填 API Key。",
    requiresKey: false,
  },
};

const PROVIDER_LABELS = Object.fromEntries(Object.entries(PROVIDER_DEFAULTS).map(([key, value]) => [key, value.label]));
PROVIDER_LABELS.local = "未配置模型";

const sampleItems = [
  {
    id: "sample-1",
    title: "完成项目首页和数据导入导出",
    summary: "把最小可用版本先跑起来，确认成员可以通过浏览器收集信息。",
    content: "明天把项目首页、导入导出、模型配置完成，先让团队试用一周。",
    category: "todo",
    priority: "high",
    status: "active",
    source: "项目",
    tags: ["MVP", "迁移"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "sample-2",
    title: "移动端快速输入",
    summary: "手机端打开后可以像备忘录一样把内容丢进收集箱。",
    content: "想法：做一个移动端快捷入口，最好能像备忘录一样随手打开就写。",
    category: "idea",
    priority: "medium",
    status: "active",
    source: "缓冲区",
    tags: ["移动端", "体验"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
  },
  {
    id: "sample-3",
    title: "周会记录：分类字段要可调整",
    summary: "分类不能写死，后续要允许团队扩展新的模块。",
    content: "周会记录：大家希望分类标签以后可以自定义，比如客户反馈、风险、素材。",
    category: "record",
    priority: "low",
    status: "active",
    source: "会议",
    tags: ["周会", "分类"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "sample-4",
    title: "下月迁移到团队服务器",
    summary: "保持静态文件和 JSON 数据结构，后续可以接数据库或对象存储。",
    content: "计划：下个月把当前版本迁移到团队服务器，要求部署简单、数据可备份。",
    category: "plan",
    priority: "medium",
    status: "active",
    source: "项目",
    tags: ["部署", "备份"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
];

const state = {
  items: [],
  staged: [],
  config: loadConfig(),
  ui: loadUiConfig(),
  filter: "all",
  query: "",
  selectedIds: new Set(),
  installPrompt: null,
  calendarDate: startOfMonth(new Date()),
  selectedDate: "",
  backend: {
    available: false,
    store: "browser",
    modelConfigured: false,
    memosConfigured: false,
  },
};

const els = {
  captureForm: document.querySelector("#captureForm"),
  captureInput: document.querySelector("#captureInput"),
  stageCount: document.querySelector("#stageCount"),
  stagingList: document.querySelector("#stagingList"),
  commitBufferBtn: document.querySelector("#commitBufferBtn"),
  clearBufferBtn: document.querySelector("#clearBufferBtn"),
  appNav: document.querySelector("#appNav"),
  providerSelect: document.querySelector("#providerSelect"),
  modelInput: document.querySelector("#modelInput"),
  baseUrlInput: document.querySelector("#baseUrlInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  providerHelp: document.querySelector("#providerHelp"),
  layoutModeSelect: document.querySelector("#layoutModeSelect"),
  themeModeSelect: document.querySelector("#themeModeSelect"),
  saveConfigBtn: document.querySelector("#saveConfigBtn"),
  testModelBtn: document.querySelector("#testModelBtn"),
  modelTestResult: document.querySelector("#modelTestResult"),
  modelStatus: document.querySelector("#modelStatus"),
  todoCount: document.querySelector("#todoCount"),
  planCount: document.querySelector("#planCount"),
  ideaCount: document.querySelector("#ideaCount"),
  recordCount: document.querySelector("#recordCount"),
  priorityList: document.querySelector("#priorityList"),
  todoList: document.querySelector("#todoList"),
  planList: document.querySelector("#planList"),
  ideaList: document.querySelector("#ideaList"),
  recordList: document.querySelector("#recordList"),
  timelineList: document.querySelector("#timelineList"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  calendarSelectedLabel: document.querySelector("#calendarSelectedLabel"),
  calendarSelectedCount: document.querySelector("#calendarSelectedCount"),
  calendarDayList: document.querySelector("#calendarDayList"),
  calendarPrevBtn: document.querySelector("#calendarPrevBtn"),
  calendarNextBtn: document.querySelector("#calendarNextBtn"),
  calendarTodayBtn: document.querySelector("#calendarTodayBtn"),
  calendarClearBtn: document.querySelector("#calendarClearBtn"),
  selectionCount: document.querySelector("#selectionCount"),
  selectAllBtn: document.querySelector("#selectAllBtn"),
  clearSelectionBtn: document.querySelector("#clearSelectionBtn"),
  deleteSelectedBtn: document.querySelector("#deleteSelectedBtn"),
  searchInput: document.querySelector("#searchInput"),
  filterSelect: document.querySelector("#filterSelect"),
  clearDoneBtn: document.querySelector("#clearDoneBtn"),
  categoryChart: document.querySelector("#categoryChart"),
  toast: document.querySelector("#toast"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  screenModeBtn: document.querySelector("#screenModeBtn"),
  modelSettingsBtn: document.querySelector("#modelSettingsBtn"),
  installBtn: document.querySelector("#installBtn"),
  quitAppBtn: document.querySelector("#quitAppBtn"),
  syncHint: document.querySelector("#syncHint"),
  connectionStatus: document.querySelector("#connectionStatus"),
  modelModal: document.querySelector("#modelModal"),
  modelModalCloseBtn: document.querySelector("#modelModalCloseBtn"),
  detailModal: document.querySelector("#detailModal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalCategory: document.querySelector("#modalCategory"),
  modalMeta: document.querySelector("#modalMeta"),
  modalContent: document.querySelector("#modalContent"),
  modalCloseBtn: document.querySelector("#modalCloseBtn"),
};

start();

async function start() {
  initDesktopShell();
  registerPwa();
  hydrateConfigForm();
  bindEvents();
  await bootstrapData();
  render();
  applyLaunchParams();
  updateConnectionStatus();
}

function initDesktopShell() {
  if (!window.ideahubDesktop?.isDesktop) return;
  document.body.classList.add("desktop-shell");
  if (els.quitAppBtn) els.quitAppBtn.hidden = false;
}

async function bootstrapData() {
  try {
    const health = await apiGet("/api/health");
    if (health.desktop && health.config) {
      state.config = { ...DEFAULT_CONFIG, ...health.config };
      persistConfig();
      hydrateConfigForm();
    }
    state.backend = {
      available: true,
      store: health.store || "file",
      modelConfigured: Boolean(health.modelConfigured),
      memosConfigured: Boolean(health.memosConfigured),
    };
    const payload = await apiGet("/api/items");
    state.items = Array.isArray(payload.items) ? payload.items.map(normalizeItem) : [];
    const stagedPayload = await apiGet("/api/staged");
    state.staged = Array.isArray(stagedPayload.items) ? stagedPayload.items.map(normalizeStagedItem) : [];
    return;
  } catch (error) {
    console.info("Backend unavailable, using browser storage.", error);
  }
  state.backend.available = false;
  state.backend.store = "browser";
  state.items = loadLocalItems();
  state.staged = loadLocalStaged();
}

function bindEvents() {
  els.captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = els.captureInput.value.trim();
    if (!content) return;

    setBusy(true);
    try {
      const staged = await createStagedItem(content);
      state.staged.unshift(normalizeStagedItem(staged));
      els.captureInput.value = "";
      await persistStaged();
      render();
      showToast("已加入缓冲区");
    } catch (error) {
      console.error(error);
      showToast("加入缓冲区失败，已保留输入内容");
    } finally {
      setBusy(false);
    }
  });

  els.providerSelect.addEventListener("change", () => {
    const provider = els.providerSelect.value;
    const defaults = PROVIDER_DEFAULTS[provider];
    els.baseUrlInput.value = defaults.baseUrl;
    els.modelInput.value = defaults.model;
    renderProviderHelp(provider);
  });

  els.saveConfigBtn.addEventListener("click", async () => {
    state.config = readConfigForm();
    state.ui.layoutMode = els.layoutModeSelect.value === "nav" ? "nav" : "single";
    state.ui.themeMode = normalizeThemeMode(els.themeModeSelect.value);
    if (state.ui.layoutMode !== "nav") state.ui.activeView = "capture";
    persistConfig();
    persistUiConfig();
    await saveBackendConfig();
    hydrateConfigForm();
    render();
    showToast(`模型配置已保存：${classifierModeLabel()}`);
  });

  els.testModelBtn.addEventListener("click", async () => {
    state.config = readConfigForm();
    persistConfig();
    setBusy(true);
    renderModelTestResult("running", {
      message: "正在发送测试内容...",
      content: "明天下午三点提醒我整理项目迁移清单。",
    });
    try {
      const content = "明天下午三点提醒我整理项目迁移清单。";
      const result = await classifyContent(content);
      renderModelTestResult("success", { content, result });
      showToast(`测试成功：${CATEGORY_LABELS[result.category] || result.category}`);
    } catch (error) {
      console.error(error);
      renderModelTestResult("error", {
        message: error.message || "未知错误",
        content: "明天下午三点提醒我整理项目迁移清单。",
      });
      showToast("测试失败，可检查 key、base URL 或服务端环境变量");
    } finally {
      setBusy(false);
      renderModelStatus();
    }
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    render();
  });

  els.filterSelect.addEventListener("change", () => {
    state.filter = els.filterSelect.value;
    render();
  });

  els.calendarPrevBtn.addEventListener("click", () => {
    state.calendarDate = addMonths(state.calendarDate, -1);
    render();
  });

  els.calendarNextBtn.addEventListener("click", () => {
    state.calendarDate = addMonths(state.calendarDate, 1);
    render();
  });

  els.calendarTodayBtn.addEventListener("click", () => {
    const today = new Date();
    const key = dateKey(today);
    state.calendarDate = startOfMonth(today);
    state.selectedDate = key;
    render();
  });

  els.calendarClearBtn.addEventListener("click", () => {
    state.selectedDate = "";
    render();
  });

  els.selectAllBtn.addEventListener("click", () => {
    filteredItems().forEach((item) => state.selectedIds.add(item.id));
    render();
  });

  els.clearSelectionBtn.addEventListener("click", () => {
    state.selectedIds.clear();
    render();
  });

  els.deleteSelectedBtn.addEventListener("click", deleteSelectedItems);

  els.appNav.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui.activeView = button.dataset.view || "capture";
      persistUiConfig();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  els.commitBufferBtn.addEventListener("click", commitStagedBuffer);
  els.clearBufferBtn.addEventListener("click", clearStagedBuffer);

  els.clearDoneBtn.addEventListener("click", async () => {
    const doneItems = state.items.filter((item) => item.status === "done");
    for (const item of doneItems) {
      await deleteItem(item.id);
    }
    state.items = state.items.filter((item) => item.status !== "done");
    await persistItems();
    render();
    showToast(`已清理 ${doneItems.length} 条已完成事项`);
  });

  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);
  els.screenModeBtn.addEventListener("click", () => {
    document.body.classList.toggle("screen-mode");
    drawChart();
  });
  els.modelSettingsBtn.addEventListener("click", openModelModal);
  els.modelModalCloseBtn.addEventListener("click", closeModelModal);
  els.modelModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-model-close]")) closeModelModal();
  });
  els.installBtn.addEventListener("click", installPwa);
  if (els.quitAppBtn) {
    els.quitAppBtn.addEventListener("click", async () => {
      if (!window.ideahubDesktop?.quitApp) return;
      showToast("正在退出 IdeaHub");
      await window.ideahubDesktop.quitApp();
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installBtn.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    els.installBtn.hidden = true;
    showToast("IdeaHub 已安装到设备");
  });
  if (SYSTEM_DARK_QUERY) {
    SYSTEM_DARK_QUERY.addEventListener("change", () => {
      if (state.ui.themeMode === "system") {
        applyThemeMode();
        drawChart();
      }
    });
  }
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  els.modalCloseBtn.addEventListener("click", closeDetailModal);
  els.detailModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) closeDetailModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.detailModal.classList.contains("open")) closeDetailModal();
    if (event.key === "Escape" && els.modelModal.classList.contains("open")) closeModelModal();
  });
}

function registerPwa() {
  if (window.ideahubDesktop?.isDesktop) return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

async function installPwa() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  const result = await state.installPrompt.userChoice;
  state.installPrompt = null;
  els.installBtn.hidden = true;
  if (result.outcome === "accepted") showToast("正在安装 IdeaHub");
}

function applyLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "screen") {
    document.body.classList.add("screen-mode");
    drawChart();
  }
  if (params.get("focus") === "capture") {
    els.captureInput.focus();
    els.captureInput.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function updateConnectionStatus() {
  if (navigator.onLine) {
    els.connectionStatus.textContent = "";
    els.connectionStatus.classList.remove("show");
    return;
  }
  els.connectionStatus.textContent = "离线模式：可浏览已缓存页面，新增内容会在本机暂存。";
  els.connectionStatus.classList.add("show");
}

async function createItems(content, source) {
  if (state.backend.available) {
    const payload = await apiPost("/api/items", { content, source: source || "缓冲区", config: state.config });
    const items = Array.isArray(payload.items) ? payload.items : [payload.item];
    return items.filter(Boolean);
  }
  const classifiedItems = await analyzeContent(content);
  return classifiedItems.map((classified) =>
    normalizeItem({
      ...classified,
      source,
      createdAt: new Date().toISOString(),
      status: "active",
    }),
  );
}

async function createStagedItem(content) {
  const item = normalizeStagedItem({ content });
  if (state.backend.available) {
    const payload = await apiPost("/api/staged", item);
    return payload.item;
  }
  return item;
}

async function commitStagedBuffer() {
  if (!state.staged.length) return;
  await refreshBackendConfig();
  setBusy(true);
  try {
    assertModelReady();
    const content = state.staged
      .slice()
      .reverse()
      .map((item, index) => `【缓冲 ${index + 1}】\n${item.content}`)
      .join("\n\n---\n\n");
    const items = await createItems(content, "缓冲区");
    state.items.unshift(...items.map(normalizeItem));
    state.staged = [];
    await persistStaged();
    await persistItems();
    render();
    showToast(`已提交入库 ${items.length} 条`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "提交入库失败，请检查模型配置");
  } finally {
    setBusy(false);
  }
}

async function clearStagedBuffer() {
  state.staged = [];
  await persistStaged();
  render();
  showToast("缓冲区已清空");
}

async function classifyContent(content) {
  const items = await analyzeContent(content);
  return items[0];
}

async function analyzeContent(content) {
  assertModelReady();
  if (state.backend.available) {
    const payload = await apiPost("/api/classify", { content, config: state.config });
    return normalizeAnalysis(payload.items || payload.result, content);
  }

  const config = state.config;
  const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      messages: analysisMessages(content),
    }),
  });

  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  return normalizeAnalysis(parseModelJson(text), content);
}

function assertModelReady() {
  const config = state.config;
  if (!config.provider || config.provider === "local" || !config.baseUrl || !config.model) {
    throw new Error("请先在模型设置中配置 DeepSeek 或兼容接口");
  }
  if (providerRequiresApiKey(config.provider) && !config.apiKey) {
    throw new Error("请先填写 API Key");
  }
}

function analysisMessages(content) {
  const today = dateKey(new Date());
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

function parseModelJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON returned by model");
  return JSON.parse(match[0]);
}

function normalizeAnalysis(raw, originalContent) {
  const rawItems = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : raw ? [raw] : [];
  const seen = new Set();
  const items = [];
  rawItems.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const content = String(item.content || originalContent || "").trim();
    if (!content || seen.has(content)) return;
    seen.add(content);
    items.push({
      ...item,
      content,
      title: trimText(String(item.title || makeTitle(content)), 32),
      summary: trimText(String(item.summary || summarize(content)), 110),
      category: CATEGORY_LABELS[item.category] ? item.category : "record",
      priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 4).map(String) : [],
      dueDate: normalizeDueDate(item.dueDate || item.due_date),
    });
  });
  if (!items.length) {
    throw new Error("模型没有返回可入库条目，请检查提示词或模型输出");
  }
  return items;
}

function makeTitle(content) {
  const firstLine = content.split(/\n+/)[0].trim();
  return trimText(firstLine.replace(/^(想法|计划|待办|记录)[:：]\s*/, ""), 24) || "未命名条目";
}

function summarize(content) {
  return trimText(content.replace(/\s+/g, " "), 70);
}

function normalizeDueDate(value) {
  const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return "";
  const [year, month, day] = match[0].split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? match[0] : "";
}

function normalizeItem(raw) {
  const category = CATEGORY_LABELS[raw.category] ? raw.category : "record";
  return {
    id: raw.id || crypto.randomUUID(),
    title: trimText(String(raw.title || makeTitle(raw.content || "")), 32),
    summary: trimText(String(raw.summary || summarize(raw.content || "")), 110),
    content: String(raw.content || ""),
    category,
    priority: ["high", "medium", "low"].includes(raw.priority) ? raw.priority : "medium",
    status: raw.status || "active",
    source: raw.source || "缓冲区",
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 4).map(String) : [],
    dueDate: normalizeDueDate(raw.dueDate || raw.due_date),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  };
}

function normalizeStagedItem(raw) {
  return {
    id: raw.id || crypto.randomUUID(),
    content: String(raw.content || ""),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function render() {
  pruneSelection();
  applyThemeMode();
  applyLayoutMode();
  renderModelStatus();
  renderStagedBuffer();
  renderBulkActions();
  renderMetrics();
  renderCalendar();
  renderLists();
  drawChart();
  els.syncHint.textContent = syncText();
}

function applyThemeMode() {
  const mode = normalizeThemeMode(state.ui.themeMode);
  const resolved = mode === "system" ? (SYSTEM_DARK_QUERY?.matches ? "dark" : "light") : mode;
  state.ui.themeMode = mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const themeColor = resolved === "dark" ? "#101918" : "#1d7a55";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

function normalizeThemeMode(value) {
  return ["light", "dark", "system"].includes(value) ? value : "system";
}

function applyLayoutMode() {
  const layoutMode = state.ui.layoutMode === "nav" ? "nav" : "single";
  document.body.classList.toggle("layout-nav", layoutMode === "nav");
  document.body.dataset.activeView = state.ui.activeView || "capture";
  els.appNav.hidden = layoutMode !== "nav";
  els.appNav.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.ui.activeView);
  });
}

function renderStagedBuffer() {
  els.stageCount.textContent = `${state.staged.length} 条`;
  els.commitBufferBtn.disabled = !state.staged.length;
  els.clearBufferBtn.disabled = !state.staged.length;
  els.stagingList.innerHTML = "";
  if (!state.staged.length) {
    els.stagingList.append(emptyState("缓冲区为空"));
    return;
  }
  const fragment = document.createDocumentFragment();
  state.staged.slice(0, 8).forEach((item) => {
    const card = document.createElement("article");
    card.className = "staged-card";
    card.innerHTML = `
      <p>${escapeHtml(trimText(item.content, 140))}</p>
      <div class="item-actions">
        <button type="button" data-action="remove-stage" data-id="${escapeHtml(item.id)}">移出</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", async () => {
      await deleteStagedItem(item.id);
      state.staged = state.staged.filter((entry) => entry.id !== item.id);
      await persistStaged();
      render();
    });
    fragment.append(card);
  });
  els.stagingList.append(fragment);
}

function renderModelStatus() {
  const { provider, apiKey, baseUrl, model } = state.config;
  const providerText = PROVIDER_LABELS[provider] || "自定义接口";
  if (state.backend.available && state.backend.modelConfigured) {
    els.modelStatus.textContent = `服务端模型 · ${providerText}`;
    return;
  }
  const ready = providerRequiresApiKey(provider) ? Boolean(apiKey && baseUrl && model) : Boolean(baseUrl && model);
  els.modelStatus.textContent = provider === "local" || !ready ? "未配置模型" : providerText;
}

function renderProviderHelp(provider = state.config.provider) {
  if (!els.providerHelp) return;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
  const link = defaults.apiKeyUrl
    ? `<a href="${escapeHtml(defaults.apiKeyUrl)}" target="_blank" rel="noreferrer">获取 API Key</a>`
    : "";
  els.providerHelp.innerHTML = `
    <div>
      <strong>${escapeHtml(defaults.label)}</strong>
      <span>${escapeHtml(defaults.note)}</span>
    </div>
    ${link}
  `;
}

function providerRequiresApiKey(provider) {
  return Boolean((PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom).requiresKey);
}

function renderModelTestResult(status, payload = {}) {
  if (!els.modelTestResult) return;
  const providerText = PROVIDER_LABELS[state.config.provider] || "自定义接口";

  els.modelTestResult.className = `model-test-result ${status}`;
  if (status === "running") {
    els.modelTestResult.innerHTML = `
      <span>测试中 · ${escapeHtml(providerText)}</span>
      <p>${escapeHtml(payload.message || "正在测试模型配置...")}</p>
      <code>${escapeHtml(payload.content || "")}</code>
    `;
    return;
  }

  if (status === "error") {
    els.modelTestResult.innerHTML = `
      <span>测试失败 · ${escapeHtml(providerText)}</span>
      <p>${escapeHtml(payload.message || "请检查 API Key、Base URL、模型名称或网络。")}</p>
      <code>${escapeHtml(payload.content || "")}</code>
    `;
    return;
  }

  const result = payload.result || {};
  const dueDateText = result.dueDate ? `日程 ${result.dueDate}` : "无日程日期";
  els.modelTestResult.innerHTML = `
    <span>测试成功 · ${escapeHtml(providerText)}</span>
    <p>${escapeHtml(payload.content || "")}</p>
    <div class="model-test-grid">
      <strong>${escapeHtml(CATEGORY_LABELS[result.category] || result.category || "未知")}</strong>
      <span>${escapeHtml(priorityLabel(result.priority || "medium"))}</span>
      <span>${escapeHtml(dueDateText)}</span>
      <span>${(result.tags || []).map((tag) => `#${escapeHtml(tag)}`).join(" ") || "无标签"}</span>
    </div>
    <code>${escapeHtml(result.title || "")} · ${escapeHtml(result.summary || "")}</code>
  `;
}

function syncText() {
  if (!state.backend.available) return `浏览器本地 · ${state.items.length} 条`;
  if (state.backend.store === "desktop-file") return `桌面本地 · ${state.items.length} 条`;
  if (state.backend.store === "memos") return `Memos 已同步 · ${state.items.length} 条`;
  return `服务端 JSON · ${state.items.length} 条`;
}

function renderMetrics() {
  const active = state.items.filter((item) => item.status !== "done" && item.category !== "archive");
  els.todoCount.textContent = count(active, "todo");
  els.planCount.textContent = count(active, "plan");
  els.ideaCount.textContent = count(active, "idea");
  els.recordCount.textContent = count(active, "record");
}

function renderLists() {
  const items = filteredItems();
  const priorityItems = [...items].sort(sortByPriorityAndTime).slice(0, 6);
  renderStack(els.priorityList, priorityItems, { empty: "还没有匹配内容" });

  renderStack(els.todoList, items.filter(byCategory("todo")).slice(0, 5), { compact: true });
  renderStack(els.planList, items.filter(byCategory("plan")).slice(0, 5), { compact: true });
  renderStack(els.ideaList, items.filter(byCategory("idea")).slice(0, 5), { compact: true });
  renderStack(els.recordList, items.filter(byCategory("record")).slice(0, 5), { compact: true });
  renderTimeline(items.slice(0, 8));
}

function renderBulkActions() {
  const visibleItems = filteredItems();
  const selectedCount = state.selectedIds.size;
  const visibleSelectableCount = visibleItems.length;
  const allVisibleSelected = visibleSelectableCount > 0 && visibleItems.every((item) => state.selectedIds.has(item.id));
  els.selectionCount.textContent = `已选 ${selectedCount} 条`;
  els.selectAllBtn.disabled = !visibleSelectableCount || allVisibleSelected;
  els.clearSelectionBtn.disabled = !selectedCount;
  els.deleteSelectedBtn.disabled = !selectedCount;
}

function pruneSelection() {
  const visibleIds = new Set(filteredItems().map((item) => item.id));
  Array.from(state.selectedIds).forEach((id) => {
    if (!visibleIds.has(id)) state.selectedIds.delete(id);
  });
}

function renderCalendar() {
  const monthStart = startOfMonth(state.calendarDate);
  const todayKey = dateKey(new Date());
  els.calendarMonthLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(monthStart);

  const counts = itemCountsByDate(state.items);
  const firstGridDate = new Date(monthStart);
  const weekday = (firstGridDate.getDay() + 6) % 7;
  firstGridDate.setDate(firstGridDate.getDate() - weekday);

  els.calendarGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(firstGridDate);
    day.setDate(firstGridDate.getDate() + index);
    const key = dateKey(day);
    const countForDay = counts.get(key) || { total: 0, todo: 0 };
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "calendar-day",
      day.getMonth() === monthStart.getMonth() ? "" : "muted",
      key === todayKey ? "today" : "",
      key === state.selectedDate ? "selected" : "",
      countForDay.total ? "has-items" : "",
      countForDay.todo ? "has-todo" : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.setAttribute("aria-label", `${key}，${countForDay.total} 条记录，${countForDay.todo} 条代办`);
    button.innerHTML = `
      <strong>${day.getDate()}</strong>
      ${countForDay.total ? `<span class="calendar-count">${countForDay.total}</span>` : ""}
      ${countForDay.todo ? `<span class="calendar-todo-count">待${countForDay.todo}</span>` : ""}
    `;
    button.addEventListener("click", () => {
      state.selectedDate = key;
      state.calendarDate = startOfMonth(day);
      render();
    });
    fragment.append(button);
  }
  els.calendarGrid.append(fragment);
  renderCalendarSelection();
}

function renderCalendarSelection() {
  const selectedItems = state.selectedDate
    ? state.items.filter((item) => calendarDateKey(item) === state.selectedDate).sort(sortByPriorityAndTime)
    : [];
  els.calendarSelectedLabel.textContent = selectedRangeLabel();
  els.calendarSelectedCount.textContent = `${selectedItems.length} 条`;
  renderStack(els.calendarDayList, selectedItems.slice(0, 6), {
    empty: state.selectedDate ? "这一天还没有记录" : "点击日历日期查看当天记录",
  });
}

function classifierModeLabel() {
  const config = state.config;
  const providerText = PROVIDER_LABELS[config.provider] || "未配置模型";
  if (config.provider === "local") return "未配置模型";
  const needsKey = providerRequiresApiKey(config.provider);
  if (!config.baseUrl || !config.model || (needsKey && !config.apiKey)) return "未配置模型（配置不完整）";
  return providerText;
}

async function saveBackendConfig() {
  if (!state.backend.available || !window.ideahubDesktop?.isDesktop) return;
  try {
    const payload = await apiPost("/api/config", { config: state.config });
    if (payload.config) {
      state.config = { ...DEFAULT_CONFIG, ...payload.config };
      persistConfig();
    }
  } catch (error) {
    console.warn("Failed to persist desktop config", error);
  }
}

async function refreshBackendConfig() {
  if (!state.backend.available || !window.ideahubDesktop?.isDesktop) return;
  try {
    const payload = await apiGet("/api/config");
    if (payload.config) {
      state.config = { ...DEFAULT_CONFIG, ...payload.config };
      persistConfig();
      hydrateConfigForm();
    }
  } catch (error) {
    console.warn("Failed to refresh desktop config", error);
  }
}

function renderStack(container, items, options = {}) {
  container.innerHTML = "";
  if (!items.length) {
    container.append(emptyState(options.empty || "暂无内容"));
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.append(itemCard(item)));
  container.append(fragment);
}

function itemCard(item) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.dataset.category = item.category;
  if (state.selectedIds.has(item.id)) card.classList.add("selected");
  card.innerHTML = `
    <label class="item-select">
      <input type="checkbox" data-action="select" data-id="${escapeHtml(item.id)}" ${state.selectedIds.has(item.id) ? "checked" : ""} />
      <span>选择</span>
    </label>
    <div class="item-head">
      <strong>${escapeHtml(item.title)}</strong>
      <span class="category-badge">${CATEGORY_LABELS[item.category]}</span>
    </div>
    <p>${escapeHtml(item.summary)}</p>
    <div class="item-meta">
      <span class="tag">${priorityLabel(item.priority)}</span>
      ${item.dueDate ? `<span class="tag schedule-tag">日程 ${escapeHtml(item.dueDate)}</span>` : ""}
      <span class="tag">${escapeHtml(item.source)}</span>
      ${item.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
    </div>
    <div class="item-actions">
      <button type="button" data-action="view" data-id="${escapeHtml(item.id)}">查看全文</button>
      <button type="button" data-action="cycle" data-id="${escapeHtml(item.id)}">${item.status === "done" ? "重新激活" : "完成"}</button>
      <button type="button" data-action="archive" data-id="${escapeHtml(item.id)}">归档</button>
      <button type="button" data-action="delete" data-id="${escapeHtml(item.id)}">删除</button>
      <select data-action="move" data-id="${escapeHtml(item.id)}" aria-label="移动分类">
        ${Object.entries(CATEGORY_LABELS)
          .filter(([key]) => key !== "archive")
          .map(([key, label]) => `<option value="${key}" ${item.category === key ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </div>
  `;
  card.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => handleItemAction(button.dataset.action, button.dataset.id));
  });
  card.querySelector("input[type='checkbox']").addEventListener("change", (event) => {
    handleItemSelection(item.id, event.target.checked);
  });
  card.querySelector("select").addEventListener("change", (event) => handleItemAction("move", item.id, event.target.value));
  return card;
}

function handleItemSelection(id, selected) {
  if (selected) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }
  render();
}

async function deleteSelectedItems() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return;
  if (!window.confirm(`确定删除已选的 ${ids.length} 条记录吗？此操作无法撤销。`)) return;

  setBusy(true);
  const deletedIds = new Set();
  try {
    for (const id of ids) {
      await deleteItem(id);
      deletedIds.add(id);
    }
  } catch (error) {
    console.error(error);
    showToast(`部分删除失败，已删除 ${deletedIds.size} 条`);
  } finally {
    if (deletedIds.size) {
      state.items = state.items.filter((item) => !deletedIds.has(item.id));
      deletedIds.forEach((id) => state.selectedIds.delete(id));
      await persistItems();
    }
    setBusy(false);
    render();
    if (deletedIds.size === ids.length) {
      showToast(`已删除 ${deletedIds.size} 条记录`);
    }
  }
}

async function handleItemAction(action, id, value) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  if (action === "view") {
    openDetailModal(item);
    return;
  }

  try {
    if (action === "delete") {
      await deleteItem(id);
      state.items = state.items.filter((entry) => entry.id !== id);
      state.selectedIds.delete(id);
    } else {
      const patch = {};
      if (action === "cycle") patch.status = item.status === "done" ? "active" : "done";
      if (action === "move") patch.category = value;
      if (action === "archive") {
        patch.category = "archive";
        patch.status = "done";
      }
      const updated = await updateItem(id, patch);
      Object.assign(item, normalizeItem(updated));
    }
    await persistItems();
    render();
  } catch (error) {
    console.error(error);
    showToast("操作失败，请检查后端连接");
  }
}

function openDetailModal(item) {
  els.modalCategory.textContent = CATEGORY_LABELS[item.category] || item.category;
  els.modalCategory.className = "category-badge";
  els.modalTitle.textContent = item.title;
  els.modalContent.textContent = item.content || item.summary || "";
  els.modalMeta.innerHTML = `
    <span class="tag">${priorityLabel(item.priority)}</span>
    ${item.dueDate ? `<span class="tag schedule-tag">日程 ${escapeHtml(item.dueDate)}</span>` : ""}
    <span class="tag">${escapeHtml(item.source)}</span>
    <span class="tag">${formatTime(item.createdAt)}</span>
    ${item.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
  `;
  els.detailModal.classList.add("open");
  els.detailModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.modalCloseBtn.focus();
}

function closeDetailModal() {
  els.detailModal.classList.remove("open");
  els.detailModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openModelModal() {
  hydrateConfigForm();
  els.modelModal.classList.add("open");
  els.modelModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.providerSelect.focus();
}

function closeModelModal() {
  els.modelModal.classList.remove("open");
  els.modelModal.setAttribute("aria-hidden", "true");
  if (!els.detailModal.classList.contains("open")) {
    document.body.classList.remove("modal-open");
  }
}

async function updateItem(id, patch) {
  if (state.backend.available) {
    const payload = await apiPatch(`/api/items/${encodeURIComponent(id)}`, patch);
    return payload.item;
  }
  const item = state.items.find((entry) => entry.id === id);
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  return item;
}

async function deleteItem(id) {
  if (state.backend.available) {
    await apiDelete(`/api/items/${encodeURIComponent(id)}`);
  }
}

async function deleteStagedItem(id) {
  if (state.backend.available) {
    await apiDelete(`/api/staged/${encodeURIComponent(id)}`);
  }
}

function renderTimeline(items) {
  els.timelineList.innerHTML = "";
  if (!items.length) {
    els.timelineList.append(emptyState("时间线为空"));
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "timeline-entry";
    entry.innerHTML = `
      <time>${formatTime(item.createdAt)} · ${CATEGORY_LABELS[item.category]}</time>
      <strong>${escapeHtml(item.title)}</strong>
    `;
    fragment.append(entry);
  });
  els.timelineList.append(fragment);
}

function drawChart() {
  const canvas = els.categoryChart;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.max(240, Math.floor(300 * ratio));
  ctx.scale(ratio, ratio);
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  ctx.clearRect(0, 0, width, height);

  const categories = ["todo", "plan", "idea", "record"];
  const values = categories.map((category) => count(filteredItems(false), category));
  const max = Math.max(1, ...values);
  const gap = 18;
  const barWidth = (width - gap * (categories.length + 1)) / categories.length;
  const chartTop = 28;
  const chartBottom = height - 46;
  const chartHeight = chartBottom - chartTop;
  const darkChart = document.body.classList.contains("screen-mode") || document.documentElement.dataset.theme === "dark";

  categories.forEach((category, index) => {
    const x = gap + index * (barWidth + gap);
    const barHeight = Math.max(8, (values[index] / max) * chartHeight);
    const y = chartBottom - barHeight;
    roundedRect(ctx, x, y, barWidth, barHeight, 8, CATEGORY_COLORS[category]);
    ctx.fillStyle = darkChart ? "#eef7f2" : "#17202a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(values[index], x + barWidth / 2, y - 14);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = darkChart ? "#a8bdb4" : "#607080";
    ctx.fillText(CATEGORY_LABELS[category], x + barWidth / 2, chartBottom + 22);
  });
}

function roundedRect(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function filteredItems(ignoreFilter = false) {
  return state.items
    .filter((item) => item.status !== "done" || state.filter === "archive")
    .filter((item) => !state.selectedDate || calendarDateKey(item) === state.selectedDate)
    .filter((item) => ignoreFilter || state.filter === "all" || item.category === state.filter)
    .filter((item) => {
      if (!state.query) return true;
      const haystack = `${item.title} ${item.summary} ${item.content} ${item.dueDate || ""} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(state.query);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function selectedRangeLabel() {
  return state.selectedDate ? formatDateLabel(state.selectedDate) : "未选择日期";
}

function itemCountsByDate(items) {
  return items.reduce((map, item) => {
    const key = calendarDateKey(item);
    const value = map.get(key) || { total: 0, todo: 0 };
    value.total += 1;
    if (item.category === "todo" && item.status !== "done") value.todo += 1;
    map.set(key, value);
    return map;
  }, new Map());
}

function calendarDateKey(item) {
  return item.dueDate || dateKey(item.createdAt);
}

function startOfMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(value, amount) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(year, month - 1, day));
}

function formatShortDateLabel(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(year, month - 1, day));
}

function byCategory(category) {
  return (item) => item.category === category;
}

function sortByPriorityAndTime(a, b) {
  const weights = { high: 0, medium: 1, low: 2 };
  return weights[a.priority] - weights[b.priority] || new Date(b.createdAt) - new Date(a.createdAt);
}

function count(items, category) {
  return items.filter((item) => item.category === category).length;
}

function priorityLabel(priority) {
  return {
    high: "高优先级",
    medium: "中优先级",
    low: "低优先级",
  }[priority];
}

function emptyState(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}

function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: state.items,
    staged: state.staged,
    ui: state.ui,
    config: {
      ...state.config,
      apiKey: "",
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ideahub-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("已导出迁移包，API Key 未包含在内");
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!Array.isArray(payload.items)) throw new Error("Invalid import file");
    const imported = payload.items.map(normalizeItem);
    const staged = Array.isArray(payload.staged) ? payload.staged.map(normalizeStagedItem) : [];
    if (state.backend.available) {
      const response = await apiPost("/api/import", { items: imported });
      state.items = response.items.map(normalizeItem);
      state.staged = staged;
      await persistStaged();
    } else {
      state.items = imported;
      state.staged = staged;
      await persistItems();
      await persistStaged();
    }
    if (payload.config) {
      state.config = { ...state.config, ...payload.config, apiKey: state.config.apiKey };
      persistConfig();
      hydrateConfigForm();
    }
    if (payload.ui) {
      state.ui = {
        layoutMode: payload.ui.layoutMode === "nav" ? "nav" : "single",
        activeView: ["capture", "calendar", "overview", "dashboard"].includes(payload.ui.activeView) ? payload.ui.activeView : "capture",
        themeMode: normalizeThemeMode(payload.ui.themeMode),
      };
      persistUiConfig();
    }
    render();
    showToast(`已导入 ${imported.length} 条内容`);
  } catch (error) {
    console.error(error);
    showToast("导入失败，请确认 JSON 文件格式");
  } finally {
    event.target.value = "";
  }
}

function hydrateConfigForm() {
  els.providerSelect.value = state.config.provider;
  els.baseUrlInput.value = state.config.baseUrl;
  els.modelInput.value = state.config.model;
  els.apiKeyInput.value = state.config.apiKey;
  els.layoutModeSelect.value = state.ui.layoutMode;
  els.themeModeSelect.value = normalizeThemeMode(state.ui.themeMode);
  renderProviderHelp(state.config.provider);
  renderModelStatus();
}

function readConfigForm() {
  return {
    provider: els.providerSelect.value,
    baseUrl: els.baseUrlInput.value.trim(),
    model: els.modelInput.value.trim(),
    apiKey: els.apiKeyInput.value.trim(),
  };
}

function loadLocalItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved)) return saved.map(normalizeItem);
  } catch (error) {
    console.warn("Failed to load saved items", error);
  }
  return sampleItems;
}

function loadLocalStaged() {
  try {
    const saved = JSON.parse(localStorage.getItem(STAGED_KEY) || "null");
    if (Array.isArray(saved)) return saved.map(normalizeStagedItem);
  } catch (error) {
    console.warn("Failed to load staged items", error);
  }
  return [];
}

async function persistItems() {
  if (!state.backend.available) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  }
}

async function persistStaged() {
  if (state.backend.available) {
    await apiPost("/api/staged/sync", { items: state.staged });
    return;
  }
  localStorage.setItem(STAGED_KEY, JSON.stringify(state.staged));
}

function loadConfig() {
  try {
    const saved = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") };
    if (saved.provider === "local") return DEFAULT_CONFIG;
    if (!PROVIDER_DEFAULTS[saved.provider]) return { ...saved, provider: "custom" };
    return saved;
  } catch (error) {
    console.warn("Failed to load config", error);
    return DEFAULT_CONFIG;
  }
}

function persistConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
}

function loadUiConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_CONFIG_KEY) || "{}");
    return {
      layoutMode: saved.layoutMode === "nav" ? "nav" : "single",
      activeView: ["capture", "calendar", "overview", "dashboard"].includes(saved.activeView) ? saved.activeView : "capture",
      themeMode: normalizeThemeMode(saved.themeMode),
    };
  } catch (error) {
    console.warn("Failed to load UI config", error);
    return { layoutMode: "single", activeView: "capture", themeMode: "system" };
  }
}

function persistUiConfig() {
  localStorage.setItem(UI_CONFIG_KEY, JSON.stringify(state.ui));
}

async function apiGet(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  return parseApiResponse(response);
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(response);
}

async function apiPatch(path, body) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(response);
}

async function apiDelete(path) {
  const response = await fetch(path, { method: "DELETE", headers: { Accept: "application/json" } });
  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return {};
  return response.json();
}

function setBusy(isBusy) {
  els.captureForm.querySelector("button[type='submit']").disabled = isBusy;
  els.commitBufferBtn.disabled = isBusy || !state.staged.length;
  els.clearBufferBtn.disabled = isBusy || !state.staged.length;
  els.testModelBtn.disabled = isBusy;
  els.selectAllBtn.disabled = isBusy || !filteredItems().length;
  els.clearSelectionBtn.disabled = isBusy || !state.selectedIds.size;
  els.deleteSelectedBtn.disabled = isBusy || !state.selectedIds.size;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function trimText(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("resize", drawChart);
