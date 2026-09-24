---
id: web-scraping
name: Web scraping
category: Engineering
icon: ⇅
triggers: scrape, scraping, crawler, spider, extract data from website, html parsing, beautifulsoup, puppeteer, playwright scrape, price monitor
summary: Extract web data respectfully — inspect structure first, parse defensively, rate-limit and cache.
---
## When to use
- Pulling structured data from web pages or APIs into files: price lists, tables, article text, monitoring.

## Approach
Inspect before you parse: fetch the page, read the real HTML/JSON structure, and check for an official API or data export first — scraping a brittle page when an API exists is a bug, not a shortcut.

## Steps
1. Fetch and inspect the target with tools (curl or a small script); locate the data in the DOM or network response; prefer JSON endpoints over HTML when available.
2. Write the extractor against stable anchors (semantic tags, data attributes, IDs), not positional nth-child chains that break on redesign.
3. Parse defensively: every field tolerates absence (null, not crash); log rows that failed shape validation instead of dropping them silently.
4. Rate-limit requests, set a real User-Agent, cache raw responses to disk so re-runs do not re-hit the site.
5. Run it, eyeball the first 10 rows against the live page, then scale up.
6. Output clean CSV/JSON to the workspace and present it with present_file.

## Pitfalls
- Regex-parsing HTML; hammering a site in a tight loop; scraping data whose license forbids reuse.
- Silent encoding bugs (UTF-8 vs latin-1) that corrupt characters in the output.

## Verify
- Compare a small sample of extracted rows with the source page and include the retrieval time.
- Confirm rate limits, caching, and the site's terms/robots guidance before scaling collection.
- Report missing fields and parse failures instead of silently dropping or fabricating values.
