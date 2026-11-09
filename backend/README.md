# StakeKing backend

The PrimeStake/Oddaroa engine + Supabase-compatible adapter that powers
the StakeKing frontend. Zero dependencies; plain Node.

## Hosts

- Railway (primary): service `stakeking-api` in project `stakeking`,
  root directory `backend/`, start `node server.js`, public domain
  stakeking-api-production.up.railway.app. Deploys on push to main.
- Vercel (fallback): project `stakeking-api`, deployed as a packed
  single-function copy (staging dir ~/workspace/stakeking-backend-deploy).

## Required env

SESSION_SECRET, ADAPTER_SERVICE_KEY, DATABASE_URL (Neon project
"stakeking"). Optional: SHINOBIPAY_SECRET_KEY, SHINOBIPAY_WEBHOOK_SECRET,
API_FOOTBALL_KEY.
