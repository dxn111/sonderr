"use strict";

const assert = require("node:assert/strict");
const { parseSearchResults, htmlToText, isPublicAddress, assertPublicHttps, searchWeb } = require("../server/web");

const html = `<!doctype html><html><body>
  <div class="result results_links">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsolana.com%2Fdocs&amp;rut=example">Solana &amp; Docs</a>
    <a class="result__snippet">Read the <b>official</b> docs.</a>
  </div>
  <div class="result results_links">
    <a rel="nofollow" class="result__a" href="https://example.org/research">Research source</a>
    <a class="result__snippet">A useful public result.</a>
  </div>
  <script>window.secret = 'not included';</script>
</body></html>`;

const results = parseSearchResults(html, 6);
assert.equal(results.length, 2);
assert.equal(results[0].title, "Solana & Docs");
assert.equal(results[0].url, "https://solana.com/docs");
assert.match(results[0].snippet, /official docs/i);
assert.doesNotMatch(htmlToText(html), /window\.secret/);
assert.equal(isPublicAddress("8.8.8.8"), true);
assert.equal(isPublicAddress("127.0.0.1"), false);
assert.equal(isPublicAddress("10.1.2.3"), false);
assert.equal(isPublicAddress("169.254.10.2"), false);
assert.equal(isPublicAddress("::1"), false);
assert.equal(isPublicAddress("fc00::1"), false);

(async () => {
  await assert.rejects(assertPublicHttps("http://example.com"), /HTTPS/);
  await assert.rejects(assertPublicHttps("https://127.0.0.1/"), /private, reserved/);
  await assert.rejects(assertPublicHttps("https://localhost/"), /Local or reserved/);
  await assert.rejects(searchWeb({ query: "search user@example.com" }), /private credentials or contact details/);
  console.log("bounded web research tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
