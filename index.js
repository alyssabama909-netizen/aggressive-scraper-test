const axios = require('axios');
const cheerio = require('cheerio');
const fakeUa = require('fake-useragent');
const HttpsProxyAgent = require('https-proxy-agent');
const fs = require('fs');

const TARGET_URL = 'https://your-staging-site.com'; // Change to your test environment
const MAX_DEPTH = 3;
const MAX_PAGES_PER_LEVEL = 20;
const PROXIES = [
  'http://proxy1.example.com:port',
  'http://proxy2.example.com:port',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?(`\(?\d{3}\)`?[-.\s]?)\d{3}[-.\s]?\d{4}/g;

function getRandomConfig() {
  const ua = fakeUa();
  const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
  const agent = new HttpsProxyAgent(proxy);
  return {
    headers: {
      'User-Agent': ua,
      'Referer': 'https://google.com',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    httpsAgent: agent,
    timeout: 5000,
  };
}

function extractContactInfo(html) {
  const emails = html.match(EMAIL_REGEX) || [];
  const phones = html.match(PHONE_REGEX) || [];
  return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
}

async function aggressiveScrape(urls, depth) {
  if (depth <= 0) return [];

  console.log(`Scraping level ${MAX_DEPTH - depth + 1} with ${urls.length} URLs`);

  const responses = await Promise.all(
    urls.map(async (url) => {
      try {
        const config = getRandomConfig();
        const response = await axios.get(url, config);
        return { url, data: response.data };
      } catch (error) {
        console.error(`Failed to scrape ${url}: ${error.message}. Retrying once...`);
        try {
          const config = getRandomConfig();
          const response = await axios.get(url, config);
          return { url, data: response.data };
        } catch (retryError) {
          console.error(`Retry failed for ${url}: ${retryError.message}`);
          return null;
        }
      }
    })
  );

  const newUrls = [];
  const scrapedData = [];
  responses.forEach((res) => {
    if (res) {
      const $ = cheerio.load(res.data);
      const fullText = $('body').text();
      const contactInfo = extractContactInfo(fullText);

      scrapedData.push({
        url: res.url,
        title: $('title').text(),
        content: fullText.substring(0, 200) + '...',
        emails: contactInfo.emails,
        phones: contactInfo.phones,
      });

      $('a[href]').each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.startsWith('/') && newUrls.length < MAX_PAGES_PER_LEVEL) {
          newUrls.push(new URL(href, TARGET_URL).href);
        }
      });
    }
  });

  console.log(`Extracted data from ${scrapedData.length} pages, including ${scrapedData.reduce((acc, item) => acc + item.emails.length + item.phones.length, 0)} contacts`);

  const deeperData = await aggressiveScrape(newUrls, depth - 1);
  return [...scrapedData, ...deeperData];
}

async function main() {
  try {
    const initialUrls = [TARGET_URL];
    const allData = await aggressiveScrape(initialUrls, MAX_DEPTH);
    console.log('Scraping complete. Sample data:', allData.slice(0, 5));
    fs.writeFileSync('results.json', JSON.stringify(allData, null, 2));
    console.log('Results saved to results.json');
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

main();
