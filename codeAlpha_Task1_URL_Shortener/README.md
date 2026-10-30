# Task 1 — Simple URL Shortener

## Features
- `POST /api/shorten` accepts a long URL and creates a unique short code.
- `GET /<code>` redirects to the original URL and increments the click count.
- `GET /api/urls/<code>` returns URL details and analytics.
- SQLite storage; URLs are validated to require HTTP or HTTPS.

## Run
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
The API starts at `http://127.0.0.1:5000`.

## Example
```bash
curl -X POST http://127.0.0.1:5000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.example.com/page"}'
```
Then open the returned `short_url`. To see stats, use `GET /api/urls/<code>`.

Optional basic web form is not included; this task focuses on the API and redirect behavior.
