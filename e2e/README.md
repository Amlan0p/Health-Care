# Browser end-to-end checks (optional, not part of `npm test`)

Scripted Chromium checks (Python + Playwright) that drive the real UI against the real backend and a PostgreSQL database.

```bash
pip install playwright && playwright install chromium

# terminal 1 — fake Groq endpoint (so no real key or network is needed)
node e2e/mock_groq.js

# terminal 2 — backend serving the frontend on :3055 (use a throw-away database, not production!)
cd backend
DATABASE_URL=postgresql://USER:PASS@localhost:5432/healthcare_dev PORT=3055 BCRYPT_ROUNDS=4 \
AUTH_RATE_LIMIT_MAX=1000 AI_RATE_LIMIT_MAX=1000 \
GROQ_API_KEY=test-key-not-real GROQ_API_URL=http://127.0.0.1:3077/v1/chat/completions \
node server.js

# terminal 3
python3 e2e/e2e.py            # 50 functional checks (signup, CRUD persistence, XSS, chat, demo, logout, a11y …)
python3 e2e/overflow.py home  # horizontal-overflow check, home page, 11 viewports
python3 e2e/overflow.py dash  # same for every dashboard panel (uses the demo account)
```

The scripts create users/messages in the database they are pointed at.
