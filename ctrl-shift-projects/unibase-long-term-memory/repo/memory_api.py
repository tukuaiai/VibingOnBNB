#!/usr/bin/env python3
# ==================== 长期记忆演示 API（Unibase Membase） ====================
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
from membase.memory.message import Message
from membase.memory.multi_memory import MultiMemory

load_dotenv()

MEMBASE_ACCOUNT = os.getenv("MEMBASE_ACCOUNT")
MEMBASE_ID = os.getenv("MEMBASE_ID") or "local-instance"
DEFAULT_CONVERSATION_ID = os.getenv("MEMBASE_CONVERSATION_ID") or "default-conv"
PORT = int(os.getenv("MEMORY_API_PORT") or "8901")

STATE_PATH = os.path.join(os.path.dirname(__file__), "memory_state.json")


def load_state():
    if not os.path.exists(STATE_PATH):
        return {}
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state):
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=True, indent=2)


def init_membase():
    if not MEMBASE_ACCOUNT:
        return None
    try:
        mm = MultiMemory(
            membase_account=MEMBASE_ACCOUNT,
            auto_upload_to_hub=True,
            default_conversation_id=DEFAULT_CONVERSATION_ID,
        )
        mm.load_from_hub(DEFAULT_CONVERSATION_ID)
        return mm
    except Exception:
        return None


MM = init_membase()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=True).encode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self._json(200, {"status": "ok", "membase": bool(MM)})

        if parsed.path == "/memory":
            qs = parse_qs(parsed.query)
            user_id = (qs.get("user_id") or ["anon"])[0]
            state = load_state()
            user_state = state.get(user_id, {"preferences": {}, "events": [], "last_actions": []})
            return self._json(200, {"user_id": user_id, **user_state, "membase": bool(MM)})

        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/memory":
            return self._json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid json"})

        user_id = payload.get("user_id") or "anon"
        preferences = payload.get("preferences") or {}
        action = payload.get("action")
        note = payload.get("note")

        state = load_state()
        user_state = state.get(user_id, {"preferences": {}, "events": [], "last_actions": []})
        user_state["preferences"].update(preferences)

        if action:
            user_state["last_actions"].append(action)
            user_state["last_actions"] = user_state["last_actions"][-5:]

        if action or note or preferences:
            event = {
                "ts": int(time.time()),
                "action": action,
                "note": note,
                "preferences": preferences,
            }
            user_state["events"].append(event)
            user_state["events"] = user_state["events"][-50:]

        state[user_id] = user_state
        save_state(state)

        if MM:
            summary = f"user={user_id} action={action} pref={preferences} note={note}"
            msg = Message(name=MEMBASE_ID, role="assistant", content=summary)
            MM.add(msg, DEFAULT_CONVERSATION_ID)

        return self._json(200, {"user_id": user_id, **user_state, "membase": bool(MM)})


def main():
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"✅ Memory API on http://127.0.0.1:{PORT} (membase={bool(MM)})")
    server.serve_forever()


if __name__ == "__main__":
    main()
