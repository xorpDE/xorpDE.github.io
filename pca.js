(function () {
  "use strict";
  const D = window.BALKAN_DATA;
  const X = window.XORPDE;
  const $ = (id) => document.getElementById(id);
  const PCA = D.pca;

  function project(v) {
    return PCA.evs.map((ev) => {
      let s = 0;
      for (let k = 0; k < 25; k++) s += (v[k] - PCA.mean[k]) * ev[k];
      return s;
    });
  }

  const GROUPS = [
    ["Albanian", "#ef4444"], ["Greek", "#3b82f6"], ["Macedonian", "#a855f7"], ["Bulgarian", "#eab308"],
    ["W. South Slavic", "#06b6d4"], ["Romanian", "#f97316"], ["Aromanian", "#ec4899"], ["Italian", "#22c55e"],
    ["Other", "#a3a3a3"],
  ];
  const GROUP_COLOR = Object.fromEntries(GROUPS);
  const SOURCE_COLOR = { Thracian: "#eab308", Illyrian: "#22c55e", Ancient_Macedonian: "#9333ea", Anatolian: "#dc2626", Slavic: "#2563eb" };
  const SOURCE_LEFT = new Set(["Ancient_Macedonian"]);
  const YOU = "#e07840";
  const AXIS_ENDS = [["Mediterranean", "Slavic"], ["East Mediterranean", "Paleo-Balkan"], null, null];
  const FONT = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const NAMES_FROM = 2.7; 

  const BALKAN = new Set(["Albania", "Kosovo", "North Macedonia", "Greece", "Bulgaria", "Serbia", "Montenegro", "Bosnia", "Croatia", "Slovenia", "Romania", "Moldova"]);
  const shortName = (s) => s.replace(/\s*\([nN]=\d+\)/g, "");
  const points = D.refs.map(([name, display, country, period, date, , group, v]) => ({
    name, display, label: shortName(display), country, period, date, group, v, ancient: group === "Ancient", p: project(v),
    core: group !== "Ancient" && group !== "Other" && group !== "Italian" && BALKAN.has(country),
  }));
  const anchors = Object.entries(D.sources).map(([g, list]) => {
    const avg = new Array(25).fill(0);
    list.forEach(([, v]) => v.forEach((x, k) => { avg[k] += x / list.length; }));
    const display = g.replace(/_/g, " ");
    return { name: g, display, label: display, color: SOURCE_COLOR[g] || "#888888", left: SOURCE_LEFT.has(g), n: list.length, p: project(avg), anchor: true };
  });
  let users = [];

  const canvas = $("pcaCanvas"), ctx = canvas.getContext("2d"), wrap = $("plotWrap"), tip = $("tooltip");
  const view = { cx: 0, cy: 0, scale: 1 };
  let dimX = 0, dimY = 1, hovered = null, dpr = 1, W = 0, H = 0, fitScale = 1, sized = false;
  let showAncient = true, showNames = true, palette = null, frame = 0;

  const toScreen = (p) => ({ x: W / 2 + (p[dimX] - view.cx) * view.scale, y: H / 2 - (p[dimY] - view.cy) * view.scale });
  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }

  function resetView() {
    const xs = [], ys = [];
    points.forEach((pt) => { if (pt.core) { xs.push(pt.p[dimX]); ys.push(pt.p[dimY]); } });
    anchors.concat(users).forEach((pt) => { xs.push(pt.p[dimX]); ys.push(pt.p[dimY]); });
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    view.cx = (minX + maxX) / 2;
    view.cy = (minY + maxY) / 2;
    fitScale = Math.min((W - 60) / Math.max(maxX - minX, 1e-6), (H - 70) / Math.max(maxY - minY, 1e-6)) / 1.12;
    view.scale = fitScale;
    clearHover();
    requestDraw();
  }
  function zoomAt(factor, sx, sy) {
    const next = Math.max(fitScale / 6, Math.min(fitScale * 80, view.scale * factor));
    const wx = view.cx + (sx - W / 2) / view.scale, wy = view.cy - (sy - H / 2) / view.scale;
    view.scale = next;
    view.cx = wx - (sx - W / 2) / view.scale;
    view.cy = wy + (sy - H / 2) / view.scale;
    clearHover();
    requestDraw();
  }
  function pan(dx, dy) {
    view.cx += dx / view.scale;
    view.cy -= dy / view.scale;
    clearHover();
    requestDraw();
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const scaleBy = W ? w / W : 1;
    dpr = window.devicePixelRatio || 1;
    W = w; H = h;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (!sized) { sized = true; resetView(); }
    else { view.scale *= scaleBy; fitScale *= scaleBy; clearHover(); }
    draw(); 
  }
  function watchDensity() {
    const q = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    q.addEventListener("change", () => { resize(); watchDensity(); }, { once: true });
  }

  function colors() {
    const dark = X.isDark();
    return {
      dark,
      bg: getComputedStyle(wrap).backgroundColor,
      grid: dark ? "#2a3038" : "#dde1e7",
      tick: dark ? "#949ca7" : "#5f6672",
      axis: dark ? "#3b424c" : "#c3c9d1",
      text: dark ? "#e7eaee" : "#15181d",
      muted: dark ? "#aab2bd" : "#4f5765",
      faint: dark ? "#949ca7" : "#5f6672",
      ancient: dark ? "rgba(231,234,238,0.30)" : "rgba(55,60,70,0.20)",
      ancientEdge: dark ? "rgba(231,234,238,0.62)" : "rgba(55,60,70,0.55)",
      labelBg: dark ? "rgba(30,35,42,0.88)" : "rgba(255,255,255,0.88)",
      ring: dark ? "#ffffff" : "#15181d",
    };
  }
  function gridStep() {
    const t = 90 / view.scale, m = Math.pow(10, Math.floor(Math.log10(t))), n = t / m;
    return n < 2 ? 2 * m : n < 5 ? 5 * m : 10 * m;
  }
  function diamond(x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }
  function ink(hex, dark) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    return `rgb(${c.map((v) => Math.round(dark ? v + (255 - v) * 0.4 : v * 0.62)).join(",")})`;
  }
  const widths = new Map();
  function textWidth(font, text) {
    const key = font + "|" + text;
    let w = widths.get(key);
    if (w === undefined) { ctx.font = font; w = ctx.measureText(text).width; widths.set(key, w); }
    return w;
  }
  function nameAt(C, text, x, y, off, size, weight, color, box, left) {
    const font = `${weight} ${size}px ${FONT}`;
    const w = textWidth(font, text);
    let tx = left ? x - off - w : x + off;
    if (!left && tx + w > W - 4) tx = x - off - w;
    else if (left && tx < 26) tx = x + off;
    if (box) { ctx.fillStyle = C.labelBg; ctx.fillRect(tx - 3, y - size / 2 - 3, w + 6, size + 6); }
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, tx, y);
  }

  function draw() {
    if (!W) return;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    const C = palette || (palette = colors());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const step = gridStep(), dec = Math.max(0, -Math.floor(Math.log10(step)));
    const left = view.cx - W / 2 / view.scale, right = view.cx + W / 2 / view.scale;
    const bottom = view.cy - H / 2 / view.scale, top = view.cy + H / 2 / view.scale;
    const ticksX = [], ticksY = [];
    for (let i = Math.ceil(left / step); i * step <= right; i++) ticksX.push(i);
    for (let i = Math.ceil(bottom / step); i * step <= top; i++) ticksY.push(i);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.grid;
    ticksX.forEach((i) => { const x = Math.round(W / 2 + (i * step - view.cx) * view.scale) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); });
    ticksY.forEach((i) => { const y = Math.round(H / 2 - (i * step - view.cy) * view.scale) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); });
    const z = toScreen([0, 0, 0, 0]);
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(Math.round(z.x) + 0.5, 0); ctx.lineTo(Math.round(z.x) + 0.5, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, Math.round(z.y) + 0.5); ctx.lineTo(W, Math.round(z.y) + 0.5); ctx.stroke();

    const r = Math.max(3.5, Math.min(6.5, 3.5 + Math.log2(view.scale / fitScale)));
    const named = showNames && view.scale >= fitScale * NAMES_FROM;
    const visible = (s, m) => s.x > -m && s.x < W + m && s.y > -m && s.y < H + m;
    const names = []; 

    if (showAncient) {
      points.forEach((pt) => {
        if (!pt.ancient) return;
        const s = toScreen(pt.p);
        if (!visible(s, 200)) return;
        const hov = hovered === pt, sz = hov ? r * 1.5 : r * 0.95;
        if (named && !hov) names.push([pt.label, s.x, s.y, sz + 4, C.faint]);
        if (!visible(s, 20)) return;
        diamond(s.x, s.y, sz);
        ctx.fillStyle = C.ancient; ctx.fill();
        ctx.lineWidth = hov ? 1.6 : 1; ctx.strokeStyle = hov ? C.ring : C.ancientEdge; ctx.stroke();
      });
    }
    ["Other"].concat(GROUPS.map((g) => g[0]).filter((g) => g !== "Other")).forEach((group) => {
      const col = GROUP_COLOR[group];
      points.forEach((pt) => {
        if (pt.ancient || pt.group !== group) return;
        const s = toScreen(pt.p);
        if (!visible(s, 200)) return;
        const hov = hovered === pt, cr = hov ? r * 1.45 : r;
        if (named && !hov) names.push([pt.label, s.x, s.y, cr + 4, C.muted]);
        if (!visible(s, 20)) return;
        ctx.beginPath(); ctx.arc(s.x, s.y, cr, 0, Math.PI * 2);
        ctx.fillStyle = col + (hov ? "ee" : "99"); ctx.fill();
        ctx.lineWidth = hov ? 2 : 1.1; ctx.strokeStyle = hov ? C.ring : col; ctx.stroke();
      });
    });
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    names.forEach(([text, x, y, off, color]) => nameAt(C, text, x, y, off, 9.5, 400, color, false, false));

    anchors.forEach((a) => {
      const s = toScreen(a.p);
      if (!visible(s, 120)) return;
      const hov = hovered === a, sz = hov ? 11 : 8.5;
      diamond(s.x, s.y, sz);
      ctx.fillStyle = a.color + "33"; ctx.fill();
      ctx.lineWidth = hov ? 2.6 : 2; ctx.strokeStyle = a.color; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x - sz * 0.5, s.y); ctx.lineTo(s.x + sz * 0.5, s.y); ctx.moveTo(s.x, s.y - sz * 0.5); ctx.lineTo(s.x, s.y + sz * 0.5); ctx.stroke();
      nameAt(C, a.label, s.x, s.y, sz + 6, 11.5, 600, ink(a.color, C.dark), true, a.left);
    });
    users.forEach((u) => {
      const s = toScreen(u.p);
      if (!visible(s, 120)) return;
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.6, 0, Math.PI * 2); ctx.fillStyle = "rgba(224,120,64,0.16)"; ctx.fill();
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(5, r * 1.3), 0, Math.PI * 2); ctx.fillStyle = YOU; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C.ring; ctx.stroke();
      nameAt(C, u.label, s.x, s.y, Math.max(5, r * 1.3) + 7, 12.5, 600, C.text, true, false);
    });
    if (hovered && !hovered.anchor && !hovered.user) {
      const s = toScreen(hovered.p);
      nameAt(C, hovered.label, s.x, s.y, r * 1.5 + 5, 11.5, 600, C.text, true, false);
    }

    const tickText = (i) => (i === 0 ? 0 : i * step).toFixed(dec);
    const tickFont = `10px ${FONT}`;
    ctx.font = tickFont;
    ticksX.forEach((i) => {
      const x = Math.round(W / 2 + (i * step - view.cx) * view.scale), t = tickText(i), w = textWidth(tickFont, t);
      ctx.fillStyle = C.labelBg; ctx.fillRect(x - w / 2 - 2, H - 33, w + 4, 13);
      ctx.fillStyle = C.tick; ctx.textAlign = "center"; ctx.fillText(t, x, H - 26);
    });
    ticksY.forEach((i) => {
      const y = Math.round(H / 2 - (i * step - view.cy) * view.scale), t = tickText(i), w = textWidth(tickFont, t);
      ctx.fillStyle = C.labelBg; ctx.fillRect(24, y - 11, w + 4, 13);
      ctx.fillStyle = C.tick; ctx.textAlign = "left"; ctx.fillText(t, 26, y - 4);
    });
    ctx.textBaseline = "alphabetic";
    axisTitles(C);
  }
  function axisTitles(C) {
    const titleFont = `600 11px ${FONT}`, endFont = `11px ${FONT}`;
    const put = (text, x, y, align, font) => {
      const w = textWidth(font, text), x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
      ctx.fillStyle = C.labelBg; ctx.fillRect(x0 - 6, y - 13, w + 12, 17);
      ctx.font = font; ctx.fillStyle = C.muted; ctx.textAlign = align; ctx.fillText(text, x, y);
    };
    const axis = (d, length, low, high, y) => {
      const title = `PC${d + 1} (${PCA.var[d]}%)`, ends = AXIS_ENDS[d];
      const half = textWidth(titleFont, title) / 2 + 12;
      if (ends && low + textWidth(endFont, ends[0]) < length / 2 - half && high - textWidth(endFont, ends[1]) > length / 2 + half) {
        put(ends[0], low, y, "left", endFont);
        put(ends[1], high, y, "right", endFont);
      }
      put(title, length / 2, y, "center", titleFont);
    };
    axis(dimX, W, 32, W - 8, H - 6);
    ctx.save(); ctx.translate(13, H); ctx.rotate(-Math.PI / 2);
    axis(dimY, H, 44, H - 8, 2);
    ctx.restore();
  }

  function nearest(sx, sy) {
    let best = null, bestD = Infinity;
    const test = (pt, max) => {
      const s = toScreen(pt.p), d = Math.hypot(s.x - sx, s.y - sy);
      if (d < max && d < bestD) { best = pt; bestD = d; }
    };
    users.forEach((u) => test(u, 16));
    if (best) return best;
    anchors.forEach((a) => test(a, 15));
    if (best) return best;
    points.forEach((pt) => { if (!pt.ancient || showAncient) test(pt, 11); });
    return best;
  }
  function describe(pt) {
    if (pt.anchor) return `<strong>${esc(pt.display)}</strong><small>Calculator source, average of ${pt.n} samples</small>`;
    if (pt.user) return `<strong>${esc(pt.display)}</strong><small>From your input</small>`;
    const date = pt.date && pt.date !== "Various" ? pt.date : "";
    const when = pt.ancient ? [pt.period, date].filter(Boolean).join(", ") : "Modern";
    const group = pt.ancient ? "" : ", " + (pt.group === "Other" ? "other group" : pt.group);
    return `<strong>${esc(pt.display)}</strong><small>${esc([pt.country, when].filter(Boolean).join(", ") + group)}</small>`;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function showTip(pt, cx, cy) {
    if (!pt) { tip.style.display = "none"; return; }
    tip.innerHTML = describe(pt);
    tip.style.display = "block";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(cx + 14, window.innerWidth - w - 8)) + "px";
    tip.style.top = Math.max(8, cy - h - 10) + "px";
  }
  function clearHover() {
    const had = hovered;
    showTip(null);
    hovered = null;
    return Boolean(had);
  }
  function hover(e) {
    const rect = canvas.getBoundingClientRect();
    const pt = nearest(e.clientX - rect.left, e.clientY - rect.top);
    showTip(pt, e.clientX, e.clientY);
    if (pt !== hovered) { hovered = pt; requestDraw(); }
  }

  const pointers = new Map();
  let drag = null, pinch = null;
  function endDrag() {
    pointers.clear();
    drag = null; pinch = null;
    canvas.classList.remove("is-dragging");
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; 
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false, slop: e.pointerType === "mouse" ? 0 : 6 };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
      drag = null;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && drag && e.buttons === 0) endDrag(); 
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const rect = canvas.getBoundingClientRect();
      const f = (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) * pinch.scale / view.scale;
      zoomAt(f, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }
    if (drag) {
      let dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= drag.slop) return;
        drag.moved = true;
        canvas.classList.add("is-dragging");
        clearHover();
        if (drag.slop) { drag.x = e.clientX; drag.y = e.clientY; dx = 0; dy = 0; } 
      }
      view.cx = drag.cx - dx / view.scale;
      view.cy = drag.cy + dy / view.scale;
      requestDraw();
      return;
    }
    if (e.pointerType === "mouse") hover(e);
  });
  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === "pointerup") hover(e); 
    if (pointers.size === 0) { drag = null; canvas.classList.remove("is-dragging"); }
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !drag && clearHover()) requestDraw(); });
  canvas.addEventListener("wheel", (e) => {
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1);
    if (!dy || (dy > 0 && !e.ctrlKey && view.scale <= fitScale * 1.0001)) return;
    const f = Math.min(2, Math.max(0.5, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))));
    const next = Math.max(fitScale / 6, Math.min(fitScale * 80, view.scale * f));
    if (Math.abs(next - view.scale) <= view.scale * 1e-9) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(f, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
  canvas.addEventListener("keydown", (e) => {
    const stepPx = Math.min(W, H) * 0.12;
    const keys = {
      ArrowLeft: () => pan(-stepPx, 0), ArrowRight: () => pan(stepPx, 0), ArrowUp: () => pan(0, -stepPx), ArrowDown: () => pan(0, stepPx),
      "+": () => zoomAt(1.4, W / 2, H / 2), "=": () => zoomAt(1.4, W / 2, H / 2), "-": () => zoomAt(1 / 1.4, W / 2, H / 2),
      "0": resetView, Escape: () => { if (clearHover()) requestDraw(); },
    };
    if (keys[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); keys[e.key](); }
  });
  window.addEventListener("scroll", () => { if (tip.style.display === "block" && clearHover()) requestDraw(); }, { passive: true });

  function axisButtons(box, axis) {
    for (let d = 0; d < 4; d++) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pc-btn"; b.textContent = "PC" + (d + 1);
      b.dataset.dim = d;
      b.addEventListener("click", () => {
        if (axis === "x") { if (d === dimY) dimY = dimX; dimX = d; }
        else { if (d === dimX) dimX = dimY; dimY = d; }
        syncAxisButtons();
        resetView();
      });
      box.append(b);
    }
  }
  function syncAxisButtons() {
    document.querySelectorAll("#axisX .pc-btn").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.dim) === dimX)));
    document.querySelectorAll("#axisY .pc-btn").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.dim) === dimY)));
  }

  function legend() {
    const counts = {};
    points.forEach((pt) => { if (!pt.ancient) counts[pt.group] = (counts[pt.group] || 0) + 1; });
    let h = GROUPS.filter(([g]) => counts[g]).map(([g, c]) => `<span><i style="background:${c}"></i>${esc(g === "Other" ? "Other modern" : g)}</span>`).join("");
    h += '<span><i class="diamond" style="background:#8a929d"></i>Ancient population</span>';
    h += '<span><i class="anchor" style="color:#6b7380"></i>Calculator source (average)</span>';
    if (users.length) h += `<span><i class="you"></i>${users.length > 1 ? "Your samples" : "Your sample"}</span>`;
    $("legend").innerHTML = h;
  }

  function setError(msg) {
    $("coordError").textContent = msg;
    $("coordError").hidden = !msg;
    if (msg) $("coordInput").setAttribute("aria-invalid", "true");
    else $("coordInput").removeAttribute("aria-invalid");
  }
  function summarize() {
    if (!users.length) { $("plotStatus").textContent = "No samples on the plot."; return; }
    const u = users[0];
    const close = points.map((pt) => ({ pt, d: pt.v.reduce((t, x, k) => t + (x - u.coords[k]) ** 2, 0) }))
      .sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.pt.display);
    $("plotStatus").textContent = `${users.length} sample${users.length > 1 ? "s" : ""} on the plot. Closest populations to ${u.display}: ${close.join(", ")}.`;
  }
  function plot() {
    const text = $("coordInput").value;
    const parsed = X.parseCoordinates(text);
    users = parsed.samples.map((s, i) => {
      const display = s.name || (parsed.samples.length > 1 ? `Sample ${i + 1}` : "You");
      return { display, label: display, p: project(s.coords), coords: s.coords, user: true };
    });
    const errors = parsed.errors;
    if (!users.length) setError(text.trim() ? errors[0] || "Could not read 25 G25 coordinates. Paste lines with a name and 25 numbers." : "");
    else setError(errors.length ? `${errors[0]} ${errors.length > 1 ? `This and ${errors.length - 1} more line${errors.length > 2 ? "s" : ""} were skipped.` : "This line was skipped."}` : "");
    $("coordHint").textContent = users.length ? `${users.length} sample${users.length > 1 ? "s" : ""} on the plot.` : "One sample per line: a name and 25 comma-separated numbers. Every line becomes a point.";
    $("coordHint").classList.toggle("is-ok", users.length > 0);
    legend();
    summarize();
    if (sized) resetView();
  }

  const EXAMPLES = ["Albanian", "Greek", "Macedonian", "Bulgarian", "Serb", "Romanian", "Croat"];
  function renderExamples() {
    const box = $("sampleButtons");
    EXAMPLES.forEach((name) => {
      const r = D.refs.find((x) => x[0] === name);
      if (!r) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = r[1];
      b.addEventListener("click", () => {
        const line = r[1] + " (average)," + r[7].join(",");
        const ta = $("coordInput");
        if (!ta.value.includes(line)) ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + line;
        plot();
      });
      box.append(b);
    });
    $("samples").hidden = !box.children.length;
  }

  function saveImage() {
    draw(); 
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "balkan-pca-plot.png";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  function init() {
    axisButtons($("axisX"), "x");
    axisButtons($("axisY"), "y");
    syncAxisButtons();
    renderExamples();
    showAncient = $("showAncient").checked;
    showNames = $("showNames").checked;
    const nModern = points.filter((p) => !p.ancient).length, nAncient = points.length - nModern;
    $("plotSub").textContent = `${nModern} modern and ${nAncient} ancient populations, ${anchors.length} calculator sources`;
    $("aboutData").textContent = `The axes are computed from ${PCA.n} modern populations of the Balkan countries. All other populations, the ancient ones, the calculator sources and your own samples are placed on these axes.`;

    $("plotBtn").addEventListener("click", plot);
    $("clearBtn").addEventListener("click", () => { $("coordInput").value = ""; plot(); });
    $("coordInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); plot(); } });
    $("coordInput").addEventListener("input", () => setError(""));
    $("showAncient").addEventListener("change", (e) => { showAncient = e.target.checked; clearHover(); requestDraw(); });
    $("showNames").addEventListener("change", (e) => { showNames = e.target.checked; requestDraw(); });
    $("zoomIn").addEventListener("click", () => zoomAt(1.4, W / 2, H / 2));
    $("zoomOut").addEventListener("click", () => zoomAt(1 / 1.4, W / 2, H / 2));
    $("resetView").addEventListener("click", resetView);
    $("saveBtn").addEventListener("click", saveImage);
    document.addEventListener("xorpde:theme", () => { palette = null; requestDraw(); });

    plot(); 
    new ResizeObserver(resize).observe(canvas);
    resize();
    watchDensity();
  }
  init();
})();
