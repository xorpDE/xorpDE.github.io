(function () {
  "use strict";
  var KEY = "xorpde-heatmap-theme";
  var root = document.documentElement;
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  var BAR = { light: "#f6f7f9", dark: "#0f1114" };

  function isDark() {
    var t = root.getAttribute("data-theme");
    return t ? t === "dark" : darkQuery.matches;
  }

  function sync() {
    var active = isDark() ? "dark" : "light";
    document.querySelectorAll("[data-set-theme]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.setTheme === active));
    });
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      var own = /dark/.test(m.media) ? BAR.dark : BAR.light;
      m.setAttribute("content", root.getAttribute("data-theme") ? BAR[active] : own);
    });
    document.dispatchEvent(new CustomEvent("xorpde:theme", { detail: { dark: active === "dark" } }));
  }

  function applySaved() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { sync(); return; } 
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
    else root.removeAttribute("data-theme");
    sync();
  }

  document.querySelectorAll("[data-set-theme]").forEach(function (b) {
    b.addEventListener("click", function () {
      root.setAttribute("data-theme", b.dataset.setTheme);
      try { localStorage.setItem(KEY, b.dataset.setTheme); } catch (e) {   }
      sync();
    });
  });
  darkQuery.addEventListener("change", function () { if (!root.getAttribute("data-theme")) sync(); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) applySaved(); });
  window.addEventListener("storage", function (e) { if (e.key === KEY) applySaved(); });

  var NUMBER = /^[+-]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?\d+)?$/i;
  var NON_FINITE = /^[+-]?(?:inf(?:inity)?|nan)$/i;
  function toFloat(p) { return NUMBER.test(p) ? Number(p.replace(/_/g, "")) : NON_FINITE.test(p) ? NaN : null; }
  function clip(s) { return s.length > 24 ? s.slice(0, 23) + "..." : s; }

  function parseLine(raw, n) {
    var line = raw.replace(/[\ufeff\u200b]/g, "").replace(/\u2212/g, "-").trim();
    if (!line || line.charAt(0) === "#") return null;
    var parts;
    if (/[,;\t]/.test(line)) {
      if (/[;\t]/.test(line) && !/\d\.\d/.test(line)) line = line.replace(/(\d),(?=\d)/g, "$1.");
      parts = line.split(/[,;\t]/).map(function (p) { return p.trim().replace(/^["']+|["']+$/g, "").trim(); });
    } else {
      parts = line.split(/\s+/);
    }
    parts = parts.filter(Boolean);
    if (!parts.length) return null;
    var vals = parts.map(toFloat);
    var first = vals.findIndex(function (v) { return v !== null; });
    if (first < 0) return null; 
    if (vals.length - first > 25 && vals.slice(first).every(function (v) { return v !== null; })) first = vals.length - 25;
    var bad = vals.findIndex(function (v, i) { return i >= first && v === null; });
    if (bad >= 0) return { error: "Line " + n + ": '" + clip(parts[bad]) + "' is not a number. After the name, a G25 line contains only numbers." };
    var nums = vals.slice(first);
    if (nums.length !== 25) return { error: "Line " + n + " has " + nums.length + " number" + (nums.length === 1 ? "" : "s") + ", but a G25 line needs exactly 25 (Name,PC1,...,PC25)." };
    if (!nums.every(isFinite)) return { error: "Line " + n + ": the coordinates must be ordinary numbers." };
    return { name: parts.slice(0, first).join(" ").trim(), coords: nums };
  }

  function parseCoordinates(text) {
    var samples = [], errors = [];
    String(text || "").split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/).forEach(function (line, i) {
      var r = parseLine(line, i + 1);
      if (!r) return;
      if (r.error) errors.push(r.error);
      else samples.push(r);
    });
    return { samples: samples, errors: errors };
  }

  window.XORPDE = { isDark: isDark, parseCoordinates: parseCoordinates };
  sync();
})();
