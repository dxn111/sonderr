/* Sonderr Otter Pet — v1.7.1
   A ChatGPT-style screen companion, specialized: a small otter that lives on
   your workspace. It floats at the bottom of the screen, paddles while Sonderr
   works, celebrates finished task lists, naps when everything is quiet, and
   wiggles happily when you pet it. Drag it anywhere — the position persists.

   v1.7.1 rebuild: the vector art was redrawn from scratch — rounder "baby"
   proportions, big glossy eyes with double highlights, blush, a fluffier tail,
   glossy pebble, layered water with sparkle. New motion: periodic blinking,
   tail sway, water twinkle. States unchanged: working / happy / sleeping.

   Self-contained: no dependencies, listens for "sonderr:pet" CustomEvents
   ({kind: "working"|"idle"|"celebrate"|"meet"}) dispatched by web/ui.js.
   Honors prefers-reduced-motion. */
(function () {
  "use strict";
  if (typeof document === "undefined") return;

  var STORE_KEY = "sonderr-otter-pet";
  var reducedMotion = false;
  try { reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function save(patch) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign(load(), patch))); } catch (e) {}
  }

  var state = Object.assign({ enabled: null, x: null, y: null, pets: 0 }, load());

  // The companion otter — v1.7.1 vector rebuild. An otter drifting on its
  // back, holding a pebble on its belly. Round head, big glossy eyes, blush,
  // fluffy curl tail, all sitting on layered water with soft sparkles.
  function otterSVG() {
    return '<svg class="otter-pet-svg" viewBox="0 0 128 100" width="118" height="92" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<radialGradient id="otterPetPool" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="#5fb0ff" stop-opacity=".55"/><stop offset=".65" stop-color="#3f8ef7" stop-opacity=".24"/><stop offset="1" stop-color="#3f8ef7" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="otterPetFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bd8054"/><stop offset=".55" stop-color="#9a6238"/><stop offset="1" stop-color="#74471f"/></linearGradient>' +
      '<linearGradient id="otterPetHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98d5e"/><stop offset="1" stop-color="#966034"/></linearGradient>' +
      '<linearGradient id="otterPetBelly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf3e2"/><stop offset="1" stop-color="#eed9b9"/></linearGradient>' +
      '<linearGradient id="otterPetStone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfdbec"/><stop offset="1" stop-color="#9fb2cc"/></linearGradient>' +
      '</defs>' +
      // water
      '<ellipse class="otter-pet-pool" cx="64" cy="74" rx="52" ry="15" fill="url(#otterPetPool)"/>' +
      '<g class="otter-pet-float">' +
      '<g class="otter-pet-body">' +
      // tail — fluffy two-tone curl rising out of the water on the left
      '<g class="otter-pet-tail">' +
      '<path d="M24 54 Q11.5 53 5.8 44.6 Q4.2 42 7 41.8 Q10 41.7 13.6 43.8 Q8.8 39.8 8.2 36.4 Q7.9 34.2 10.2 35.2 Q17 38.4 23.6 44.8 Q28 49.2 28.8 53 Q27.4 54.6 24 54 Z" fill="#6e421c"/>' +
      '<path d="M12.6 43.6 Q9.6 40.4 8.9 37.6 Q14 40.6 19.2 45.2 Q15.2 45.4 12.6 43.6 Z" fill="#8a5526"/>' +
      '</g>' +
      // body — a rounded raft drifting on its back, belly side up
      '<path d="M20 56 Q18.5 45.5 31.5 41.5 Q46 37.5 62.5 40 Q77 42.4 82.5 48.5 Q84.4 51 82.4 53.6 Q73 61.5 52 62.6 Q30 63.4 20 56 Z" fill="url(#otterPetFur)"/>' +
      // cream belly facing up (it floats on its back)
      '<path d="M30 50.5 Q39 43.8 55.5 44.8 Q68.5 45.8 72.5 50.8 Q68.5 56.2 54 57.4 Q40 58.2 30 50.5 Z" fill="url(#otterPetBelly)"/>' +
      // pebble resting on the belly
      '<g class="otter-pet-pebble"><ellipse cx="52" cy="42.6" rx="9" ry="6.2" fill="url(#otterPetStone)"/><ellipse cx="48.6" cy="40.4" rx="3.2" ry="2" fill="#e9f0f8" opacity=".85"/></g>' +
      // paws wrapping around the pebble
      '<path d="M37.5 53.5 Q40 47.2 46.5 45" fill="none" stroke="#5f3a1c" stroke-width="5.2" stroke-linecap="round"/>' +
      '<path d="M66 52.5 Q64.5 47.4 57.8 45.2" fill="none" stroke="#5f3a1c" stroke-width="5.2" stroke-linecap="round"/>' +
      // head — big, round, tilted back
      '<g class="otter-pet-head">' +
      '<g class="otter-pet-ear otter-pet-ear-l"><circle cx="78" cy="28" r="4" fill="#966034"/><circle cx="78" cy="28" r="2" fill="#5f3a1c"/></g>' +
      '<g class="otter-pet-ear otter-pet-ear-r"><circle cx="99.5" cy="27" r="4" fill="#966034"/><circle cx="99.5" cy="27" r="2" fill="#5f3a1c"/></g>' +
      '<circle cx="89" cy="40" r="15.8" fill="url(#otterPetHead)"/>' +
      '<ellipse cx="89.5" cy="47.5" rx="9.2" ry="6.6" fill="url(#otterPetBelly)"/>' + // muzzle
      '<g class="otter-pet-blush"><ellipse cx="76.5" cy="43.5" rx="3.6" ry="2.1" fill="#f2a4a4" opacity=".5"/><ellipse cx="102" cy="42.5" rx="3.6" ry="2.1" fill="#f2a4a4" opacity=".5"/></g>' +
      '<g class="otter-pet-eye otter-pet-eye-l"><ellipse cx="82.5" cy="36.8" rx="3.15" ry="3.35" fill="#2b1a0e"/><circle cx="83.6" cy="35.5" r="1.15" fill="#fff"/><circle cx="81.4" cy="38.2" r=".55" fill="#fff" opacity=".8"/></g>' +
      '<g class="otter-pet-eye otter-pet-eye-r"><ellipse cx="95.8" cy="36.3" rx="3.15" ry="3.35" fill="#2b1a0e"/><circle cx="96.9" cy="35" r="1.15" fill="#fff"/><circle cx="94.7" cy="37.7" r=".55" fill="#fff" opacity=".8"/></g>' +
      '<path d="M87.6 42.4 Q89.2 43.9 90.8 42.4 Q90.1 40.9 89.2 40.9 Q88.3 40.9 87.6 42.4 Z" fill="#33200f"/>' + // nose
      '<path class="otter-pet-mouth" d="M89.2 44.9 Q89.2 46.8 87.2 47.3 M89.2 44.9 Q89.2 46.8 91.2 47.3" fill="none" stroke="#4a2d1a" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M77.5 45.5 L71.5 44.8 M77.7 47.5 L71.9 48.1 M101 44.5 L107 43.8 M101.1 46.5 L106.9 47.1" stroke="#f6e8d4" stroke-width=".9" stroke-linecap="round" opacity=".95"/>' + // whiskers
      '</g>' +
      '</g>' +
      '<g class="otter-pet-ripple"><ellipse cx="58" cy="70" rx="34" ry="9" fill="none" stroke="#8fcaff" stroke-width="1.2" opacity=".5"/></g>' +
      '</g>' +
      '<g class="otter-pet-sparkles">' +
      '<path class="otter-pet-sp otter-pet-sp1" d="M30 66 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1 Z" fill="#bfe0ff"/>' +
      '<path class="otter-pet-sp otter-pet-sp2" d="M100 70 l.9 1.9 1.9 .9 -1.9 .9 -.9 1.9 -.9 -1.9 -1.9 -.9 1.9 -.9 Z" fill="#bfe0ff"/>' +
      '<path class="otter-pet-sp otter-pet-sp3" d="M46 82 l.8 1.7 1.7 .8 -1.7 .8 -.8 1.7 -.8 -1.7 -1.7 -.8 1.7 -.8 Z" fill="#cfe9ff"/>' +
      '</g>' +
      '<g class="otter-pet-hearts" aria-hidden="true"></g>' +
      '<g class="otter-pet-zzz" aria-hidden="true"><text x="100" y="18" class="otter-pet-z1">z</text><text x="107" y="11" class="otter-pet-z2">z</text></g>' +
      '</svg>';
  }

  var root = null;
  var busyTimer = null;
  var idleTimer = null;
  var petsCount = Number(state.pets) || 0;

  function build() {
    root = document.createElement("div");
    root.className = "otter-pet";
    root.id = "otterPet";
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", "Sonderr otter pet — drag to move, click to pet");
    root.innerHTML = otterSVG();
    document.body.appendChild(root);

    var dragMoved = false;
    var startX = 0, startY = 0, originX = 0, originY = 0;
    var downAt = 0;

    var clamp = function (value, min, max) { return Math.max(min, Math.min(max, value)); };
    var place = function (x, y) {
      var w = root.offsetWidth || 118, h = root.offsetHeight || 92;
      var nx = clamp(x, 6, window.innerWidth - w - 6);
      var ny = clamp(y, 6, window.innerHeight - h - 6);
      root.style.left = nx + "px";
      root.style.top = ny + "px";
    };
    var persistPosition = function () {
      save({ x: parseFloat(root.style.left) || null, y: parseFloat(root.style.top) || null });
    };

    root.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      root.setPointerCapture(event.pointerId);
      dragMoved = false;
      downAt = Date.now();
      startX = event.clientX; startY = event.clientY;
      originX = parseFloat(root.style.left) || root.offsetLeft;
      originY = parseFloat(root.style.top) || root.offsetTop;
      root.classList.add("dragging");
      wake();
    });
    root.addEventListener("pointermove", function (event) {
      if (!root.classList.contains("dragging")) return;
      var dx = event.clientX - startX, dy = event.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
      if (dragMoved) place(originX + dx, originY + dy);
    });
    root.addEventListener("pointerup", function (event) {
      if (!root.classList.contains("dragging")) return;
      root.classList.remove("dragging");
      try { root.releasePointerCapture(event.pointerId); } catch (e) {}
      if (dragMoved) { persistPosition(); return; }
      if (Date.now() - downAt < 600) pet();
    });
    root.addEventListener("pointercancel", function () { root.classList.remove("dragging"); });
    window.addEventListener("resize", function () { place(parseFloat(root.style.left) || 24, parseFloat(root.style.top) || (window.innerHeight - 130)); });

    // initial placement: saved corner or bottom-right
    setTimeout(function () {
      if (state.x != null && state.y != null) place(state.x, state.y);
      else place(window.innerWidth - 152, window.innerHeight - 132);
    }, 0);
  }

  function setState(name, duration) {
    if (!root) return;
    root.classList.remove("working", "happy", "sleeping");
    if (name) root.classList.add(name);
    if (busyTimer) { clearTimeout(busyTimer); busyTimer = null; }
    if (duration) busyTimer = setTimeout(function () { root.classList.remove(name); scheduleSleep(); }, duration);
  }
  function scheduleSleep() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (!root.classList.contains("working")) setState("sleeping"); }, 4 * 60 * 1000);
  }
  function wake() {
    scheduleSleep();
    if (root && root.classList.contains("sleeping")) setState(null);
  }
  function pet() {
    petsCount += 1;
    save({ pets: petsCount });
    setState("happy", 1600);
    var hearts = root.querySelector(".otter-pet-hearts");
    if (hearts && !reducedMotion) {
      for (var i = 0; i < 3; i++) {
        var heart = document.createElementNS("http://www.w3.org/2000/svg", "path");
        heart.setAttribute("d", "M0 3.2 C0 .8 3.4 -.6 4.6 1.6 C5.8 -.6 9.2 .8 9.2 3.2 C9.2 5.8 4.6 8.6 4.6 8.6 C4.6 8.6 0 5.8 0 3.2 Z");
        heart.setAttribute("fill", "#ff8fb3");
        heart.setAttribute("class", "otter-pet-heart");
        heart.style.setProperty("--hx", (36 + i * 18) + "px");
        heart.style.animationDelay = (i * 0.12) + "s";
        hearts.appendChild(heart);
        (function (node) { setTimeout(function () { node.remove(); }, 1500); })(heart);
      }
    }
    if (petsCount % 10 === 0) {
      try { toast("The otter has been petted " + petsCount + " times — it trusts you completely."); } catch (e) {}
    }
    wake();
  }
  function setEnabled(on) {
    state.enabled = Boolean(on);
    save({ enabled: state.enabled });
    if (state.enabled) {
      if (!root) build();
      root.hidden = false;
      wake();
    } else if (root) {
      root.hidden = true;
    }
    updateButton();
  }
  function updateButton() {
    var button = document.getElementById("otterPetBtn");
    if (!button) return;
    button.classList.toggle("on", Boolean(state.enabled));
    var label = button.querySelector(".otter-pet-state");
    if (label) label.textContent = state.enabled ? "On" : "Off";
  }

  window.addEventListener("sonderr:pet", function (event) {
    var kind = event && event.detail && event.detail.kind;
    if (kind === "working") { wake(); setState("working"); }
    else if (kind === "idle") { setState(null, 0); wake(); }
    else if (kind === "celebrate") { wake(); setState("happy", 2600); }
    else if (kind === "meet") { setEnabled(true); setState("happy", 2600); }
  });

  function init() {
    if (document.getElementById("otterPetBtn")) {
      document.getElementById("otterPetBtn").addEventListener("click", function () {
        setEnabled(!(state.enabled === true));
      });
    }
    // First visit: the pet is on — meet your companion. Toggling it off persists.
    setEnabled(state.enabled !== false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
