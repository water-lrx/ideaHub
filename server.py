#!/usr/bin/env python3
import json
import hashlib
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "items.json"
STAGED_FILE = DATA_DIR / "staged.json"
RESEARCH_FILE = DATA_DIR / "research.json"
MARKER_RE = re.compile(r"<!--\s*ideahub\s*(\{.*?\})\s*-->", re.DOTALL)

CATEGORY_LABELS = {"todo", "plan", "idea", "record", "archive"}
PRIORITIES = {"high", "medium", "low"}
RESEARCH_TYPES = {"article", "method", "experiment", "evidence"}
RESEARCH_SUPPORT_LEVELS = {"direct", "indirect", "background", "counter"}
PROVIDER_DEFAULTS = {
    "deepseek": {"baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash", "requiresKey": True},
    "zhipu": {"baseUrl": "https://open.bigmodel.cn/api/paas/v4", "model": "glm-4-flash", "requiresKey": True},
    "siliconflow": {"baseUrl": "https://api.siliconflow.cn/v1", "model": "Qwen/Qwen3-8B", "requiresKey": True},
    "dashscope": {"baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-turbo", "requiresKey": True},
    "openai": {"baseUrl": "https://api.openai.com/v1", "model": "gpt-4.1-mini", "requiresKey": True},
    "custom": {"baseUrl": "http://localhost:11434/v1", "model": "local-model", "requiresKey": False},
}
REPORT_STYLE_LABELS = {
    "summary": "总结汇报",
    "review": "复盘汇报",
    "mentor": "导师汇报",
    "custom": "自定义汇报",
}
REPORT_PERIOD_LABELS = {
    "day": "日报",
    "week": "周报",
    "month": "月报",
    "year": "年报",
    "custom": "自定义范围",
}
REPORT_TONE_LABELS = {
    "concise": "简洁正式",
    "detailed": "详细完整",
    "academic": "学术导师风",
    "casual": "自然口语",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def env(name, default=""):
    return os.environ.get(name, default).strip()


def read_json_body(handler):
    length = int(handler.headers.get("Content-Length") or "0")
    if length == 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw or "{}")


def normalize_item(raw):
    content = str(raw.get("content") or "")
    created_at = raw.get("createdAt") or raw.get("created_at") or utc_now()
    category = raw.get("category") if raw.get("category") in CATEGORY_LABELS else "record"
    priority = raw.get("priority") if raw.get("priority") in PRIORITIES else "medium"
    tags = raw.get("tags") if isinstance(raw.get("tags"), list) else []
    return {
        "id": str(raw.get("id") or str(uuid.uuid4())),
        "title": trim_text(str(raw.get("title") or make_title(content)), 32),
        "summary": trim_text(str(raw.get("summary") or summarize(content)), 110),
        "content": content,
        "category": category,
        "priority": priority,
        "status": str(raw.get("status") or "active"),
        "source": str(raw.get("source") or "缓冲区"),
        "tags": [str(tag) for tag in tags[:4]],
        "dueDate": normalize_due_date(raw.get("dueDate") or raw.get("due_date")),
        "createdAt": created_at,
        "updatedAt": raw.get("updatedAt") or raw.get("updated_at") or created_at,
    }


def normalize_staged(raw):
    return {
        "id": str(raw.get("id") or str(uuid.uuid4())),
        "content": str(raw.get("content") or ""),
        "createdAt": raw.get("createdAt") or raw.get("created_at") or utc_now(),
    }


def read_staged():
    DATA_DIR.mkdir(exist_ok=True)
    if not STAGED_FILE.exists():
        STAGED_FILE.write_text("[]", encoding="utf-8")
    return [normalize_staged(item) for item in json.loads(STAGED_FILE.read_text(encoding="utf-8") or "[]")]


def write_staged(items):
    DATA_DIR.mkdir(exist_ok=True)
    normalized = [normalize_staged(item) for item in items]
    STAGED_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def empty_research_store():
    return {"folderPath": "", "documents": [], "insights": [], "updatedAt": ""}


def normalize_string_list(value, max_items=8, max_length=220):
    if not isinstance(value, list):
        return []
    return [trim_text(str(item or ""), max_length) for item in value if str(item or "").strip()][:max_items]


def safe_nonnegative_int(value, default=0):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError, OverflowError):
        return max(0, int(default or 0))


def normalize_research_document(raw=None):
    raw = raw if isinstance(raw, dict) else {}
    raw_path = str(raw.get("path") or "")
    relative_path = str(raw.get("relativePath") or (Path(raw_path).name if raw_path else ""))
    title_fallback = Path(raw_path or relative_path).stem or "未命名简报"
    status = raw.get("status") if raw.get("status") in {"pending", "analyzed", "failed", "missing"} else "pending"
    return {
        "id": str(raw.get("id") or str(uuid.uuid4())),
        "path": raw_path,
        "relativePath": relative_path,
        "title": trim_text(str(raw.get("title") or title_fallback), 120),
        "date": normalize_due_date(raw.get("date")),
        "hash": str(raw.get("hash") or ""),
        "size": safe_nonnegative_int(raw.get("size")),
        "modifiedAt": str(raw.get("modifiedAt") or ""),
        "status": status,
        "insightCount": safe_nonnegative_int(raw.get("insightCount")),
        "analyzedAt": str(raw.get("analyzedAt") or ""),
        "lastError": trim_text(str(raw.get("lastError") or ""), 500),
        "truncated": bool(raw.get("truncated")),
    }


def normalize_research_insight(raw=None):
    raw = raw if isinstance(raw, dict) else {}
    insight_type = raw.get("type") if raw.get("type") in RESEARCH_TYPES else "method"
    created_at = str(raw.get("createdAt") or utc_now())
    return {
        "id": str(raw.get("id") or str(uuid.uuid4())),
        "type": insight_type,
        "title": trim_text(str(raw.get("title") or "未命名研究发现"), 120),
        "summary": trim_text(str(raw.get("summary") or raw.get("description") or ""), 800),
        "thesis": trim_text(str(raw.get("thesis") or ""), 800),
        "application": trim_text(str(raw.get("application") or ""), 800),
        "hypothesis": trim_text(str(raw.get("hypothesis") or ""), 800),
        "setup": trim_text(str(raw.get("setup") or raw.get("method") or ""), 1200),
        "expectedOutcome": trim_text(str(raw.get("expectedOutcome") or ""), 800),
        "claim": trim_text(str(raw.get("claim") or ""), 800),
        "rationale": trim_text(str(raw.get("rationale") or ""), 800),
        "supportLevel": raw.get("supportLevel") if raw.get("supportLevel") in RESEARCH_SUPPORT_LEVELS else "background",
        "outline": normalize_string_list(raw.get("outline"), 10),
        "variables": normalize_string_list(raw.get("variables"), 10),
        "metrics": normalize_string_list(raw.get("metrics"), 10),
        "risks": normalize_string_list(raw.get("risks"), 10),
        "tags": normalize_string_list(raw.get("tags"), 6),
        "sourceSection": trim_text(str(raw.get("sourceSection") or ""), 220),
        "sourceExcerpt": trim_text(str(raw.get("sourceExcerpt") or ""), 500),
        "sourceDocumentId": str(raw.get("sourceDocumentId") or ""),
        "sourceTitle": trim_text(str(raw.get("sourceTitle") or ""), 160),
        "sourcePath": str(raw.get("sourcePath") or ""),
        "sourceRelativePath": str(raw.get("sourceRelativePath") or ""),
        "sourceDate": normalize_due_date(raw.get("sourceDate")),
        "sourceHash": str(raw.get("sourceHash") or ""),
        "status": "transferred" if raw.get("status") == "transferred" else "active",
        "stale": bool(raw.get("stale")),
        "createdAt": created_at,
        "updatedAt": str(raw.get("updatedAt") or created_at),
    }


def normalize_research_store(raw=None):
    raw = raw if isinstance(raw, dict) else {}
    documents = raw.get("documents") if isinstance(raw.get("documents"), list) else []
    insights = raw.get("insights") if isinstance(raw.get("insights"), list) else []
    return {
        "folderPath": str(raw.get("folderPath") or ""),
        "documents": [normalize_research_document(item) for item in documents if isinstance(item, dict)],
        "insights": [normalize_research_insight(item) for item in insights if isinstance(item, dict)],
        "updatedAt": str(raw.get("updatedAt") or ""),
    }


def read_research():
    DATA_DIR.mkdir(exist_ok=True)
    if not RESEARCH_FILE.exists():
        return empty_research_store()
    try:
        return normalize_research_store(json.loads(RESEARCH_FILE.read_text(encoding="utf-8") or "{}"))
    except (OSError, ValueError, TypeError):
        return empty_research_store()


def write_research(store):
    DATA_DIR.mkdir(exist_ok=True)
    normalized = normalize_research_store({**store, "updatedAt": utc_now()})
    RESEARCH_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def reconcile_research_store(store):
    """Keep document status in sync with the files that actually exist on disk.

    Without this, a briefing deleted, renamed or moved outside the app keeps its
    stale index entry forever: it still counts as pending, and analyzing it fails
    with "简报源文件不存在" — leaving no way to clear the queue from the UI.
    """
    store = normalize_research_store(store)
    changed = False
    for index, document in enumerate(store["documents"]):
        file_path = str(document.get("path") or "")
        if file_path and Path(file_path).is_file():
            if document.get("status") == "missing":
                store["documents"][index] = normalize_research_document(
                    {**document, "status": "pending", "lastError": ""}
                )
                changed = True
            continue
        if document.get("status") == "missing" and not file_path:
            continue
        reason = "源文件已移动或删除" if file_path else "尚未关联源文件，请重新扫描目录"
        store["documents"][index] = normalize_research_document(
            {**document, "path": "", "status": "missing", "lastError": reason}
        )
        changed = True
    if not changed:
        return store
    return write_research(store)


def read_research_synced():
    """Read the research store and immediately reflect on-disk reality."""
    return reconcile_research_store(read_research())


def locate_research_document(store, document_id):
    """Find a document and, when its recorded path is gone, try to recover it.

    Briefings get re-exported under slightly different names, so fall back to a
    same-name lookup inside the configured folder before giving up.
    """
    document = next((item for item in store["documents"] if item["id"] == document_id), None)
    if document is None:
        return None
    if document.get("path") and Path(document["path"]).is_file():
        return document
    folder_path = str(store.get("folderPath") or "")
    if not folder_path:
        return document
    folder = Path(folder_path).expanduser().resolve()
    if not folder.is_dir():
        return document
    candidates = []
    relative_path = str(document.get("relativePath") or "")
    if relative_path:
        candidates.append(folder / relative_path)
    title = str(document.get("title") or "").strip()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved.is_file() and path_is_inside(folder, resolved):
            return normalize_research_document({**document, "path": str(resolved), "status": "pending", "lastError": ""})
    if title:
        for file_path in list_markdown_files(folder):
            if Path(file_path).stem == title or Path(file_path).name == title:
                return normalize_research_document(
                    {**document, "path": str(file_path), "relativePath": str(file_path.relative_to(folder)), "status": "pending", "lastError": ""}
                )
    return document


def path_is_inside(root_path, target_path):
    try:
        Path(target_path).expanduser().resolve().relative_to(Path(root_path).expanduser().resolve())
        return True
    except (OSError, ValueError):
        return False


def remap_research_paths(store, folder_path):
    folder = Path(folder_path).expanduser().resolve() if folder_path else None
    remapped = normalize_research_store(store)
    remapped["folderPath"] = str(folder) if folder else ""
    for document in remapped["documents"]:
        relative_path = document.get("relativePath") or ""
        target = (folder / relative_path).resolve() if folder and relative_path else None
        document["path"] = str(target) if target and path_is_inside(folder, target) else ""
        if not document["path"]:
            document["status"] = "missing"
            document["lastError"] = "请重新选择简报目录并扫描"
    for insight in remapped["insights"]:
        relative_path = insight.get("sourceRelativePath") or ""
        target = (folder / relative_path).resolve() if folder and relative_path else None
        insight["sourcePath"] = str(target) if target and path_is_inside(folder, target) else ""
    return remapped


def list_markdown_files(folder_path, max_depth=6, max_files=1000):
    root = Path(folder_path).expanduser().resolve()
    files = []

    def visit(directory, depth):
        if depth > max_depth or len(files) >= max_files:
            return
        for entry in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
            if len(files) >= max_files or entry.name.startswith(".") or entry.is_symlink():
                continue
            if entry.is_dir():
                visit(entry, depth + 1)
            elif entry.is_file() and entry.suffix.lower() == ".md":
                files.append(entry.resolve())

    visit(root, 0)
    return files


def extract_research_title(content, file_path):
    heading = re.search(r"^#\s+(.+)$", str(content or ""), re.MULTILINE)
    return trim_text(heading.group(1).strip() if heading else Path(file_path).stem, 120)


def extract_research_date(content, file_path):
    frontmatter = re.search(r"^---[\s\S]*?\bdate:\s*(\d{4}-\d{2}-\d{2})[\s\S]*?---", str(content or ""), re.I)
    from_name = re.search(r"\d{4}-\d{2}-\d{2}", Path(file_path).name)
    return normalize_due_date(frontmatter.group(1) if frontmatter else from_name.group(0) if from_name else "")


def research_document_id(relative_path):
    return hashlib.sha1(str(relative_path).encode("utf-8")).hexdigest()


def scan_research_folder():
    store = read_research()
    if not store["folderPath"]:
        raise ValueError("请先选择简报存档目录")
    folder = Path(store["folderPath"]).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise ValueError("简报目录不存在或无法访问")

    previous_by_path = {document["path"]: document for document in store["documents"] if document.get("path")}
    previous_by_relative = {document["relativePath"]: document for document in store["documents"] if document.get("relativePath")}
    found_paths = set()
    matched_ids = set()
    changed_ids = set()
    added = 0
    changed = 0
    documents = []

    for file_path in list_markdown_files(folder):
        content = file_path.read_text(encoding="utf-8", errors="replace")
        stat = file_path.stat()
        relative_path = str(file_path.relative_to(folder))
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        previous = previous_by_path.get(str(file_path)) or previous_by_relative.get(relative_path)
        has_changed = previous is None or previous.get("hash") != digest
        if previous is None:
            added += 1
        elif has_changed:
            changed += 1
        document_id = previous.get("id") if previous else research_document_id(relative_path)
        if has_changed:
            changed_ids.add(document_id)
        found_paths.add(str(file_path))
        if previous is not None:
            matched_ids.add(previous["id"])
        documents.append(
            normalize_research_document(
                {
                    **(previous or {}),
                    "id": document_id,
                    "path": str(file_path),
                    "relativePath": relative_path,
                    "title": extract_research_title(content, file_path),
                    "date": extract_research_date(content, file_path),
                    "hash": digest,
                    "size": stat.st_size,
                    "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
                    "status": "pending" if has_changed else (previous or {}).get("status", "pending"),
                    "insightCount": 0 if has_changed else (previous or {}).get("insightCount", 0),
                    "lastError": "" if has_changed else (previous or {}).get("lastError", ""),
                    "truncated": False if has_changed else (previous or {}).get("truncated", False),
                }
            )
        )

    documents.sort(key=lambda item: str(item.get("date") or item.get("modifiedAt") or ""), reverse=True)
    for previous in store["documents"]:
        if previous["id"] in matched_ids or previous.get("path") in found_paths:
            continue
        documents.append(
            normalize_research_document(
                {**previous, "path": "", "status": "missing", "lastError": "源文件已移动或删除"}
            )
        )

    insights = [
        normalize_research_insight({**insight, "stale": True, "updatedAt": utc_now()})
        if insight.get("sourceDocumentId") in changed_ids
        else insight
        for insight in store["insights"]
    ]
    saved = write_research({**store, "folderPath": str(folder), "documents": documents, "insights": insights})
    return {
        "store": saved,
        "summary": {
            "total": len(documents),
            "added": added,
            "changed": changed,
            "missing": sum(1 for item in documents if item["status"] == "missing"),
        },
    }


def recover_research_documents(store=None):
    """Re-link missing index entries to files that were renamed or moved.

    Briefings are routinely re-exported with a different name (e.g. gaining a
    leading emoji), so match on the normalized file stem and on the briefing
    date before leaving an entry stranded as missing.
    """
    store = reconcile_research_store(store if store is not None else read_research())
    folder_path = str(store.get("folderPath") or "")
    if not folder_path:
        raise ValueError("请先选择简报存档目录")
    folder = Path(folder_path).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError("简报目录不存在或无法访问")

    missing = [document for document in store["documents"] if document.get("status") == "missing"]
    if not missing:
        return {"research": store, "recovered": 0}

    available = {}
    for file_path in list_markdown_files(folder):
        available.setdefault(normalize_research_name(file_path.name), file_path)

    recovered = 0
    recovered_ids = set()
    for document in missing:
        stem = str(document.get("relativePath") or "").strip() or str(document.get("title") or "").strip()
        target = available.get(normalize_research_name(stem))
        if target is None:
            continue
        relative_path = str(target.relative_to(folder))
        index = next((idx for idx, item in enumerate(store["documents"]) if item["id"] == document["id"]), -1)
        if index < 0:
            continue
        store["documents"][index] = normalize_research_document(
            {
                **store["documents"][index],
                "path": str(target),
                "relativePath": relative_path,
                "title": extract_research_title(target.read_text(encoding="utf-8", errors="replace"), target),
                "status": "pending",
                "lastError": "",
            }
        )
        recovered_ids.add(document["id"])
        recovered += 1

    if recovered:
        store = write_research(store)
    return {"research": store, "recovered": recovered}


def normalize_research_name(value):
    """Normalize a briefing filename for equality comparison across re-exports."""
    stem = Path(str(value or "")).stem
    return re.sub(r"[\s_\-（）()【】\[\]📰📅]+", "", stem).lower()


def clear_research_documents(scope):
    """Remove stale or unwanted entries from the briefing index.

    scope=missing  -> drop entries whose source file is gone (the stuck ones)
    scope=pending  -> drop everything still waiting to be analyzed
    scope=analyzed -> drop already analyzed entries (keeps their insights)
    scope=failed   -> drop failed entries
    scope=all      -> reset the whole index, including insights
    """
    allowed = {"missing", "pending", "analyzed", "failed", "all"}
    scope = str(scope or "missing").strip().lower()
    if scope not in allowed:
        raise ValueError("不支持的清理范围")

    store = reconcile_research_store(read_research())
    before = len(store["documents"])
    if scope == "all":
        store["documents"] = []
        store["insights"] = []
    else:
        if scope == "missing":
            keep = lambda document: bool(document.get("path")) and Path(document["path"]).is_file()
        else:
            keep = lambda document: document.get("status") != scope
        removed_ids = {document["id"] for document in store["documents"] if not keep(document)}
        store["documents"] = [document for document in store["documents"] if document["id"] not in removed_ids]
        if removed_ids:
            store["insights"] = [
                insight for insight in store["insights"] if insight.get("sourceDocumentId") not in removed_ids
            ]

    saved = write_research(store)
    return {"research": saved, "removed": before - len(saved["documents"]), "scope": scope}


def trim_text(value, max_len):
    text = str(value or "").strip()
    return text if len(text) <= max_len else text[: max_len - 3] + "..."


def make_title(content):
    first_line = str(content).splitlines()[0].strip() if str(content).splitlines() else ""
    return re.sub(r"^(想法|计划|待办|记录)[:：]\s*", "", first_line)[:24] or "未命名条目"


def summarize(content):
    return trim_text(re.sub(r"\s+", " ", str(content)), 70)


def normalize_due_date(value):
    match = re.search(r"\d{4}-\d{2}-\d{2}", str(value or ""))
    if not match:
        return ""
    try:
        datetime.fromisoformat(match.group(0))
    except ValueError:
        return ""
    return match.group(0)


def parse_model_json(text):
    cleaned = text.strip()
    cleaned = re.sub(r"^```json", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"^```|```$", "", cleaned).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise ValueError("model returned no JSON")
    return json.loads(match.group(0))


def normalize_analysis(raw, original_content):
    if isinstance(raw, dict) and isinstance(raw.get("items"), list):
        items = raw["items"]
    elif isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        items = [raw]
    else:
        items = []

    normalized = []
    used_content = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            content = str(original_content or "").strip()
        if not content or content in used_content:
            continue
        used_content.add(content)
        normalized.append(
            {
                **item,
                "content": content,
                "title": trim_text(str(item.get("title") or make_title(content)), 32),
                "summary": trim_text(str(item.get("summary") or summarize(content)), 110),
                "category": item.get("category") if item.get("category") in CATEGORY_LABELS else "record",
                "priority": item.get("priority") if item.get("priority") in PRIORITIES else "medium",
                "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                "dueDate": normalize_due_date(item.get("dueDate") or item.get("due_date")),
            }
        )
    if not normalized:
        raise ValueError("model returned no valid items")
    return normalized


def model_config(request_config=None):
    request_config = request_config or {}
    provider = env("MODEL_PROVIDER") or request_config.get("provider") or "deepseek"
    if provider == "local":
        provider = "deepseek"
    base_url = env("MODEL_BASE_URL") or request_config.get("baseUrl") or ""
    model = env("MODEL_NAME") or request_config.get("model") or ""
    api_keys = request_config.get("apiKeys") if isinstance(request_config.get("apiKeys"), dict) else {}
    api_key = env("MODEL_API_KEY") or api_keys.get(provider) or request_config.get("apiKey") or ""
    defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["custom"])
    if not base_url:
        base_url = defaults["baseUrl"]
    if not model:
        model = defaults["model"]
    return {"provider": provider, "baseUrl": base_url, "model": model, "apiKey": api_key}


def analyze_content(content, request_config=None):
    cfg = model_config(request_config)
    ensure_model_ready(cfg)
    today = datetime.now().date().isoformat()

    payload = {
        "model": cfg["model"],
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是个人与团队信息中台的内容拆分与分类器。用户可能一次输入多个互不相同的信息单元。"
                    "先拆分成原子条目，再分别分类。只返回 JSON，不要 Markdown。"
                    "返回格式必须是 {\"items\":[{\"content\":\"\",\"title\":\"\",\"summary\":\"\",\"category\":\"\",\"priority\":\"\",\"tags\":[],\"dueDate\":\"\"}]}. "
                    "category 只能是 todo、plan、idea、record。priority 只能是 high、medium、low。"
                    "dueDate 是代办或计划的发生日期/截止日期，必须用 YYYY-MM-DD；没有明确日期就返回空字符串。"
                    "拆分规则：问答保持在同一条；公式/loss、问题、怀疑、待研究问题、论文摘录应拆成不同条；不要丢失原文关键信息。"
                ),
            },
            {
                "role": "user",
                "content": f"今天是 {today}。请拆分并分类下面内容；遇到“明天、后天、下周、下午、月底”等相对时间时，请相对今天解析 dueDate：\n\n{content}",
            },
        ],
    }
    response = http_json(
        "POST",
        f'{cfg["baseUrl"].rstrip("/")}/chat/completions',
        payload,
        {"Authorization": f'Bearer {cfg["apiKey"]}'} if cfg["apiKey"] else {},
    )
    text = (((response.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    return normalize_analysis(parse_model_json(text), content)


def research_messages(document, content):
    return [
        {
            "role": "system",
            "content": (
                "你是严谨的科研简报分析助手。只根据给出的单份 Markdown 简报提取可执行研究线索，不得编造论文结论。"
                "只返回 JSON，不要 Markdown。格式必须是 {\"articleIdeas\":[],\"methods\":[],\"experiments\":[],\"evidence\":[]}。"
                "articleIdeas 每项字段：title、summary、thesis、outline、sourceSection、sourceExcerpt、tags；"
                "methods 每项字段：title、summary、application、sourceSection、sourceExcerpt、tags；"
                "experiments 每项字段：title、summary、hypothesis、setup、variables、metrics、expectedOutcome、risks、sourceSection、sourceExcerpt、tags；"
                "evidence 每项字段：title、claim、summary、supportLevel、rationale、sourceSection、sourceExcerpt、tags。"
                "supportLevel 只能为 direct、indirect、background、counter。"
                "实验思路必须包含可检验假设、对照或变量、评估指标，不满足时不要输出。"
                "证据只能表示支持关系，不得把背景材料写成直接证明。sourceExcerpt 必须来自原文且尽量短。"
                "每类最多 4 条，没有可靠内容就返回空数组。"
            ),
        },
        {
            "role": "user",
            "content": (
                f'来源文件：{document.get("relativePath") or "未知"}\n'
                f'简报日期：{document.get("date") or "未知"}\n\n'
                f"请提取文章 Idea、可借鉴思路、实验思路和证据索引：\n\n{content}"
            ),
        },
    ]


def normalize_research_analysis(raw, document, content):
    groups = [
        ("article", raw.get("articleIdeas") if isinstance(raw, dict) else None),
        ("method", raw.get("methods") if isinstance(raw, dict) else None),
        ("experiment", raw.get("experiments") if isinstance(raw, dict) else None),
        ("evidence", raw.get("evidence") if isinstance(raw, dict) else None),
    ]
    insights = []
    seen = set()
    for insight_type, values in groups:
        if not isinstance(values, list):
            continue
        for value in values[:4]:
            if not isinstance(value, dict):
                continue
            title = str(value.get("title") or value.get("claim") or "").strip()
            if not title:
                continue
            if insight_type == "experiment":
                if not str(value.get("hypothesis") or "").strip() or not str(value.get("setup") or value.get("method") or "").strip():
                    continue
                if not normalize_string_list(value.get("variables"), 10) or not normalize_string_list(value.get("metrics"), 10):
                    continue
            dedup_key = (insight_type, re.sub(r"\W+", "", title).lower())
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            excerpt = str(value.get("sourceExcerpt") or "").strip()
            if excerpt and excerpt not in content:
                excerpt = ""
            insights.append(
                normalize_research_insight(
                    {
                        **value,
                        "sourceExcerpt": excerpt,
                        "type": insight_type,
                        "sourceDocumentId": document["id"],
                        "sourceTitle": document["title"],
                        "sourcePath": document["path"],
                        "sourceRelativePath": document["relativePath"],
                        "sourceDate": document["date"],
                        "sourceHash": document["hash"],
                        "status": "active",
                        "stale": False,
                    }
                )
            )
    return insights


def analyze_research_document(document_id, request_config=None):
    store = reconcile_research_store(read_research())
    document = locate_research_document(store, document_id)
    if not document:
        raise ValueError("未找到所选简报")
    if not document.get("path") or not Path(document["path"]).is_file():
        raise ValueError("简报源文件不存在，请点击“扫描变化”同步目录后重试")
    if not store["folderPath"] or not path_is_inside(store["folderPath"], document["path"]):
        raise ValueError("拒绝读取简报目录之外的文件")

    full_content = Path(document["path"]).read_text(encoding="utf-8", errors="replace")
    content = full_content[:60000]
    cfg = model_config(request_config or {})
    ensure_model_ready(cfg)
    response = http_json(
        "POST",
        f'{cfg["baseUrl"].rstrip("/")}/chat/completions',
        {"model": cfg["model"], "temperature": 0.15, "messages": research_messages(document, content)},
        {"Authorization": f'Bearer {cfg["apiKey"]}'} if cfg["apiKey"] else {},
    )
    text = (((response.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    insights = normalize_research_analysis(parse_model_json(text), document, content)

    current = read_research()
    index = next((idx for idx, item in enumerate(current["documents"]) if item["id"] == document_id), -1)
    if index < 0:
        raise ValueError("简报列表已变化，请重新扫描")
    current["documents"][index] = normalize_research_document(
        {
            **current["documents"][index],
            "path": document["path"],
            "relativePath": document["relativePath"],
            "status": "analyzed",
            "insightCount": len(insights),
            "analyzedAt": utc_now(),
            "lastError": "",
            "truncated": len(full_content) > len(content),
        }
    )
    current["insights"] = insights + [item for item in current["insights"] if item["sourceDocumentId"] != document_id]
    return write_research(current)


def report_item_line(item, index):
    item = normalize_item(item)
    tags = f' 标签：{" ".join("#" + str(tag) for tag in item.get("tags", []))}' if item.get("tags") else ""
    due = f' 日程：{item["dueDate"]}' if item.get("dueDate") else ""
    status = "/已完成" if item.get("status") == "done" else ""
    content = str(item.get("content") or "")[:360]
    return (
        f'{index + 1}. [{CATEGORY_DISPLAY(item["category"])}/{item["priority"]}{status}] {item["title"]}\n'
        f'   日期：{item.get("dueDate") or str(item.get("createdAt") or "")[:10]} 来源：{item["source"]}{due}{tags}\n'
        f'   摘要：{item["summary"]}\n'
        f"   内容：{content}"
    )


def CATEGORY_DISPLAY(category):
    return {"todo": "代办", "plan": "计划", "idea": "想法", "record": "记录", "archive": "归档"}.get(category, category)


def report_messages(report_range, items, options):
    style = str(options.get("style") or "summary")
    tone = str(options.get("tone") or "concise")
    custom = str(options.get("customPrompt") or "").strip()
    style_instruction = {
        "summary": "输出一份阶段总结汇报，突出完成事项、重要进展、待跟进事项和下一步计划。",
        "review": "输出一份复盘汇报，包含目标回顾、完成情况、亮点、问题、原因分析、改进动作和下一周期计划。",
        "mentor": "输出一份适合发给导师/上级的汇报，表达清楚研究或工作进展、遇到的问题、需要反馈的点和下一步安排。",
        "custom": custom or "按用户记录生成一份结构清晰的自定义汇报。",
    }.get(style, "输出一份结构清晰的阶段汇报。")
    content = "\n".join(report_item_line(item, idx) for idx, item in enumerate(items))
    user_content = "\n".join(
        part
        for part in [
            f'汇报周期：{REPORT_PERIOD_LABELS.get(report_range.get("period"), "自定义范围")}',
            f'日期范围：{report_range.get("start")} 至 {report_range.get("end")}',
            f"汇报形式：{REPORT_STYLE_LABELS.get(style, '汇报')}",
            f"语言风格：{REPORT_TONE_LABELS.get(tone, '简洁正式')}",
            f"补充要求：{custom}" if custom else "",
            f"记录数量：{len(items)}",
            "",
            "请按以下要求生成：",
            style_instruction,
            "请包含：标题、概览、分类进展、关键事项、问题/风险、下一步计划。若是导师汇报，请额外加入“需要请教/反馈的问题”。",
            "",
            "原始记录：",
            content,
        ]
        if part
    )
    return [
        {
            "role": "system",
            "content": "你是一个严谨的个人工作复盘与汇报助手。你只根据用户给出的记录生成中文汇报，不编造未出现的事实。可以进行归纳、合并和措辞优化。输出 Markdown，结构清晰，可直接复制给他人。",
        },
        {"role": "user", "content": user_content},
    ]


def generate_report(report_range, items, options=None, request_config=None):
    cfg = model_config(request_config)
    ensure_model_ready(cfg)
    payload = {
        "model": cfg["model"],
        "temperature": 0.2,
        "messages": report_messages(report_range or {}, items or [], options or {}),
    }
    response = http_json(
        "POST",
        f'{cfg["baseUrl"].rstrip("/")}/chat/completions',
        payload,
        {"Authorization": f'Bearer {cfg["apiKey"]}'} if cfg["apiKey"] else {},
    )
    text = (((response.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not text:
        raise ValueError("model returned empty report")
    return text


def ensure_model_ready(cfg):
    if cfg["provider"] == "local" or not cfg["baseUrl"] or not cfg["model"]:
        raise RuntimeError("请先配置 DeepSeek 或兼容模型接口")
    defaults = PROVIDER_DEFAULTS.get(cfg["provider"], PROVIDER_DEFAULTS["custom"])
    if defaults["requiresKey"] and not cfg["apiKey"]:
        raise RuntimeError("请先填写 API Key")


class FileStore:
    name = "file"

    def __init__(self):
        DATA_DIR.mkdir(exist_ok=True)
        if not DATA_FILE.exists():
            DATA_FILE.write_text("[]", encoding="utf-8")

    def list(self):
        return [normalize_item(item) for item in json.loads(DATA_FILE.read_text(encoding="utf-8") or "[]")]

    def save_all(self, items):
        normalized = [normalize_item(item) for item in items]
        DATA_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        return normalized

    def create(self, item):
        items = self.list()
        normalized = normalize_item(item)
        items.insert(0, normalized)
        self.save_all(items)
        return normalized

    def update(self, item_id, patch):
        items = self.list()
        for idx, item in enumerate(items):
            if item["id"] == item_id:
                merged = normalize_item({**item, **patch, "id": item_id, "updatedAt": utc_now()})
                items[idx] = merged
                self.save_all(items)
                return merged
        raise KeyError(item_id)

    def delete(self, item_id):
        items = self.list()
        remaining = [item for item in items if item["id"] != item_id]
        if len(remaining) == len(items):
            raise KeyError(item_id)
        self.save_all(remaining)


class MemosStore:
    name = "memos"

    def __init__(self, base_url, token):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def list(self):
        data = self.request("GET", "/api/v1/memos?page_size=100&pageSize=100")
        memos = data.get("memos") or data.get("memo") or []
        items = []
        for memo in memos:
            item = self.memo_to_item(memo)
            if item:
                items.append(item)
        return sorted(items, key=lambda item: item["createdAt"], reverse=True)

    def create(self, item):
        normalized = normalize_item(item)
        response = self.request(
            "POST",
            "/api/v1/memos",
            {"content": self.item_to_memo(normalized), "visibility": "PRIVATE"},
        )
        return self.memo_to_item(response) or normalized

    def update(self, item_id, patch):
        current = next((item for item in self.list() if item["id"] == item_id), None)
        if not current:
            raise KeyError(item_id)
        merged = normalize_item({**current, **patch, "id": item_id, "updatedAt": utc_now()})
        path = f"/api/v1/{quote(item_id, safe='/')}?update_mask=content"
        response = self.request("PATCH", path, {"content": self.item_to_memo(merged)})
        return self.memo_to_item(response) or merged

    def delete(self, item_id):
        self.request("DELETE", f"/api/v1/{quote(item_id, safe='/')}")

    def save_all(self, items):
        created = []
        for item in items:
            created.append(self.create(item))
        return created

    def request(self, method, path, payload=None):
        return http_json(
            method,
            self.base_url + path,
            payload,
            {"Authorization": f"Bearer {self.token}"},
        )

    def memo_to_item(self, memo):
        content = memo.get("content") or ""
        match = MARKER_RE.search(content)
        if not match:
            return None
        meta = json.loads(match.group(1))
        visible_content = MARKER_RE.sub("", content).strip()
        visible_content = re.sub(r"^#ideahub\s+#\w+(\s+#priority-\w+)?\s*", "", visible_content).strip()
        name = memo.get("name") or meta.get("id") or str(uuid.uuid4())
        return normalize_item(
            {
                **meta,
                "id": name,
                "content": visible_content or meta.get("content") or "",
                "createdAt": memo.get("createTime") or memo.get("created_at") or meta.get("createdAt"),
                "updatedAt": memo.get("updateTime") or memo.get("updated_at") or meta.get("updatedAt"),
            }
        )

    def item_to_memo(self, item):
        meta = {key: value for key, value in item.items() if key != "content"}
        tags = f'#ideahub #{item["category"]} #priority-{item["priority"]}'
        return f'{tags}\n\n{item["content"].strip()}\n\n<!-- ideahub\n{json.dumps(meta, ensure_ascii=False)}\n-->'


def http_json(method, url, payload=None, headers=None):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=body, method=method, headers=request_headers)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw or "{}")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(str(exc)) from exc


def active_store():
    memos_base = env("MEMOS_BASE_URL")
    memos_token = env("MEMOS_ACCESS_TOKEN")
    if memos_base and memos_token:
        return MemosStore(memos_base, memos_token)
    return FileStore()


class Handler(BaseHTTPRequestHandler):
    server_version = "IdeaHub/1.0"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            cfg = model_config()
            defaults = PROVIDER_DEFAULTS.get(cfg["provider"], PROVIDER_DEFAULTS["custom"])
            return self.json(
                {
                    "ok": True,
                    "store": active_store().name,
                    "memosConfigured": bool(env("MEMOS_BASE_URL") and env("MEMOS_ACCESS_TOKEN")),
                    "modelConfigured": bool(cfg["baseUrl"] and cfg["model"] and (cfg["apiKey"] or not defaults["requiresKey"])),
                    "modelProvider": cfg["provider"],
                    "researchSupported": True,
                }
            )
        if parsed.path == "/api/items":
            return self.json({"items": active_store().list()})
        if parsed.path == "/api/staged":
            return self.json({"items": read_staged()})
        if parsed.path == "/api/research":
            return self.json({"research": read_research_synced()})
        return self.serve_static(parsed.path)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        return self.serve_static(parsed.path, include_body=False)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body = read_json_body(self)
            if parsed.path == "/api/classify":
                items = analyze_content(str(body.get("content") or ""), body.get("config") or {})
                return self.json({"result": items[0], "items": items})
            if parsed.path == "/api/report":
                report = generate_report(body.get("range") or {}, body.get("items") or [], body.get("options") or {}, body.get("config") or {})
                return self.json({"report": report})
            if parsed.path == "/api/research/settings":
                folder_path = str(body.get("folderPath") or "").strip()
                resolved_folder = str(Path(folder_path).expanduser().resolve()) if folder_path else ""
                if resolved_folder and (not Path(resolved_folder).exists() or not Path(resolved_folder).is_dir()):
                    return self.error(HTTPStatus.BAD_REQUEST, "所选简报目录不存在或无法访问")
                current = read_research()
                changed = resolved_folder != str(Path(current["folderPath"]).expanduser().resolve()) if current["folderPath"] else bool(resolved_folder)
                if changed and resolved_folder and not current["folderPath"] and current["documents"]:
                    research = remap_research_paths(current, resolved_folder)
                else:
                    research = {
                        **current,
                        "folderPath": resolved_folder,
                        "documents": [] if changed else current["documents"],
                        "insights": [] if changed else current["insights"],
                    }
                return self.json({"research": write_research(research)})
            if parsed.path == "/api/research/scan":
                return self.json(scan_research_folder())
            if parsed.path == "/api/research/clear":
                try:
                    return self.json(clear_research_documents(body.get("scope") or "missing"))
                except ValueError as exc:
                    return self.error(HTTPStatus.BAD_REQUEST, str(exc))
            if parsed.path == "/api/research/recover":
                try:
                    return self.json(recover_research_documents())
                except ValueError as exc:
                    return self.error(HTTPStatus.BAD_REQUEST, str(exc))
            if parsed.path == "/api/research/analyze":
                document_id = str(body.get("documentId") or "")
                if not document_id:
                    return self.error(HTTPStatus.BAD_REQUEST, "documentId is required")
                try:
                    research = analyze_research_document(document_id, body.get("config") or {})
                    return self.json({"research": research})
                except Exception as exc:
                    current = reconcile_research_store(read_research())
                    for index, document in enumerate(current["documents"]):
                        if document["id"] == document_id:
                            source_gone = not document.get("path") or not Path(document["path"]).is_file()
                            current["documents"][index] = normalize_research_document(
                                {
                                    **document,
                                    "status": "missing" if source_gone else "failed",
                                    "lastError": str(exc) or ("源文件已移动或删除" if source_gone else "分析失败"),
                                }
                            )
                            write_research(current)
                            break
                    raise
            if parsed.path == "/api/research/import":
                imported = normalize_research_store(body.get("research") or {})
                current = read_research()
                remapped = remap_research_paths(imported, current["folderPath"])
                return self.json({"research": write_research(remapped)})
            if parsed.path == "/api/staged":
                content = str(body.get("content") or "").strip()
                if not content:
                    return self.error(HTTPStatus.BAD_REQUEST, "content is required")
                items = read_staged()
                item = normalize_staged({**body, "content": content, "createdAt": utc_now()})
                items.insert(0, item)
                write_staged(items)
                return self.json({"item": item, "items": items}, HTTPStatus.CREATED)
            if parsed.path == "/api/staged/sync":
                items = body.get("items")
                if not isinstance(items, list):
                    return self.error(HTTPStatus.BAD_REQUEST, "items must be an array")
                saved = write_staged(items)
                return self.json({"items": saved})
            if parsed.path == "/api/items":
                content = str(body.get("content") or "").strip()
                if not content:
                    return self.error(HTTPStatus.BAD_REQUEST, "content is required")
                analyzed = analyze_content(content, body.get("config") or {})
                store = active_store()
                created = []
                for result in analyzed:
                    item = normalize_item(
                        {
                            **result,
                            "source": body.get("source") or "缓冲区",
                            "status": "active",
                            "createdAt": utc_now(),
                        }
                    )
                    created.append(store.create(item))
                return self.json({"item": created[0], "items": created}, HTTPStatus.CREATED)
            if parsed.path == "/api/import":
                items = body.get("items")
                if not isinstance(items, list):
                    return self.error(HTTPStatus.BAD_REQUEST, "items must be an array")
                saved = active_store().save_all(items)
                return self.json({"items": saved})
            return self.error(HTTPStatus.NOT_FOUND, "not found")
        except Exception as exc:
            return self.error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/research/insights/"):
            try:
                insight_id = unquote(parsed.path.removeprefix("/api/research/insights/"))
                research = read_research()
                index = next((idx for idx, item in enumerate(research["insights"]) if item["id"] == insight_id), -1)
                if index < 0:
                    return self.error(HTTPStatus.NOT_FOUND, "research insight not found")
                patch = read_json_body(self)
                research["insights"][index] = normalize_research_insight(
                    {**research["insights"][index], **patch, "id": insight_id, "updatedAt": utc_now()}
                )
                saved = write_research(research)
                return self.json({"insight": saved["insights"][index], "research": saved})
            except Exception as exc:
                return self.error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
        if not parsed.path.startswith("/api/items/"):
            return self.error(HTTPStatus.NOT_FOUND, "not found")
        try:
            item_id = unquote(parsed.path.removeprefix("/api/items/"))
            patch = read_json_body(self)
            item = active_store().update(item_id, patch)
            return self.json({"item": item})
        except KeyError:
            return self.error(HTTPStatus.NOT_FOUND, "item not found")
        except Exception as exc:
            return self.error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/research/insights/"):
            insight_id = unquote(parsed.path.removeprefix("/api/research/insights/"))
            research = read_research()
            remaining = [item for item in research["insights"] if item["id"] != insight_id]
            if len(remaining) == len(research["insights"]):
                return self.error(HTTPStatus.NOT_FOUND, "research insight not found")
            research["insights"] = remaining
            return self.json({"research": write_research(research)})
        if parsed.path.startswith("/api/staged/"):
            item_id = unquote(parsed.path.removeprefix("/api/staged/"))
            remaining = [item for item in read_staged() if item["id"] != item_id]
            write_staged(remaining)
            return self.json({}, HTTPStatus.NO_CONTENT)
        if not parsed.path.startswith("/api/items/"):
            return self.error(HTTPStatus.NOT_FOUND, "not found")
        try:
            item_id = unquote(parsed.path.removeprefix("/api/items/"))
            active_store().delete(item_id)
            return self.json({}, HTTPStatus.NO_CONTENT)
        except KeyError:
            return self.error(HTTPStatus.NOT_FOUND, "item not found")
        except Exception as exc:
            return self.error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def serve_static(self, path, include_body=True):
        if path in ("", "/"):
            path = "/index.html"
        target = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in target.parents and target != ROOT:
            return self.error(HTTPStatus.FORBIDDEN, "forbidden")
        if not target.exists() or not target.is_file():
            return self.error(HTTPStatus.NOT_FOUND, "not found")
        mime = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".webmanifest": "application/manifest+json; charset=utf-8",
            ".png": "image/png",
            ".svg": "image/svg+xml; charset=utf-8",
        }.get(target.suffix, "application/octet-stream")
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime)
        if target.suffix in {".html", ".css", ".js", ".webmanifest"}:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if include_body:
            self.wfile.write(data)

    def json(self, payload, status=HTTPStatus.OK):
        body = b"" if status == HTTPStatus.NO_CONTENT else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def error(self, status, message):
        return self.json({"error": message}, status)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    host = env("HOST", "0.0.0.0")
    port = int(env("PORT", "5173"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"IdeaHub running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
