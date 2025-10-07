// index.js
// Safe, staging-only crawler: extracts emails & phone numbers and writes results.json
// Reads TARGET_URL, PROXIES, MAX_DEPTH, MAX_PAGES_PER_LEVEL from environment (or uses defaults)

const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const fs = require('fs');
const { URL } = require('url');

// ---------- Config (env overrides recommended) ----------
const TARGET_URL = process.env.TARGET_URL || 'https://example.com'; // <- put your staging URL here or via Secrets
const MAX_DEPTH = Number(process.env.MAX_DEPTH || 3);
const MAX_PAGES_PER_LEVEL = Number(process.env.MAX_PAGES_PER_LEVEL || 20);
// PROXIES as comma-separated list: http://user:pass@host:port,https://host:port
const PROXIES = (process.env.PROXIES || '').split(',').map(s => s.trim()).filter(Boolean);

// ---------- Regex (de-duped later) ----------
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Fixed phone regex (US/Intl-ish; no stray backticks)
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)\d{3,4}[-.\s]?\d{4}/g;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getAxiosConfig(forUrl) {
  const ua = fakeUa();
  const cfg = {
    headers: {
      'User-Agent': ua,
      'Referer': 'https://www.google.com/',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: 10000,
    // axios follows redirects by default
    maxRedirects: 5,
    // make relative to target origin
    validateStatus: s => s >= 200 && s < 400
  };

  if (PROXIES.length) {
    const proxy = pick(PROXIES);
    // Only attach proxy agent for https URLs (most targets)
    if (forUrl.startsWith('https://')) {
      cfg.httpsAgent = new HttpsProxyAgent(proxy);
    }
  }
  return cfg;
}

function extractContactInfo(html) {
  const emails = new Set((html.match(EMAIL_REGEX) || []).map(s => s.trim()));
  const phones = new Set((html.match(PHONE_REGEX) || []).map(s => s.trim()));
  return { emails: [...emails], phones: [...phones] };
}

function sameOrigin(href, base) {
  try {
    const u = new URL(href, base);
    const b = new URL(base);
    return u.origin === b.origin;
  } catch { return false; }
}

async function fetchPage(url) {
  try {
    const res = await axios.get(url, getAxiosConfig(url));
    return res.data;
  } catch (e) {
    // One retry with a new UA/proxy
    try {
      const res = await axios.get(url, getAxiosConfig(url));
      return res.data;
    } catch (e2) {
      console.error(`✖ ${url} -> ${e2.message}`);
      return null;
    }
  }
}

async function crawl(startUrl, maxDepth, perLevelLimit) {
  const visited = new Set();
  const queueByDepth = [[startUrl]];
  const results = [];

  for (let depth = 0; depth < maxDepth; depth++) {
    const batch = queueByDepth[depth] || [];
    if (!batch.length) break;

    console.log(`\n▶ Depth ${depth + 1}/${maxDepth} — ${batch.length} URL(s)`);
    const nextLevel = [];

    // Limit pages per level for safety
    const slice = batch.slice(0, perLevelLimit);

    await Promise.all(slice.map(async (url) => {
      if (visited.has(url)) return;
      visited.add(url);

      const html = await fetchPage(url);
      if (!html) return;

      const $ = cheerio.load(html);
      const text = $('body').text() || '';
      const contact = extractContactInfo(text);

      results.push({
        url,
        title: ($('title').text() || '').trim(),
        preview: text.slice(0, 200).replace(/\s+/g, ' ') + (text.length > 200 ? '…' : ''),
        emails: contact.emails,
        phones: contact.phones
      });

      // Discover links on same origin
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        try {
          const abs = new URL(href, url).toString();
          if (sameOrigin(abs, startUrl) && !visited.has(abs)) {
            nextLevel.push(abs);
          }
        } catch { /* ignore bad URLs */ }
      });
    }));

    console.log(`✓ Collected ${results.length} page(s) so far`);

    if (nextLevel.length) {
      queueByDepth[depth + 1] = nextLevel;
    }
  }

  return results;
}

(async function main() {
  try {
    console.log(`Starting crawl: ${TARGET_URL}`);
    const data = await crawl(TARGET_URL, MAX_DEPTH, MAX_PAGES_PER_LEVEL);
    fs.mkdirSync('output', { recursive: true });
    fs.writeFileSync('output/results.json', JSON.stringify(data, null, 2));
    console.log(`\nDone. Wrote output/results.json (${data.length} page records).`);
  } catch (e) {
    console.error('Fatal:', e);
    process.exit(1);
  }
})();
