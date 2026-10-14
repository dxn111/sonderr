// Companion update (v1.6.2): the otter pet, the vector working animation, and
// the bulletproofing guards must stay wired together across the web surface
// and the chat handler. These checks pin the wiring so a refactor cannot
// silently drop a piece.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(require("path").join(__dirname, "..", path), "utf8");

// 1. index.html: pet toggle in the sidebar, pet script before ui.js, the
//    v1.6.2 announcement modal, and its archive entry.
const html = read("web/index.html");
assert.ok(html.includes('id="otterPetBtn"'), "sidebar needs the otter pet toggle");
assert.ok(/<script src="\/otter-pet\.js"><\/script><script src="\/sonderr-launch-renderer\.js"><\/script><script src="\/ui\.js"><\/script>/.test(html), "otter-pet.js must load before ui.js");
assert.ok(html.includes('id="sonderrV17Announcement"'), "v1.7 announcement modal must exist");
assert.ok(html.includes("/assets/sonderr-v17-flow.png"), "v1.7 modal must use the workflow key art");
assert.ok(html.includes("VERSION 1.7 · THE WORKFLOW UPDATE"), "archive needs the v1.7 entry");
assert.ok(html.includes("VERSION 1.6.2 · THE COMPANION UPDATE"), "archive keeps the v1.6.2 entry");
assert.ok(html.includes('id="sonderrV1Announcement"'), "the Sonderr-v1 film modal must remain for the archive");
assert.ok(html.includes('id="sonderrV16Announcement"'), "the v1.6 modal must remain for the archive");

// 2. ui.js: vector swim scene, shimmer text, pet events, empty-turn notice,
//    watchdog, and the classifier badge.
const ui = read("web/ui.js");
assert.ok(ui.includes("function otterSwimScene()"), "working animation must be the vector swim scene");
assert.ok(ui.includes("shimmer-text"), "status text must use the shimmer treatment");
assert.ok(!ui.includes('class="otter-chip"'), "the retired raster chip markup must be gone");
assert.ok(ui.includes('new CustomEvent("sonderr:pet"'), "ui.js must dispatch pet events");
assert.ok(ui.includes('sonderrPetEvent("working")') && ui.includes('sonderrPetEvent("idle")'), "send flow must tell the pet about working/idle");
assert.ok(ui.includes('sonderrPetEvent("celebrate")'), "completed task lists must be celebrated");
assert.ok(ui.includes("empty-turn-note"), "empty final responses must render an honest notice");
assert.ok(ui.includes("evt.notice"), "the server's classifier notice must be surfaced");
assert.ok(ui.includes("watchdogHandle"), "the stuck-stream watchdog must be wired");
assert.ok(ui.includes("looksLikeClassifierModel"), "the picker must flag classifier models");
assert.ok(ui.includes("showSonderrV17Announcement"), "the launch queue must show the v1.7 announcement");
assert.ok(ui.includes("case \"delta\": row.appendDelta(evt.text)"), "the chat stream must render live deltas");
assert.ok(ui.includes("case \"segment\": row.addSegment(evt.text)"), "narration segments must render between tool cards");

// 3. otter-pet.js: draggable, persisted, stateful, reduced-motion aware.
const pet = read("web/otter-pet.js");
assert.ok(pet.includes("sonderr-otter-pet"), "pet preferences must persist under their own key");
assert.ok(pet.includes("pointerdown") && pet.includes("pointermove") && pet.includes("pointerup"), "the pet must be draggable with pointer events");
assert.ok(pet.includes('"working"') && pet.includes('"celebrate"') && pet.includes('"meet"'), "the pet must react to app events");
assert.ok(pet.includes("prefers-reduced-motion"), "the pet must honor reduced motion");
assert.ok(pet.includes("otter-pet-heart"), "petting must produce hearts");

// 4. ui.css: the new scene, pet styles, and badge style.
const css = read("web/ui.css");
assert.ok(css.includes(".otter-swim{"), "the swim scene styles must exist");
assert.ok(css.includes(".otter-pet{"), "the pet styles must exist");
assert.ok(css.includes(".mi-badge.classifier"), "classifier badge must be styled");
assert.ok(css.includes("@keyframes otter-wave-slide"), "wave layers must animate");

// 5. app.js: the server-side classifier guard.
const app = read("server/app.js");
assert.ok(app.includes("!provider.isChatModel(provider.config().model)"), "handleChat must refuse classifier models in the chat slot");
assert.ok(app.includes("classifierModel: true"), "the guard must mark its final event");

console.log("companion update tests passed");
