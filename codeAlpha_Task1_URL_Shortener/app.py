import os
import re
import sqlite3
import secrets
import string
from urllib.parse import urlparse
from flask import Flask, jsonify, request, redirect, g

app = Flask(__name__)
DATABASE = os.getenv("DATABASE_PATH", "urls.db")
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5000")
CODE_CHARS = string.ascii_letters + string.digits

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_error):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                original_url TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                clicks INTEGER NOT NULL DEFAULT 0
            )
        """)

def valid_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)

def make_code(length=7):
    return ''.join(secrets.choice(CODE_CHARS) for _ in range(length))

@app.get("/")
def index():
    return jsonify({
        "service": "CodeAlpha URL Shortener",
        "endpoints": {
            "POST /api/shorten": {"body": {"url": "https://example.com"}},
            "GET /<code>": "Redirect to original URL",
            "GET /api/urls/<code>": "URL details and click count"
        }
    })

@app.post("/api/shorten")
def shorten():
    data = request.get_json(silent=True) or {}
    original_url = data.get("url", "").strip()
    if not valid_url(original_url):
        return jsonify({"error": "Provide a valid http:// or https:// URL."}), 400

    conn = db()
    for _ in range(10):
        code = make_code()
        try:
            conn.execute("INSERT INTO urls (code, original_url) VALUES (?, ?)", (code, original_url))
            conn.commit()
            return jsonify({
                "code": code,
                "original_url": original_url,
                "short_url": f"{BASE_URL.rstrip('/')}/{code}"
            }), 201
        except sqlite3.IntegrityError:
            continue
    return jsonify({"error": "Could not generate a unique short code. Try again."}), 500

@app.get("/<code>")
def follow_short_url(code):
    row = db().execute("SELECT original_url FROM urls WHERE code = ?", (code,)).fetchone()
    if row is None:
        return jsonify({"error": "Short URL not found."}), 404
    db().execute("UPDATE urls SET clicks = clicks + 1 WHERE code = ?", (code,))
    db().commit()
    return redirect(row["original_url"], code=302)

@app.get("/api/urls/<code>")
def url_details(code):
    row = db().execute(
        "SELECT code, original_url, created_at, clicks FROM urls WHERE code = ?", (code,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "Short URL not found."}), 404
    result = dict(row)
    result["short_url"] = f"{BASE_URL.rstrip('/')}/{code}"
    return jsonify(result)

if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
