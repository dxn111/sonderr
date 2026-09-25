"use strict";

const assert = require("node:assert/strict");
const { parseSearchResults, htmlToText, relevantExcerpt, normalizeSearchDomain, matchesSearchDomain, isPublicAddress, assertPublicHttps, searchWeb, researchWeb, boundedExcerptBudget } = require("../server/web");

const html = `<!doctype html><html><body>
  <div class="result results_links">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsolana.com%2Fdocs&amp;rut=example">Solana &amp; Docs</a>
    <a class="result__snippet">Read the <b>official</b> docs.</a>
  </div>
  <div class="result results_links">
    <a rel="nofollow" class="result__a" href="https://example.org/research">Research source</a>
    <a class="result__snippet">A useful public result.</a>
  </div>
  <div class="result results_links">
    <a class="result__a" href="https://example.org/research#section">Duplicate with fragment</a>
    <a class="result__snippet">Duplicate result content.</a>
  </div>
  <div class="result results_links">
    <a class="result__a" href="http://insecure.example/research">Insecure result</a>
    <a class="result__snippet">This page cannot be opened by the HTTPS-only reader.</a>
  </div>
  <script>window.secret = 'not included';</script>
</body></html>`;

const results = parseSearchResults(html, 6);
assert.equal(results.length, 2);
assert.equal(results[0].title, "Solana & Docs");
assert.equal(results[0].url, "https://solana.com/docs");
assert.match(results[0].snippet, /official docs/i);
assert.equal(results[1].url, "https://example.org/research");
assert.equal(results.length, 2, "search results remove duplicate links and HTTP-only pages that cannot be opened safely");
assert.deepEqual(parseSearchResults('<a class="result__a" href="https://example.org/?api_key=private">Credential URL</a>'), [], "search output drops links with credential-like parameters");
assert.deepEqual(parseSearchResults(`<a class="result__a" href="https://example.org/${"a".repeat(2_100)}">Oversized URL</a>`), [], "search output drops URLs too long to be useful in prompts");
const capped = parseSearchResults(`<a class="result__a" href="https://example.org/long">${"Title ".repeat(100)}</a><a class="result__snippet">${"Snippet detail ".repeat(100)}</a>`)[0];
assert.equal(capped.title.length, 180, "search titles are hard-capped to limit context size");
assert.equal(capped.snippet.length, 420, "search snippets are hard-capped to limit context size");
assert.doesNotMatch(htmlToText(html), /window\.secret/);
const noisyPage = [
  "Cookie settings and navigation unrelated content. ".repeat(3),
  "The protocol overview introduces general concepts. ".repeat(2),
  "TPM compaction reduces token use by keeping relevant source evidence. ".repeat(2),
  "Appendix material and navigation links. ".repeat(3)
].join("\n");
const focused = relevantExcerpt(noisyPage, "TPM compaction token optimization", 150);
assert.ok(focused.length <= 150, "focused page excerpts stay within their hard character budget");
assert.match(focused, /TPM compaction/);
assert.doesNotMatch(focused, /Cookie settings/);
const longParagraph = `${"Introductory unrelated material ".repeat(120)}Critical protocol fee calculation belongs here. ${"appendix material ".repeat(150)}`;
const deepFocus = relevantExcerpt(longParagraph, "protocol fee calculation", 1_200);
assert.match(deepFocus, /Critical protocol fee calculation/, "focus extracts a window around a match buried inside an oversized paragraph");
assert.equal(isPublicAddress("8.8.8.8"), true);
assert.equal(isPublicAddress("127.0.0.1"), false);
assert.equal(isPublicAddress("10.1.2.3"), false);
assert.equal(isPublicAddress("169.254.10.2"), false);
assert.equal(isPublicAddress("::1"), false);
assert.equal(isPublicAddress("fc00::1"), false);
assert.equal(normalizeSearchDomain("Solana.com."), "solana.com");
assert.equal(matchesSearchDomain("https://faucet.solana.com/", "solana.com"), true);
assert.equal(matchesSearchDomain("https://solana.com.evil.example/", "solana.com"), false, "official-domain filters require an exact hostname boundary");
assert.equal(boundedExcerptBudget(4_000), 4_000);
assert.equal(boundedExcerptBudget(50_000), 10_000, "page excerpt budgets cannot exceed the global context cap");
assert.equal(boundedExcerptBudget(100), 1_000, "page excerpt budgets retain a useful minimum");

(async () => {
  const opened = [];
  const report = await researchWeb({ query: "current Solana faucet terms", pageLimit: 2 }, {
    searchWeb: async input => ({ provider: "test", query: input.query, searchedAt: "2026-09-25T00:00:00Z", results: [
      { title: "Official", url: "https://example.org/official", snippet: "terms" },
      { title: "Unreadable", url: "https://example.org/private", snippet: "skip" },
      { title: "Backup", url: "https://example.org/backup", snippet: "backup" },
      { title: "Beyond attempt cap", url: "https://example.org/last", snippet: "last" }
    ] }),
    openWebPage: async input => {
      opened.push(input);
      if (input.url.endsWith("/private")) throw new Error("blocked local/private host");
      return { url: input.url, fetchedAt: "2026-09-25T00:00:01Z", content: "page evidence", truncated: false };
    }
  });
  assert.equal(report.sources.length, 2, "research gathers only the requested bounded page count");
  assert.equal(report.unreadableSources.length, 1, "an unreadable result does not discard successful pages");
  assert.ok(opened.every(input => input.maxChars === 4_000), "each source excerpt gets a bounded context budget");
  assert.equal(opened.length, 3, "it stops after enough readable pages are found");
  assert.match(report.note, /No forms, logins, claims, or transactions/i);
  console.log("bounded web research tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

(async () => {
  await assert.rejects(assertPublicHttps("http://example.com"), /HTTPS/);
  await assert.rejects(assertPublicHttps("https://127.0.0.1/"), /private, reserved/);
  await assert.rejects(assertPublicHttps("https://localhost/"), /Local or reserved/);
  await assert.rejects(searchWeb({ query: "search user@example.com" }), /private credentials or contact details/);
  await assert.rejects(searchWeb({ query: "faucet terms", site: "https://solana.com/path" }), /public DNS hostname/);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
