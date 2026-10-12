/* Sonderr Otter Pet — v1.6.2
   A ChatGPT-style screen companion, specialized: a small otter that lives on
   your workspace. It floats at the bottom of the screen, paddles while Sonderr
   works, celebrates finished task lists, naps when everything is quiet, and
   wiggles happily when you pet it. Drag it anywhere — the position persists.

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

  // The companion otter — a friendlier, rounder vector than the working
  // indicator: full body floating on its back, pebble on the belly, tail curl.
  function otterSVG() {
    return '<svg class="otter-pet-svg" viewBox="0 0 96 72" width="96" height="72" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<radialGradient id="otterPetPool" cx="50%" cy="62%" r="55%"><stop offset="0" stop-color="#63b3ff" stop-opacity=".5"/><stop offset=".72" stop-color="#3f8ef7" stop-opacity=".22"/><stop offset="1" stop-color="#3f8ef7" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="otterPetFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9714b"/><stop offset="1" stop-color="#6b4226"/></linearGradient>' +
      '<linearGradient id="otterPetBelly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7ead6"/><stop offset="1" stop-color="#e8d3b4"/></linearGradient>' +
      '</defs>' +
      '<ellipse class="otter-pet-pool" cx="48" cy="52" rx="44" ry="17" fill="url(#otterPetPool)"/>' +
      '<g class="otter-pet-float">' +
      '<g class="otter-pet-body">' +
      // tail curling from the left
      '<path class="otter-pet-tail" d="M14 46 Q6 44 3 38 Q9 41 15 41.5 Q20 42 20 45.5 Q18 47 14 46 Z" fill="#5d3a22"/>' +
      // body (floating, back-leaning)
      '<path d="M18 47 Q17 38 27 34.5 Q40 30 56 33 Q68 35.2 72.5 40 Q74.5 42.2 72.8 44.4 Q62 50.5 46 50.8 Q28 51 18 47 Z" fill="url(#otterPetFur)"/>' +
      // belly patch
      '<path d="M30 44.5 Q42 47.5 58 45.2 Q50 49 40 48.6 Q33.5 48.2 30 44.5 Z" fill="url(#otterPetBelly)" opacity=".92"/>' +
      // pebble on the belly
      '<g class="otter-pet-pebble"><ellipse cx="46" cy="41.5" rx="8.2" ry="5.6" fill="#b8c6d9"/><ellipse cx="43.6" cy="39.8" rx="3" ry="1.8" fill="#d6e1ef" opacity=".85"/></g>' +
      // paws holding the pebble
      '<path d="M38.5 45.2 Q40 47.8 43.4 48.3" fill="none" stroke="#4a2d1a" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M54 44.6 Q52.6 47.4 49.2 48" fill="none" stroke="#4a2d1a" stroke-width="2.4" stroke-linecap="round"/>' +
      // head (right side, tilted back, happy)
      '<g class="otter-pet-head">' +
      '<circle cx="72" cy="30" r="12.4" fill="url(#otterPetFur)"/>' +
      '<circle cx="79.5" cy="21.5" r="2.5" fill="#7a4e30"/>' +
      '<path d="M63.5 24.5 Q66 22 69.5 22.4" fill="none" stroke="#5d3a22" stroke-width="1.6" stroke-linecap="round"/>' + // ear inner hint
      '<ellipse cx="73.4" cy="34.2" rx="6.4" ry="5.2" fill="url(#otterPetBelly)"/>' + // muzzle
      '<path class="otter-pet-eye" d="M69.2 28.4 Q71 26.6 72.8 28.4" fill="none" stroke="#2c1b10" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path class="otter-pet-eye" d="M76.4 28.2 Q78.2 26.4 80 28.2" fill="none" stroke="#2c1b10" stroke-width="1.5" stroke-linecap="round"/>' +
      '<ellipse cx="74.6" cy="31.9" rx="2.1" ry="1.7" fill="#33200f"/>' + // nose
      '<path class="otter-pet-mouth" d="M71.6 35.2 Q74.8 37.8 78 35.4" fill="none" stroke="#4a2d1a" stroke-width="1.3" stroke-linecap="round"/>' +
      '<path d="M66.5 32.5 L60.5 31.8 M66.6 34.2 L60.8 34.8" stroke="#f2e3cf" stroke-width=".8" stroke-linecap="round" opacity=".95"/>' + // whiskers
      '</g>' +
      '</g>' +
      '<g class="otter-pet-ripple"><ellipse cx="48" cy="52" rx="30" ry="8" fill="none" stroke="#7cc4ff" stroke-width="1.1" opacity=".55"/></g>' +
      '</g>' +
      '<g class="otter-pet-hearts" aria-hidden="true"></g>' +
      '<g class="otter-pet-zzz" aria-hidden="true"><text x="82" y="14" class="otter-pet-z1">z</text><text x="88" y="8" class="otter-pet-z2">z</text></g>' +
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
      var w = root.offsetWidth || 96, h = root.offsetHeight || 72;
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
    window.addEventListener("resize", function () { place(parseFloat(root.style.left) || 24, parseFloat(root.style.top) || (window.innerHeight - 110)); });

    // initial placement: saved corner or bottom-right
    var w = 0; setTimeout(function () {
      if (state.x != null && state.y != null) place(state.x, state.y);
      else place(window.innerWidth - 128, window.innerHeight - 116);
    }, 0);
  }

  function setState(name, duration) {
    if (!root) return;
    root.classList.remove("working", "happy", "sleeping");
    if (name) root.classList.add(name);
    if (busyTimer) { clearTimeout(busyTimer); busyTimer = null; }
    if (duration) busyTimer = setTimeout(function () { root.classList.remove(name); scheduleSleep(); }, duration);
  }
  function wake() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (!root.classList.contains("working")) setState("sleeping"); }, 4 * 60 * 1000);
    if (root.classList.contains("sleeping")) setState(null);
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
        heart.style.setProperty("--hx", (28 + i * 16) + "px");
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
