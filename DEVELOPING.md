# Developing Shadey

## Layout

- `frontend/`: Vite + React site
- `backend/`: Express API (`src/app.ts` is the entry Vercel runs)

## Run it locally

Copy `.env.example` to `.env` in both folders first. `VITE_API_URL` in `frontend/.env` is the backend the dev server forwards to.

Then run both, each in its own terminal:

```sh
cd backend && npm install && npm run dev    # API on :3001
cd frontend && npm install && npm run dev   # site on :5173, forwards /api, /p, /og to :3001
```

Each folder has `npm test`, `npm run typecheck` and `npm run lint`.

## Deploy

Two Vercel projects from this repo:

1. **Backend:** Root Directory `backend`. Vercel detects Express. Deploy it first and copy its URL.
2. **Frontend:** Root Directory `frontend`. Vercel detects Vite. Before deploying, put the backend URL in `frontend/vercel.json` (replace `https://shadey-backend.vercel.app` if yours differs).

The frontend forwards `/api`, `/p` and `/og` to the backend, so the browser only talks to one domain and sign-in cookies work.

## Screenshots

The images in `.github/images/` are screenshots of the running app. `hero.png` is the same file as `frontend/public/og.png`, the site's link preview.

## Reports and takedowns

Share pages have a "Report this painting" link. To review reports, set `ADMIN_LOGINS` in the backend's environment to your GitHub login, or several separated by commas. Sign in as one of them and open `/admin` to see reported paintings. "Take down" hides the share page and its preview image. "Put back" restores them, and neither touches the owner's repo.
