# Ledger — Personal Expense Tracker

A full-stack web app for tracking daily and monthly expenses: FastAPI + SQLite backend, vanilla JS frontend, email/password login, and optional "Sign in with Google."

## What's included

- **Email/password auth** with hashed passwords and JWT sessions
- **Google Sign-In** (optional — works without it too)
- **Expenses**: add, edit, delete, search, filter by date/category, sort, paginate
- **Categories**: 10 sensible defaults seeded per user, fully editable, custom colors
- **Dashboard**: today / this week / this month totals, month-over-month change, 6-month trend chart, this-month category breakdown (doughnut chart), recent activity
- **Budgets**: set a monthly limit per category with a progress bar (turns red when over)
- **Settings**: currency, overall monthly budget, change password, sign out
- **CSV export** of all expenses or the currently filtered set

## Project layout

```
expense-tracker/
├── backend/           FastAPI + SQLite API
│   ├── app/
│   │   ├── main.py         app entrypoint
│   │   ├── models.py       SQLAlchemy models (User, Category, Expense, CategoryBudget)
│   │   ├── schemas.py      Pydantic request/response models
│   │   ├── auth.py         password hashing + JWT
│   │   ├── crud.py         default-category seeding
│   │   └── routers/        auth, categories, expenses, reports
│   ├── requirements.txt
│   └── .env.example
└── frontend/           Static HTML/CSS/JS (no build step)
    ├── login.html
    ├── signup.html
    ├── index.html       the dashboard app
    ├── css/style.css
    └── js/               config.js, api.js, auth.js, app.js, charts.js, utils.js
```

## 1. Run the backend

Requires Python 3.10+.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Open .env and set SECRET_KEY to a random string, e.g.:
python -c "import secrets; print(secrets.token_hex(32))"

uvicorn app.main:app --reload --port 8000
```

The API is now at `http://127.0.0.1:8000`. Interactive docs at `http://127.0.0.1:8000/docs`.
A `expenses.db` SQLite file is created automatically on first run — no separate setup needed.

## 2. Run the frontend

The frontend is plain static files — any static server works. From the `frontend/` folder:

```bash
cd frontend
python3 -m http.server 5500
```

Then open `http://127.0.0.1:5500/login.html` in your browser.

If your backend runs somewhere other than `http://127.0.0.1:8000`, edit `frontend/js/config.js`:

```js
window.LEDGER_API_BASE = "http://127.0.0.1:8000";
```

And make sure that origin is listed in `backend/.env` under `CORS_ORIGINS`.

## 3. (Optional) Enable "Sign in with Google"

Email/password sign-up works out of the box with no configuration. Google Sign-In is optional:

1. Go to the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** of type **Web application**.
3. Under **Authorized JavaScript origins**, add the URL you serve the frontend from, e.g. `http://127.0.0.1:5500`.
4. Copy the generated **Client ID**.
5. Paste it into:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/js/config.js` → `window.LEDGER_GOOGLE_CLIENT_ID = "..."`
6. Restart the backend.

Until this is configured, the Google button area on the login/signup pages simply shows a note and email/password sign-in keeps working normally.

## How auth works

- Email/password: password is hashed with bcrypt server-side; login returns a JWT (default validity: 7 days, configurable via `ACCESS_TOKEN_EXPIRE_MINUTES` in `.env`).
- Google: the frontend uses Google Identity Services to get an ID token, which the backend verifies server-side against your `GOOGLE_CLIENT_ID` before issuing the same kind of JWT. No Google secret ever touches the frontend.
- The JWT is stored in the browser's `localStorage` and sent as `Authorization: Bearer <token>` on every API call.

## Notes on going further

- **Production**: put a real secret in `SECRET_KEY`, serve the frontend over HTTPS, and switch `DATABASE_URL` to Postgres if you outgrow SQLite (see below).
- **Switching to Postgres**: set `DATABASE_URL` in `.env` to your Postgres connection string (e.g. from [Neon](https://neon.tech)) — see the example in `.env.example`. Tables are created automatically on first run. If you have existing data in `expenses.db`, copy it over first:
  ```bash
  cd backend
  python -m scripts.migrate_sqlite_to_postgres --postgres-url "postgresql://user:pass@host/db?sslmode=require"
  ```
- **Multi-device**: since data lives in the SQLite file next to the backend, run the backend somewhere reachable (a small VPS, etc.) rather than only on localhost if you want to use the app from your phone too.
- **Backups**: `expenses.db` is a single file — copy it to back up all your data.
