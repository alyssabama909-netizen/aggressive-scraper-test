# aggressive-scraper-test
const axios = require('axios');
const cheerio = require('cheerio');
const fakeUa = require('fake-useragent');
const HttpsProxyAgent = require('https-proxy-agent');
const fs = require('fs'); // Built-in Node module for file writing

// Configurable settings
const TARGET_URL = 'https://your-staging-site.com'; // Change to your test environment
const MAX_DEPTH = 3; // How deep to crawl (levels of link following)
const MAX_PAGES_PER_LEVEL = 20; // Limit to prevent infinite crawling
const PROXIES = [ // Add free/test proxies; rotate for evasion (e.g., from public lists)
  'http://proxy1.example.com:port',
  'http://proxy2.example.com:port',
  // Add more; in production testing, use a proxy service API
];

// Regex patterns for extraction (customize as needed)
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g; // Matches common US/international formats

// Function to get a random proxy and user agent
function getRandomConfig() {
  const ua = fakeUa();
  const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
  const agent = new HttpsProxyAgent(proxy);
  return {
    headers: {
      'User-Agent': ua,
      'Referer': 'https://google.com', // Random referrer for evasion
      'Accept-Language': 'en-US,en;q=0.9',
    },
    httpsAgent: agent,
    timeout: 5000, // Short timeout to retry quickly
  };
}

// Function to extract phones and emails from page content
function extractContactInfo(html) {
  const emails = html.match(EMAIL_REGEX) || [];
  const phones = html.match(PHONE_REGEX) || [];
  return { emails: [...new Set(emails)], phones: [...new Set(phones)] }; // Dedupe
}

// Recursive async function for deep, parallel scraping
async function aggressiveScrape(urls, depth) {
  if (depth <= 0) return [];

  console.log(`Scraping level ${MAX_DEPTH - depth + 1} with ${urls.length} URLs`);

  // Fire requests in parallel (no rate limiting)
  const responses = await Promise.all(
    urls.map(async (url) => {
      try {
        const config = getRandomConfig();
        const response = await axios.get(url, config);
        return { url, data: response.data };
      } catch (error) {
        console.error(`Failed to scrape ${url}: ${error.message}. Retrying once...`);
        try {
          // Aggressive retry with new config
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

  // Process responses: Extract data and new links
  const newUrls = [];
  const scrapedData = [];
  responses.forEach((res) => {
    if (res) {
      const $ = cheerio.load(res.data);
      const fullText = $('body').text(); // Full text for regex scanning
      const contactInfo = extractContactInfo(fullText);

      scrapedData.push({
        url: res.url,
        title: $('title').text(), // Example general extraction
        content: fullText.substring(0, 200) + '...', // Snippet for logging
        emails: contactInfo.emails,
        phones: contactInfo.phones,
      });

      // Collect new links for deeper crawl (mimic bot exploration)
      $('a[href]').each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.startsWith('/') && newUrls.length < MAX_PAGES_PER_LEVEL) {
          newUrls.push(new URL(href, TARGET_URL).href); // Resolve relative URLs
        }
      });
    }
  });

  console.log(`Extracted data from ${scrapedData.length} pages at this level, including ${scrapedData.reduce((acc, item) => acc + item.emails.length + item.phones.length, 0)} contacts`);

  // Recurse deeper with new URLs
  const deeperData = await aggressiveScrape(newUrls, depth - 1);
  return [...scrapedData, ...deeperData];
}

// Start the scrape (ignores robots.txt intentionally for testing)
async function main() {
  try {
    const initialUrls = [TARGET_URL];
    const allData = await aggressiveScrape(initialUrls, MAX_DEPTH);
    console.log('Scraping complete. Sample data:', allData.slice(0, 5)); // Log subset for reference
    
    // Save full results to file
    fs.writeFileSync('results.json', JSON.stringify(allData, null, 2));
    console.log('Results saved to results.json');
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

main();
