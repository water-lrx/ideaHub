#!/usr/bin/env python3
import json
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
MARKER_RE = re.compile(r"<!--\s*ideahub\s*(\{.*?\})\s*-->", re.DOTALL)

CATEGORY_LABELS = {"todo", "plan", "idea", "record", "archive"}
PRIORITIES = {"high", "medium", "low"}


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
    base_url = env("MODEL_BASE_URL") or request_config.get("baseUrl") or ""
    model = env("MODEL_NAME") or request_config.get("model") or ""
    api_key = env("MODEL_API_KEY") or request_config.get("apiKey") or ""
    if provider == "deepseek" and not base_url:
        base_url = "https://api.deepseek.com/v1"
    if provider == "deepseek" and not model:
        model = "deepseek-chat"
    if provider == "openai" and not base_url:
        base_url = "https://api.openai.com/v1"
    if provider == "openai" and not model:
        model = "gpt-4.1-mini"
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


def ensure_model_ready(cfg):
    if cfg["provider"] == "local" or not cfg["baseUrl"] or not cfg["model"]:
        raise RuntimeError("请先配置 DeepSeek 或兼容模型接口")
    if cfg["provider"] in {"deepseek", "openai"} and not cfg["apiKey"]:
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
            return self.json(
                {
                    "ok": True,
                    "store": active_store().name,
                    "memosConfigured": bool(env("MEMOS_BASE_URL") and env("MEMOS_ACCESS_TOKEN")),
                    "modelConfigured": bool(env("MODEL_API_KEY")),
                    "modelProvider": model_config().get("provider"),
                }
            )
        if parsed.path == "/api/items":
            return self.json({"items": active_store().list()})
        if parsed.path == "/api/staged":
            return self.json({"items": read_staged()})
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
