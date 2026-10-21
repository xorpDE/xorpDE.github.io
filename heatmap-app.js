(() => {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const BRAND = String(cfg.brand || "").trim() || "Xorpde Heatmap";
  const THEME_KEY = "xorpde-heatmap-theme";
  const N_DIMS = 25;
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (id) => document.getElementById(id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const fmtSeconds = (s) => (s < 10 ? s.toFixed(1) : String(Math.round(s))) + " s";
  const setDisabled = (button, off) => (off ? button.setAttribute("aria-disabled", "true") : button.removeAttribute("aria-disabled"));

  document.querySelectorAll("[data-brand]").forEach((n) => { n.textContent = BRAND; });
  document.querySelectorAll("[data-year]").forEach((n) => { n.textContent = String(new Date().getFullYear()); });
  if (BRAND !== "Xorpde Heatmap") document.title = document.title.replace("Xorpde Heatmap", BRAND);

  const legal = $("legal-links");
  [["Imprint", cfg.imprintUrl], ["Privacy", cfg.privacyUrl]].forEach(([label, url]) => {
    if (!url) return;
    const link = make("a", null, label);
    link.href = url;
    legal.append(" · ", link);
    legal.hidden = false;
  });

  const openDetails = (hash) => {
    if (!hash || hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target && target.tagName === "DETAILS") target.open = true;
  };
  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest('a[href^="#"]');
    if (link) openDetails(link.getAttribute("href"));
  });
  window.addEventListener("hashchange", () => openDetails(location.hash));
  openDetails(location.hash);

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const themeButtons = document.querySelectorAll("[data-set-theme]");
  const syncTheme = () => {
    const active = root.dataset.theme || (darkQuery.matches ? "dark" : "light");
    themeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setTheme === active)));
  };
  themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      root.dataset.theme = button.dataset.setTheme;
      try {
        localStorage.setItem(THEME_KEY, button.dataset.setTheme);
      } catch (err) {
      }
      syncTheme();
    });
  });
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", syncTheme);
  syncTheme();

  class InputError extends Error {}
  const NUMBER = /^[+-]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?\d+)?$/i;
  const NON_FINITE = /^[+-]?(?:inf(?:inity)?|nan)$/i;
  const toFloat = (p) => (NUMBER.test(p) ? Number(p.replace(/_/g, "")) : NON_FINITE.test(p) ? NaN : null);
  const clip = (s) => (s.length > 24 ? s.slice(0, 23) + "…" : s);

  function parseLine(raw, lineno) {
    let line = raw.replace(/[\ufeff\u200b]/g, "").replace(/\u2212/g, "-").trim();
    if (!line || line.startsWith("#")) return null;
    let parts;
    if (/[,;\t]/.test(line)) {
      if (/[;\t]/.test(line) && !/\d\.\d/.test(line)) line = line.replace(/(\d),(?=\d)/g, "$1.");
      parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']+|["']+$/g, "").trim());
    } else {
      parts = line.split(/\s+/);
    }
    parts = parts.filter(Boolean);
    if (!parts.length) return null;
    const vals = parts.map(toFloat);
    let first = vals.findIndex((v) => v !== null);
    if (first < 0) return null; 
    if (vals.length - first > N_DIMS && vals.slice(first).every((v) => v !== null)) first = vals.length - N_DIMS;
    const bad = vals.findIndex((v, i) => i >= first && v === null);
    if (bad >= 0) {
      throw new InputError(`Line ${lineno}: “${clip(parts[bad])}” is not a number. After the name, a G25 line contains only numbers.`);
    }
    const nums = vals.slice(first);
    if (nums.length !== N_DIMS) {
      throw new InputError(`Line ${lineno} has ${nums.length} number${nums.length === 1 ? "" : "s"}, but a G25 line needs exactly ${N_DIMS} (Name,PC1,…,PC25). Please paste the complete line.`);
    }
    if (!nums.every(Number.isFinite)) throw new InputError(`Line ${lineno}: the coordinates must be ordinary numbers.`);
    return { name: parts.slice(0, first).join(" ").trim() || `Sample${lineno}`, nums };
  }

  function parseCoordinates(text) {
    const samples = [];
    text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/).forEach((line, i) => {
      const sample = parseLine(line, i + 1);
      if (sample) samples.push(sample);
    });
    if (!samples.length) throw new InputError("No G25 coordinates found. Paste a line like “YourName,0.1254,0.1342,…”: a name followed by 25 numbers.");
    return samples;
  }

  const ui = {
    form: $("map-form"), coords: $("coords"), hint: $("coords-hint"), error: $("coords-error"),
    name: $("map-name"), maxDistance: $("max-distance"), create: $("create-button"),
    samples: $("samples"), sampleButtons: $("sample-buttons"),
    regionField: $("region-field"), regionButtons: $("region-buttons"),
    status: $("status"), statusText: $("status-text"), statusTime: $("status-time"),
    progress: $("progress"), progressBar: $("progress-bar"),
    area: $("result-area"), placeholder: $("placeholder"), fileNotice: $("file-notice"), result: $("result"),
    frame: $("zoom-frame"), img: $("result-img"), caption: $("result-caption"),
    zoomIn: $("zoom-in"), zoomOut: $("zoom-out"), zoomReset: $("zoom-reset"),
    download: $("download"), saveView: $("save-view"),
    size: $("result-size"), time: $("result-time"), table: $("nearest-table"), tableBody: $("nearest-body"),
  };
  const HINT = ui.hint.textContent;
  const NAME_PLACEHOLDER = ui.name.placeholder;
  const canRun = typeof Worker === "function" && typeof WebAssembly === "object";
  const fromFile = location.protocol === "file:";
  const NO_SUPPORT = "This browser cannot run the map engine (it needs Web Workers and WebAssembly). Please use a current version of Chrome, Edge, Firefox or Safari.";
  const NO_FILE = "Maps can only be made when the page is opened through its web address (see below).";
  const SLOW_REGION = "world";
  const SLOW_NOTE = "A world map takes about 30–90 s.";

  const REGIONS = (Array.isArray(cfg.regions) ? cfg.regions : []).filter((r) => r && r.key)
    .map((r) => ({ key: String(r.key), label: String(r.label || r.key) }));
  const regionLabel = (key) => {
    const found = REGIONS.find((r) => r.key === key);
    return found ? found.label : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
  };
  let region = String(cfg.defaultRegion || "europe");
  if (REGIONS.length && !REGIONS.some((r) => r.key === region)) region = REGIONS[0].key;

  let worker = null;
  let engine = "idle"; 
  let job = null; 
  let shown = null; 
  let nextId = 1;
  let ticker = 0;
  let blobUrl = null; 

  function setStatus(state, text, progress) {
    ui.status.dataset.state = state;
    if (text != null) ui.statusText.textContent = text;
    ui.progress.classList.toggle("is-active", state === "loading" || state === "busy");
    if (typeof progress === "number") ui.progressBar.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
  }

  function startEngine() {
    if (worker || !canRun || fromFile) return;
    engine = "loading";
    try {
      worker = new Worker("heatmap-worker.js?v=20261021", { type: "module" }); 
    } catch (err) {
      engineFailed(err && err.message);
      return;
    }
    worker.onmessage = (e) => onEngineMessage(e.data || {});
    worker.onerror = (e) => {
      e.preventDefault();
      engineFailed(e.message);
    };
    if (!job) setStatus("loading", "Loading the map engine…", 0);
  }

  function engineFailed(detail) {
    const what = engine === "ready" ? "The map engine stopped unexpectedly" : "The map engine could not be loaded";
    if (worker) worker.terminate();
    worker = null;
    engine = "failed";
    if (job) endJob();
    const text = detail && /^the map engine/i.test(detail) ? detail.replace(/\.?\s*$/, "") : `${what}${detail ? ` (${detail})` : ""}`;
    setStatus("error", `${text}. Check your internet connection, then press “Create map” to try again.`);
  }

  function jobText(text) {
    const t = String(text || "");
    if (job.kind === "view") return `Saving this view: ${/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t}`;
    return job.request.region === SLOW_REGION ? `${t} ${SLOW_NOTE}` : t;
  }

  function onEngineMessage(m) {
    if (m.type === "status") {
      if (job) setStatus("busy", jobText(m.text), m.progress);
      else if (engine === "loading") setStatus("loading", m.text, m.progress);
    } else if (m.type === "ready") {
      engine = "ready";
      if (!job) setStatus("ready", `Map engine ready (loaded in ${fmtSeconds(m.seconds || 0)}). Paste your coordinates or try an example.`);
    } else if (m.type === "result") {
      if (job && m.id === job.id) (job.kind === "view" ? saveViewResult : showResult)(m);
    } else if (m.type === "error") {
      if (job && m.id === job.id) {
        const isView = job.kind === "view";
        endJob();
        const detail = m.message ? ` (${m.message})` : "";
        if (isView) {
          setStatus("error", `This view could not be drawn${detail}. Try again, or download the whole map.`);
        } else if (m.kind === "input") {
          const text = String(m.message || "These coordinates could not be read.");
          setInputError(text.charAt(0).toUpperCase() + text.slice(1));
          setStatus("ready", "Please check your coordinates and try again.");
        } else {
          setStatus("error", `The map could not be drawn${detail}. Press “Create map” to try again.`);
        }
      } else if (m.id == null) {
        engineFailed(m.message);
      }
    }
  }

  function setInputError(message) {
    ui.error.textContent = message;
    ui.error.hidden = !message;
    if (message) ui.coords.setAttribute("aria-invalid", "true");
    else ui.coords.removeAttribute("aria-invalid");
  }

  function updateHint() {
    let samples = null;
    try {
      if (ui.coords.value.trim()) samples = parseCoordinates(ui.coords.value);
    } catch (err) {
      samples = null;
    }
    ui.hint.classList.toggle("is-ok", Boolean(samples));
    ui.name.placeholder = samples && samples.length === 1 ? samples[0].name : NAME_PLACEHOLDER;
    if (!samples) ui.hint.textContent = HINT;
    else if (samples.length === 1) ui.hint.textContent = `✓ ${samples[0].name}: 25 values`;
    else ui.hint.textContent = `✓ ${samples.length} samples, averaged into one map`;
  }

  function setBusy(busy, newMap) {
    [ui.create, ...ui.regionButtons.querySelectorAll("button")].forEach((b) => setDisabled(b, busy));
    ui.create.textContent = busy && newMap ? "Creating map…" : "Create map";
    ui.area.setAttribute("aria-busy", String(Boolean(busy && newMap)));
    ui.result.classList.toggle("is-stale", Boolean(busy && newMap));
    updateSaveView();
  }

  function endJob() {
    job = null;
    clearInterval(ticker);
    ui.statusTime.textContent = "";
    setBusy(false);
  }

  function createMap() {
    if (job) return;
    setInputError("");
    let samples;
    try {
      samples = parseCoordinates(ui.coords.value);
    } catch (err) {
      if (!(err instanceof InputError)) throw err;
      setInputError(err.message);
      ui.coords.focus();
      return;
    }
    if (!canRun) return setStatus("error", NO_SUPPORT);
    if (fromFile) return setStatus("error", NO_FILE);
    const name = ui.name.value.trim();
    const label = name || (samples.length === 1 ? samples[0].name : `the average of ${samples.length} samples`);
    startJob("map", label, { coords: ui.coords.value, name: name || null,
      maxDistance: Number(ui.maxDistance.value) || 0.08, brand: BRAND, region });
  }

  function startJob(kind, label, request) {
    startEngine();
    if (!worker) return;
    job = { id: nextId++, kind, started: performance.now(), label, request };
    worker.postMessage({ type: "render", id: job.id, ...request });
    setBusy(true, kind === "map");
    const first = kind === "view" ? "Saving this view: drawing the visible part as a full-size map…"
      : request.region === SLOW_REGION ? `Starting… ${SLOW_NOTE}` : "Starting…";
    const ready = engine === "ready";
    setStatus("busy", ready ? first : "Waiting for the map engine to finish loading…", ready ? 0.3 : undefined);
    const tick = () => {
      if (job) ui.statusTime.textContent = ` · ${Math.floor((performance.now() - job.started) / 1000)} s`;
    };
    tick();
    ticker = setInterval(tick, 1000);
  }

  ui.form.addEventListener("submit", (e) => {
    e.preventDefault();
    createMap();
  });

  const box4 = (a) => (Array.isArray(a) && a.length === 4 && a.every((v) => Number.isFinite(Number(v))) ? a.map(Number) : null);

  function showResult(m) {
    const { label, started, request } = job;
    const total = (performance.now() - started) / 1000;
    endJob();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([m.png], { type: "image/png" }));
    const drawn = { ...request, region: typeof m.region === "string" && m.region ? m.region : request.region };
    shown = { request: drawn, label, width: m.width, height: m.height, mapBox: box4(m.mapBox), extent: box4(m.extent) };
    const where = regionLabel(drawn.region);
    if (m.width && m.height) Object.assign(ui.img, { width: m.width, height: m.height });
    ui.img.src = blobUrl;
    ui.img.alt = `Genetic distance map for ${label} (${where}). Red marks the closest regions, dark blue the most distant.`;
    ui.download.href = blobUrl;
    ui.download.download = m.filename || "g25-heatmap.png";

    const scale = Number.isFinite(m.vmin) && Number.isFinite(m.vmax)
      ? `Colour scale ${m.vmin.toFixed(3)}–${m.vmax.toFixed(3)}; red = closest.`
      : "Red = closest.";
    ui.caption.textContent = `Genetic distance map for ${label} (${where}). ${scale}`;
    ui.size.textContent = m.width && m.height ? `${m.width} × ${m.height} px` : "";
    ui.time.textContent = `computed in ${fmtSeconds(typeof m.seconds === "number" ? m.seconds : total)}`;

    ui.tableBody.textContent = "";
    (Array.isArray(m.nearest) ? m.nearest : []).slice(0, 12).forEach(([population, distance], i) => {
      const row = make("tr");
      row.append(make("td", "num", String(i + 1)), make("td", null, String(population).replace(/_/g, " ")),
        make("td", "num", Number(distance).toFixed(4)));
      ui.tableBody.append(row);
    });
    ui.table.hidden = !ui.tableBody.children.length;

    ui.placeholder.hidden = true;
    ui.result.hidden = false;
    resetZoom(); 
    setStatus("done", `Map created in ${fmtSeconds(total)}. See Figure 1 below.`, 1);
    if (ui.result.getBoundingClientRect().top > window.innerHeight * 0.7) {
      ui.result.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    }
  }

  const MIN_VIEW = 0.02; 

  function visibleBox() {
    const g = geometry();
    const kx = (shown.width || ui.img.naturalWidth) / g.dw; 
    const ky = (shown.height || ui.img.naturalHeight) / g.dh;
    return [(0 - g.tx) / zoom.s * kx, (0 - g.ty) / zoom.s * ky, (g.fw - g.tx) / zoom.s * kx, (g.fh - g.ty) / zoom.s * ky];
  }

  function visibleView() {
    if (!shown || !shown.mapBox || !shown.extent) return null;
    const g = geometry();
    if (!g.dw || !g.dh) return null;
    const [left, top, right, bottom] = shown.mapBox;
    const [xmin, xmax, ymin, ymax] = shown.extent;
    if (!(right > left && bottom > top && xmax > xmin && ymax > ymin)) return null;
    const [vl, vt, vr, vb] = visibleBox();
    const l = Math.max(vl, left), t = Math.max(vt, top), r = Math.min(vr, right), b = Math.min(vb, bottom);
    if (r - l < MIN_VIEW * (right - left) || b - t < MIN_VIEW * (bottom - top)) return null;
    const toX = (px) => xmin + ((px - left) / (right - left)) * (xmax - xmin);
    const toY = (py) => ymax - ((py - top) / (bottom - top)) * (ymax - ymin);
    return [toX(l), toX(r), toY(b), toY(t)];
  }

  function updateSaveView() {
    setDisabled(ui.saveView, !shown || Boolean(job) || (isZoomed() && !visibleView()));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(make("a"), { href: url, download: filename });
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function saveViewResult(m) {
    const total = (performance.now() - job.started) / 1000;
    endJob();
    const filename = m.filename || "g25-heatmap-view.png";
    downloadBlob(new Blob([m.png], { type: "image/png" }), filename);
    setStatus("done", `This view was saved as ${filename} (drawn in ${fmtSeconds(total)}).`, 1);
  }

  ui.saveView.addEventListener("click", () => {
    if (job || !shown) return;
    if (!isZoomed()) {
      ui.download.click(); 
      return;
    }
    const view = visibleView();
    if (view) startJob("view", shown.label, { ...shown.request, view });
    else if (!shown.mapBox || !shown.extent) setStatus("ready", "This map cannot be redrawn as a view. Use “Download PNG” for the whole map.");
    else setStatus("ready", "Too little of the map is visible to save this view. Zoom out or move the map, then try again.");
  });

  const MAX_ZOOM = 8;
  const STEP = 1.5;
  const zoom = { s: 1, cx: 0.5, cy: 0.5 };
  const isZoomed = () => zoom.s > 1;

  function geometry() {
    const r = ui.frame.getBoundingClientRect();
    const fw = Math.max(0, r.width - 2 * ui.frame.clientLeft), fh = Math.max(0, r.height - 2 * ui.frame.clientTop);
    const css = getComputedStyle(ui.img);
    const dw = parseFloat(css.width) || fw, dh = parseFloat(css.height) || fh;
    return { fw, fh, dw, dh, tx: fw / 2 - zoom.s * zoom.cx * dw, ty: fh / 2 - zoom.s * zoom.cy * dh };
  }

  function applyZoom(animate) {
    const g = geometry();
    const keep = (c, f, d) => {
      const half = d ? f / (2 * zoom.s * d) : 0.5;
      return half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, c));
    };
    zoom.cx = keep(zoom.cx, g.fw, g.dw);
    zoom.cy = keep(zoom.cy, g.fh, g.dh);
    const { tx, ty } = geometry();
    ui.img.classList.toggle("is-animated", Boolean(animate));
    ui.img.style.transform = isZoomed() ? `translate(${tx}px, ${ty}px) scale(${zoom.s})` : "";
    ui.frame.classList.toggle("is-zoomed", isZoomed());
    setDisabled(ui.zoomIn, zoom.s >= MAX_ZOOM);
    setDisabled(ui.zoomOut, !isZoomed());
    setDisabled(ui.zoomReset, !isZoomed());
    updateSaveView();
  }

  function zoomBy(factor, fx, fy, animate) {
    const g = geometry();
    let s = Math.min(MAX_ZOOM, Math.max(1, zoom.s * factor));
    if (s < 1.001) s = 1;
    if (s === zoom.s || !g.dw || !g.dh) return;
    const x = fx == null ? g.fw / 2 : fx, y = fy == null ? g.fh / 2 : fy;
    const u = (x - g.tx) / (zoom.s * g.dw), v = (y - g.ty) / (zoom.s * g.dh);
    zoom.cx = u + (g.fw / 2 - x) / (s * g.dw);
    zoom.cy = v + (g.fh / 2 - y) / (s * g.dh);
    zoom.s = s;
    applyZoom(animate);
  }

  function panBy(dx, dy, animate) {
    const g = geometry();
    if (!isZoomed() || !g.dw || !g.dh) return;
    zoom.cx -= dx / (zoom.s * g.dw);
    zoom.cy -= dy / (zoom.s * g.dh);
    applyZoom(animate);
  }

  function resetZoom(animate) {
    Object.assign(zoom, { s: 1, cx: 0.5, cy: 0.5 });
    applyZoom(animate);
  }

  const framePoint = (x, y) => {
    const r = ui.frame.getBoundingClientRect();
    return [x - r.left - ui.frame.clientLeft, y - r.top - ui.frame.clientTop];
  };

  ui.zoomIn.addEventListener("click", () => zoomBy(STEP, null, null, true));
  ui.zoomOut.addEventListener("click", () => zoomBy(1 / STEP, null, null, true));
  ui.zoomReset.addEventListener("click", () => resetZoom(true));
  window.addEventListener("resize", () => applyZoom());

  ui.frame.addEventListener("wheel", (e) => {
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? ui.frame.clientHeight : 1);
    if (!dy || (!isZoomed() && dy > 0 && !e.ctrlKey)) return;
    e.preventDefault();
    const factor = Math.min(2, Math.max(0.5, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002))));
    zoomBy(factor, ...framePoint(e.clientX, e.clientY));
  }, { passive: false });

  ui.frame.addEventListener("dblclick", (e) => zoomBy(e.shiftKey ? 0.5 : 2, ...framePoint(e.clientX, e.clientY), true));

  const pointers = new Map(); 
  ui.frame.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    try {
      ui.frame.setPointerCapture(e.pointerId);
    } catch (err) {
    }
  });
  ui.frame.addEventListener("pointermove", (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const before = [...pointers.values()];
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (before.length >= 2) {
      const after = [...pointers.values()];
      const dist = (p) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      const mid = (p) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
      const [m0, m1] = [mid(before), mid(after)];
      if (dist(before) > 0) zoomBy(dist(after) / dist(before), ...framePoint(m0[0], m0[1]));
      panBy(m1[0] - m0[0], m1[1] - m0[1]);
    } else if (isZoomed()) {
      ui.frame.classList.add("is-dragging");
      panBy(e.clientX - last[0], e.clientY - last[1]);
    }
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) ui.frame.classList.remove("is-dragging");
  };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => ui.frame.addEventListener(type, release));

  const ARROWS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  ui.frame.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") zoomBy(STEP, null, null, true);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / STEP, null, null, true);
    else if (e.key === "0") resetZoom(true);
    else if (ARROWS[e.key] && isZoomed()) panBy(ARROWS[e.key][0] * ui.frame.clientWidth * 0.1, ARROWS[e.key][1] * ui.frame.clientHeight * 0.1, true);
    else return;
    e.preventDefault();
  });
  resetZoom();

  const syncRegions = () => ui.regionButtons.querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.region === region)));
  REGIONS.forEach((r) => {
    const button = make("button", "choice", r.label);
    button.type = "button";
    button.dataset.region = r.key;
    button.addEventListener("click", () => {
      if (job) return; 
      region = r.key;
      syncRegions();
      if (shown && !ui.result.hidden && shown.request.region !== region) createMap();
    });
    ui.regionButtons.append(button);
  });
  ui.regionField.hidden = !REGIONS.length;
  syncRegions();

  (cfg.samples || []).forEach((sample) => {
    if (!sample || !sample.coords) return;
    const button = make("button", "button-secondary", sample.label || "Example");
    button.type = "button";
    button.addEventListener("click", () => {
      ui.coords.value = sample.coords;
      ui.name.value = "";
      setInputError("");
      updateHint();
    });
    ui.sampleButtons.append(button);
  });
  ui.samples.hidden = !ui.sampleButtons.children.length;

  let hintTimer = 0;
  ui.coords.addEventListener("input", () => {
    setInputError("");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(updateHint, 120);
  });
  ui.coords.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && typeof ui.form.requestSubmit === "function") ui.form.requestSubmit();
  });
  updateHint(); 

  if (!canRun) {
    setStatus("error", NO_SUPPORT);
  } else if (fromFile) {
    setStatus("error", NO_FILE);
    ui.placeholder.hidden = true;
    ui.fileNotice.hidden = false;
  } else if (navigator.connection && navigator.connection.saveData) {
    setStatus("idle", "The map engine (a one-time download) loads when you start.");
    ui.form.addEventListener("focusin", startEngine, { once: true });
  } else {
    const boot = () => (window.requestIdleCallback ? window.requestIdleCallback(startEngine, { timeout: 2000 }) : setTimeout(startEngine, 300));
    if (document.readyState === "complete") boot();
    else window.addEventListener("load", boot, { once: true });
  }

  const gallery = $("gallery");
  (cfg.examples || []).filter((x) => x && x.file).forEach((x, i) => {
    const file = String(x.file);
    const src = file;
    const title = String(x.title || file);
    const link = Object.assign(make("a"), { href: src, target: "_blank", rel: "noopener" });
    link.setAttribute("aria-label", `${title}: open the full-size map`);
    const thumb = x.thumb ? String(x.thumb) : src.replace(/\.png$/i, ".webp");
    const img = Object.assign(make("img"), { alt: "", loading: "lazy", decoding: "async", width: 900, height: 696 });
    img.addEventListener("error", () => { if (img.src !== new URL(src, location.href).href) img.src = src; }, { once: true });
    img.src = thumb;
    link.append(img);
    const caption = make("figcaption");
    caption.append(make("span", "fig-label", `Figure 2${i < 26 ? String.fromCharCode(97 + i) : `.${i + 1}`}.`), ` ${title}`);
    const figure = make("figure");
    figure.append(link, caption);
    gallery.append(figure);
  });
})();
