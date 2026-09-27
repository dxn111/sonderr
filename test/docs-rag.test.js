"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { retrieve, splitChunks, toPromptContext, SOURCES } = require("../server/docs-rag");

test("local Sonderr docs retrieval ranks the relevant program page", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-rag-"));
  try {
    fs.mkdirSync(path.join(root, "web"), { recursive: true });
    fs.writeFileSync(path.join(root, "web/docs-bounty.html"), "<main><h1>Sonderr Bounty Program</h1><section><h2>Response timelines</h2><p>First response target is nine hours. Triage target is two days. Payout target is twelve days.</p></section></main>");
    fs.writeFileSync(path.join(root, "web/docs-development.html"), "<main><h1>Sonderr Developer Program</h1><h2>Contributions</h2><p>Volunteer contributions are welcome. Payment is not guaranteed.</p></main>");
    const result = retrieve("Sonderr bug bounty response and triage timeline", { root });
    assert.ok(result.length > 0);
    assert.ok(result[0].path.endsWith("docs-bounty.html"));
    assert.match(result.map(item => item.text).join("\n"), /nine hours/i);
    assert.match(toPromptContext(result), /untrusted reference data/i);
    assert.ok(toPromptContext(result).length < 6_600, "the model receives a bounded context rather than the whole corpus");
    const developer = retrieve("Sonderr developer contribution program", { root });
    assert.equal(developer[0].path, "web/docs-development.html");
    assert.ok(!developer.some(item => item.path === "web/docs-bounty.html"), "developer questions should not retrieve bounty-only content");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("retriever only reads its allow-list, strips markup, and bounds snippets", () => {
  assert.ok(SOURCES.includes("web/docs-privacy.html"));
  const chunks = splitChunks("web/docs-bounty.html", "<script>doNotIndex()</script><h1>Bounty</h1><p>Private &amp; responsible reporting.</p>");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, "Bounty");
  assert.match(chunks[0].text, /Private & responsible reporting/);
  assert.doesNotMatch(chunks[0].text, /doNotIndex/);
  const long = splitChunks("web/docs-bounty.html", `<h1>Details</h1><p>${"A responsibly scoped report gives enough evidence for repeatable review. ".repeat(40)}</p>`);
  assert.ok(long.length > 1, "oversized sections are split into bounded chunks");
  assert.ok(long.every(chunk => chunk.text.length <= 1_150), "no retrieved chunk exceeds the hard per-chunk bound");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-rag-allowlist-"));
  try {
    fs.writeFileSync(path.join(root, "private-notes.md"), "AcmeProjectQuasarRedacted42");
    assert.deepEqual(retrieve("AcmeProjectQuasarRedacted42", { root }), [], "the retriever never scans arbitrary workspace files");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
