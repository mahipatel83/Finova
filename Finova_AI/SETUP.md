# Finova — Real DB Auth Setup

## What changed
- New `accounts` Django app: real signup/login backed by Django's `User`
  table + a DB-stored auth token (no more mock tokens). Signing up twice
  with the same email is rejected; logging in checks the real password
  hash. Only a registered user with a valid token can reach `/api/dashboard/`.
- `finovaai/settings.py` now points at **PostgreSQL** (via env vars).
- `Dashboard.jsx` rebuilt to match your screenshot: real ₹0.00 empty
  state for a brand-new account, a "Good Morning/Afternoon/Evening/Night"
  greeting computed from the visitor's own clock, and the actual signed-up
  user's name pulled from the database.

## 1. Create the Postgres database
```bash
# make sure postgresql is installed & running, then:
createdb finovaai
# or:
psql -c "CREATE DATABASE finovaai;"
```

## 2. Configure credentials
```bash
cd finovaai
cp .env.example .env
# edit .env with your real Postgres user/password/host/port
```

## 3. Backend
```bash
cd finovaai
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```

## 4. Frontend
```bash
cd frontend
npm install
npm run dev      # dev server on :5173, proxies API calls to :8000
```

## How auth now works
1. `POST /api/register/` — creates a real `User` row (rejects duplicate
   emails with a 409), issues a DB token.
2. `POST /api/login/` — looks the email up in the DB; if it doesn't
   exist you get "No account found... please sign up first"; if the
   password hash doesn't match you get "Incorrect password."
3. Every dashboard request sends `Authorization: Token <key>`; the
   backend verifies that token against the `AuthToken` table before
   returning any data — so only the person who signed up can log in
   and see their own dashboard.
4. `POST /api/logout/` deletes the token.

## Production notes
- Set `DEBUG = False` and a real `SECRET_KEY` before deploying.
- `ALLOWED_HOSTS` and `CORS_ALLOW_ALL_ORIGINS` are wide open for local
  dev — lock these down for production.


## AI chat assistant: predictions and recommendations
The chat (`POST /api/ai-chat/`, code in `finovaai/accounts/ai_service.py`) now also:
- **Predicts expenses** - "Predict my expenses", "How much will I spend this month?", "Next month estimate".
  Uses your spending pace so far plus the average of your previous 3 months (unpaid bills due are a minimum).
- **Predicts the balance of EVERY budget you set** (not only food) - "Predicted balance of each budget",
  "Will I exceed my shopping budget?", "How much is left in my gym budget?". Any budget name you create works.
- **Gives recommendations** - "Give me recommendations", "Advice on my food budget" (over-budget, daily limit to stay
  inside, unused money you could move to a savings goal, categories with no budget).
- The side panel lists every budget with a progress bar and its predicted month-end balance.

Predictions are plain maths on the logged-in user's own transactions. The Random Forest is still only used for the
Affordable / Not Affordable answer. No new packages or migrations are needed.


## Phone push reminders (bill due tomorrow + due today)

Reminders ring on the phone even when the app is closed.

1. `pip install -r requirements.txt` (adds `pywebpush`, `tzdata`) then `python manage.py migrate`
2. Build the frontend once so the service worker is included: `cd frontend && npm run build`
3. `python manage.py runserver` - this also starts a background check every 15 minutes.
   Reminders go out after 9:00 AM India time (change with `REMINDER_HOUR` / `REMINDER_TIME_ZONE` in `.env`).
   A bill that is already due today/tomorrow when you add it is pushed immediately.
4. On each device: open the app, click the bell, press **Enable on this device**, allow notifications.
   Use **Send test** to confirm.

Requirements and notes
- Push only works on **https** or `localhost`. To use it on a real phone, deploy with https
  (or use a tunnel such as ngrok/Cloudflare Tunnel while testing).
- iPhone (iOS 16.4+): Share -> **Add to Home Screen**, open Finova from the home screen, then enable.
- VAPID keys are auto-created in `finovaai/.vapid_keys.json` on first run. Do not delete or share it;
  a new key invalidates existing subscriptions. To use your own: `python manage.py generate_vapid_keys`.
- Without `runserver` (production): schedule `python manage.py send_bill_reminders` daily with
  cron / Task Scheduler, or run `python manage.py send_bill_reminders --loop`.
- The notification sound is the phone's own notification sound (browsers can't choose a custom one).


## Deploying so it works on a phone

1. **Use https.** Push notifications only work on an https address (Render, Railway, Fly.io, PythonAnywhere etc. give you one).
2. **Build the frontend** before deploying: `cd frontend && npm install && npm run build` (the `dist/` folder is served by Django).
3. **Install**: `pip install -r requirements.txt` (now includes `gunicorn` and `whitenoise`).
4. **Environment variables on the host** (see `finovaai/.env.example`):
   - Database: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`
   - `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY=<random>`, `DJANGO_ALLOWED_HOSTS=<your domain>`, `DJANGO_CSRF_TRUSTED_ORIGINS=https://<your domain>`
   - **Push keys:** run `python manage.py generate_vapid_keys` once and save the printed values as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
     Most hosts erase local files on restart, so do not rely on `.vapid_keys.json` - new keys silently break every phone's subscription.
5. **Start commands** (a `Procfile` is included):
   - Web: `python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn finovaai.wsgi:application`
   - Reminders: `python manage.py send_bill_reminders --loop` as a second process (worker). The automatic scheduler only runs under `runserver`.
     If your host has no worker option, run `python manage.py send_bill_reminders` once a day from a cron job instead.
6. **On the phone:** open the site, tap the bell, **Enable on this device**, allow notifications, then **Send test**.
   iPhone (iOS 16.4+): Share -> Add to Home Screen, then open the app from the home-screen icon first.
