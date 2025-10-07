# Aggressive Scraper Test (staging use)

Node scraper that crawls **same-origin** links up to a depth, extracts **emails & phones**, writes to `output/results.json`.

## Env Vars
- `TARGET_URL` (required for real runs) — staging origin to crawl
- `MAX_DEPTH` (default 3)
- `MAX_PAGES_PER_LEVEL` (default 20)
- `PROXIES` (optional) — comma-separated list, e.g. `http://user:pass@host:port,https://host:port`

## Run locally
```bash
npm install
TARGET_URL="https://your-staging-site.com" npm start
