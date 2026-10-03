"use strict";

const assert = require("node:assert/strict");

const elStubs = new Map();
const makeEl = () => ({
  hidden: false, textContent: "", innerHTML: "", className: "", dataset: {},
  disabled: false, title: "", type: "", checked: false, value: "", placeholder: "", required: false,
  children: [], onclick: null, onsubmit: null, onchange: null,
  addEventListener: () => {}, appendChild: () => {}, remove: () => {},
  classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  querySelector: () => makeEl(),
  querySelectorAll: () => [makeEl()],
  setAttribute: () => {},
  getAttribute: () => null,
  focus: () => {},
  scrollIntoView: () => {},
  replaceWith: () => {},
});
const getEl = (id) => {
  if (!elStubs.has(id)) elStubs.set(id, makeEl());
  return elStubs.get(id);
};
const documentTarget = {
  getElementById: getEl,
  body: makeEl(),
  addEventListener: () => {},
  hidden: false,
  querySelectorAll: () => [makeEl()],
  querySelector: () => makeEl(),
};
global.document = new Proxy(documentTarget, {
  get(_, prop) {
    if (prop in documentTarget) return documentTarget[prop];
    if (typeof prop === "string") return () => makeEl();
    return undefined;
  },
});
global.window = { addEventListener: () => {} };
global.location = { pathname: "/", href: "http://localhost", protocol: "http:" };

const { renderMarkdown, esc, safeExternalHref } = require("../web/ui.js");

// 1. Fenced code block with <script> must be escaped
const scriptPayload = "<script>alert(1)</script>";
const scriptResult = renderMarkdown("```js\n" + scriptPayload + "\n```");
assert.ok(scriptResult.includes("&amp;lt;script&amp;gt;"), "fenced code block must escape <script> tags");
assert.doesNotMatch(scriptResult, /<script>/i, "fenced code block must not contain raw <script> tags");

// 2. Inline code with <img> must be escaped
const imgPayload = "<img src=x onerror=alert(1)>";
const imgResult = renderMarkdown("Use `" + imgPayload + "` to debug.");
assert.ok(imgResult.includes("&lt;img"), "inline code must escape <img> tags");
assert.doesNotMatch(imgResult, /<img[>\s]/i, "inline code must not contain raw <img> tags");

// 3. Normal fenced code block renders correctly
const normalCode = "function hello() {\n  return \"world\";\n}";
const normalResult = renderMarkdown("```js\n" + normalCode + "\n```");
assert.ok(normalResult.includes("<pre><code>"), "normal fenced block contains <pre><code>");
assert.ok(normalResult.includes("hello"), "normal fenced block preserves code content");
assert.ok(normalResult.includes('class="codeblock"'), "normal fenced block is wrapped in codeblock");

// 4. esc(null) returns ""
assert.strictEqual(esc(null), "", "esc(null) returns empty string");

// 5. esc(undefined) returns ""
assert.strictEqual(esc(undefined), "", "esc(undefined) returns empty string");

// 6. safeExternalHref("javascript:alert(1)") returns ""
assert.strictEqual(safeExternalHref("javascript:alert(1)"), "", "javascript: URI is rejected");

// 7. safeExternalHref("data:text/html,<script>alert(1)</script>") returns ""
assert.strictEqual(safeExternalHref("data:text/html,<script>alert(1)</script>"), "", "data: URI is rejected");

// 8. safeExternalHref("https://example.com/?api_key=private") returns ""
assert.strictEqual(safeExternalHref("https://example.com/?api_key=private"), "", "URL with api_key query param is rejected");

// 9. safeExternalHref("https://example.com/path") returns "https://example.com/path"
assert.strictEqual(safeExternalHref("https://example.com/path"), "https://example.com/path", "safe https URL is preserved");

console.log("web-ui.test.js: all tests passed");
process.exit(0);
