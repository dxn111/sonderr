"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const pluginRegistry = require("../server/plugins");

const html = fs.readFileSync(require.resolve("../web/index.html"), "utf8");
const ui = fs.readFileSync(require.resolve("../web/ui.js"), "utf8");
const css = fs.readFileSync(require.resolve("../web/ui.css"), "utf8");
const app = fs.readFileSync(require.resolve("../server/app.js"), "utf8");
const plugins = pluginRegistry.listPlugins();

assert.match(html, /id="pluginHubBtn"[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?Sonderr Plugin Hub/);
assert.match(html, /id="pluginHubModal"[\s\S]*?aria-labelledby="pluginHubTitle"/);
assert.match(html, /id="pluginGrid"/);
assert.equal(plugins.length, 1);
assert.equal(plugins[0].id, "sites");
assert.equal(plugins[0].releaseDate, "2026-09-25");
assert.ok(plugins[0].summary && plugins[0].details && plugins[0].features.length && plugins[0].examples.length);
assert.equal(Object.hasOwn(plugins[0], "instructions"), false, "private plugin instructions are not exposed by the catalog");
assert.match(pluginRegistry.pluginInstructions("sites"), /responsive/);
assert.equal(pluginRegistry.pluginInstructions("unknown"), "");
assert.match(ui, /\$\("pluginHubBtn"\)\.onclick = openPluginHub/);
assert.match(ui, /<summary>Read more<\/summary>/);
assert.match(ui, /Release date/);
assert.match(ui, /function usePlugin\(pluginId\)[\s\S]*?state\.activePluginId = plugin\.id[\s\S]*?setMode\("build"\)/);
assert.match(ui, /activePluginId: state\.activePluginId/);
assert.match(ui, /function renderContext\(\)[\s\S]*?plugin-active-chip/);
assert.match(ui, /function closePluginHub\(\)[\s\S]*?\$\("pluginHubBtn"\)\.focus\(\)/);
assert.match(app, /url\.pathname===?"\/api\/plugins"/);
assert.match(app, /pluginRegistry\.pluginInstructions\(activePlugin\.id\)/);
assert.match(app, /store\.setSessionPlugin\(sessionMatch\[1\]/);
assert.match(css, /\.plugin-hub-panel/);
assert.match(css, /\.plugin-card/);
assert.match(css, /\.plugin-details/);
assert.match(css, /\.plugin-active-chip/);

console.log("plugin hub tests passed");
