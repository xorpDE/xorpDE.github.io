(function () {
  "use strict";
  const D = window.BALKAN_DATA;
  const X = window.XORPDE;
  const $ = (id) => document.getElementById(id);

  const GROUPS = {
    Thracian: { color: "var(--c-thracian)", dark: true, text: "the Thracians, an Iron Age people of the eastern Balkans, in what is now Bulgaria, European Turkey and northeastern Greece." },
    Illyrian: { color: "var(--c-illyrian)", dark: true, text: "the Illyrians, an Iron Age people of the western Balkans, in what is now Albania, Montenegro, Kosovo, Bosnia and Croatia." },
    Ancient_Macedonian: { color: "var(--c-macedonian)", dark: false, text: "the ancient Macedonians, in what is now northern Greece and North Macedonia." },
    Anatolian: { color: "var(--c-anatolian)", dark: false, text: "people of ancient Anatolia (Asia Minor). Most Anatolian ancestry came into the Balkans in Roman and Byzantine times." },
    Slavic: { color: "var(--c-slavic)", dark: false, text: "medieval Slavic speakers from Central and Eastern Europe. The Slavs came into the Balkans from the 6th century on." },
  };
  const EXTRA_COLORS = [["#a1a1aa", true], ["#ec4899", true], ["#06b6d4", true], ["#f97316", true], ["#7c3aed", false], ["#84cc16", true]];
  const groupName = (g) => g.replace(/_/g, " ");
  const isSlavic = (g) => /slav/i.test(g);

  function colorsFor(groups) {
    let extra = 0;
    const out = {};
    groups.forEach((g) => {
      if (GROUPS[g]) out[g] = { color: GROUPS[g].color, dark: GROUPS[g].dark };
      else { const c = EXTRA_COLORS[extra++ % EXTRA_COLORS.length]; out[g] = { color: c[0], dark: c[1] }; }
    });
    return out;
  }

  const MODELS = D.models.map((m) => ({
    id: m.id, name: m.name, file: m.file, groups: m.groups,
    defaultText: m.groups.map((g) => D.sources[g].map(([label, v]) => label + "," + v.join(",")).join("\n")).join("\n"),
  }));
  const editedText = {};
  let modelId = MODELS[0].id;
  const model = () => MODELS.find((m) => m.id === modelId);

  function parseSources(text) {
    const samples = [], groups = [], bad = [];
    text.split(/\r?\n/).forEach((line, i) => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(",").map((s) => s.trim());
      const label = parts[0];
      const v = parts.slice(1).map((s) => (s === "" ? NaN : Number(s)));
      if (!label || v.length !== 25 || v.some((x) => !Number.isFinite(x))) { bad.push(i + 1); return; }
      const group = label.split(":")[0].trim() || label;
      if (!groups.includes(group)) groups.push(group);
      samples.push({ label, group, coords: v });
    });
    return { samples, groups, bad };
  }
  let sources = parseSources(model().defaultText);

  const SLOTS = 500, RUNS = 16;
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function slotFit(vectors, target, rand) {
    const n = vectors.length, d = target.length;
    const s = vectors.map((v) => Float64Array.from(v, (x, k) => (x - target[k]) / SLOTS));
    const p = new Float64Array(d), np = new Float64Array(d);
    const weights = new Float64Array(n);
    if (n === 1) { weights[0] = 1; return weights; }
    const pick = (old) => { let r; do { r = Math.floor(rand() * n); } while (r === old); return r; };
    const cur = new Int32Array(SLOTS), next = new Int32Array(SLOTS);
    for (let j = 0; j < SLOTS; j++) { cur[j] = pick(-1); const a = s[cur[j]]; for (let k = 0; k < d; k++) p[k] += a[k]; }
    let best = 0;
    for (let k = 0; k < d; k++) best += p[k] * p[k];
    const cycles = Math.ceil(n / 4);
    for (let c = 0; c < cycles; c++) {
      for (let j = 0; j < SLOTS; j++) next[j] = pick(cur[j]);
      for (let j = 0; j < SLOTS; j++) {
        const a = s[cur[j]], b = s[next[j]];
        let q = 0;
        for (let k = 0; k < d; k++) { const v = p[k] - a[k] + b[k]; np[k] = v; q += v * v; }
        if (q < best) { cur[j] = next[j]; p.set(np); best = q; }
      }
    }
    const count = new Int32Array(n);
    for (let j = 0; j < SLOTS; j++) count[cur[j]]++;
    const rank = [];
    for (let i = 0; i < n; i++) if (count[i] > 0) rank.push([i, count[i]]);
    rank.sort((x, y) => y[1] - x[1]);
    const BIG = 1e17;
    let curD = Math.round(BIG * best), prev;
    do {
      prev = curD;
      for (let i = rank.length - 1; i >= 0; i--) {
        if (rank[i][1] <= 0) continue;
        const a = s[rank[i][0]];
        for (let j = 0; j < rank.length; j++) {
          if (i === j) continue;
          const b = s[rank[j][0]];
          let q = 0;
          for (let k = 0; k < d; k++) { const v = p[k] - a[k] + b[k]; np[k] = v; q += v * v; }
          const qd = Math.round(BIG * q);
          if (qd < curD) { rank[i][1]--; rank[j][1]++; p.set(np); curD = qd; break; }
        }
      }
    } while (curD < prev);
    for (const [i, c] of rank) weights[i] = c / SLOTS;
    return weights;
  }
  function seedOf(target) {
    let h = 2166136261;
    const text = target.map((v) => v.toFixed(6)).join(",");
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function fit(samples, groups, target) {
    const vectors = samples.map((s) => s.coords);
    const w = new Float64Array(samples.length);
    const seed = seedOf(target);
    for (let r = 0; r < RUNS; r++) {
      const one = slotFit(vectors, target, mulberry32(seed + r * 977));
      for (let i = 0; i < w.length; i++) w[i] += one[i] / RUNS;
    }
    const mix = new Array(25).fill(0);
    samples.forEach((s, i) => { if (w[i]) for (let k = 0; k < 25; k++) mix[k] += w[i] * s.coords[k]; });
    const distance = Math.sqrt(mix.reduce((t, v, k) => t + (v - target[k]) ** 2, 0));
    const shares = {};
    groups.forEach((g) => { shares[g] = 0; });
    samples.forEach((s, i) => { shares[s.group] += w[i]; });
    return { weights: w, shares, distance };
  }

  const DEFAULT_REFS = D.refs.map(([name, display, country, period, date, year, , coords]) => ({ name, display, country, period, date, year, coords }));
  let refs = DEFAULT_REFS.slice();
  const refText = (list) => list.map((r) => r.name + "," + r.coords.join(",")).join("\n");
  const isModern = (r) => r.year === null || r.year >= 1900;
  const isAncient = (r) => r.year !== null && r.year < 1900;
  const fold = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/_/g, " ");

  let mode = "normal";
  let period = "modern";
  let current = null; 
  let shownKey = ""; 
  let dists = [];

  function setInputError(msg, invalid = true) {
    $("coordError").textContent = msg;
    $("coordError").hidden = !msg;
    if (msg && invalid) $("coordInput").setAttribute("aria-invalid", "true");
    else $("coordInput").removeAttribute("aria-invalid");
  }
  function announce(msg) { $("srStatus").textContent = msg; }

  function readInput() {
    const parsed = X.parseCoordinates($("coordInput").value);
    if (!parsed.samples.length) {
      return { ok: false, error: parsed.errors[0] || "Could not read 25 G25 coordinates. Paste one line with a name and 25 numbers." };
    }
    const s = parsed.samples[0];
    return { ok: true, label: s.name || "Target", target: s.coords };
  }

  function drawBar(groups, shares) {
    const colors = colorsFor(sources.groups);
    const bar = $("admixBar"), legend = $("admixLegend");
    bar.replaceChildren(); legend.replaceChildren();
    groups.forEach((g) => {
      const pct = shares[g] * 100;
      if (pct >= 0.05) {
        const seg = document.createElement("div");
        seg.style.width = pct + "%";
        seg.style.background = colors[g].color;
        if (colors[g].dark) seg.className = "dark-ink";
        const label = document.createElement("span");
        label.textContent = pct.toFixed(1) + "%";
        seg.append(label);
        seg.title = groupName(g) + ": " + pct.toFixed(1) + "%";
        bar.append(seg);
      }
      const item = document.createElement("div");
      item.className = "legend-item" + (pct < 0.05 ? " is-zero" : "");
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = colors[g].color;
      const name = document.createElement("span");
      name.textContent = groupName(g);
      const val = document.createElement("span");
      val.className = "legend-pct";
      val.textContent = pct.toFixed(1) + "%";
      item.append(dot, name, val);
      legend.append(item);
    });
  }

  function fitBarLabels() {
    document.querySelectorAll("#admixBar > div > span").forEach((span) => {
      span.style.visibility = span.offsetWidth + 8 <= span.parentElement.clientWidth ? "" : "hidden";
    });
  }

  function infoHtml(groups) {
    const count = {};
    sources.samples.forEach((s) => { count[s.group] = (count[s.group] || 0) + 1; });
    return groups.map((g) => {
      const text = GROUPS[g] ? GROUPS[g].text : "a group from your edited sources.";
      return `<p><strong>${esc(groupName(g))}</strong> (${count[g] || 0} samples): ${esc(text)}</p>`;
    }).join("");
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function hideResults(msg, invalid) {
    setInputError(msg, invalid);
    $("results").classList.remove("visible");
    shownKey = "";
  }

  function calculate(scroll) {
    setInputError("");
    const input = readInput();
    if (!input.ok) { current = null; hideResults(input.error, true); return; }
    const result = fit(sources.samples, sources.groups, input.target);
    current = { label: input.label, target: input.target, result, ghost: null };

    if (mode === "ghost") {
      const slavicGroups = sources.groups.filter(isSlavic);
      const rest = sources.samples.filter((s) => !isSlavic(s.group));
      const pS = slavicGroups.reduce((t, g) => t + result.shares[g], 0);
      const problem = !slavicGroups.length ? "This model has no Slavic source group, so there is nothing to take out."
        : !rest.length ? "This model has no sources besides the Slavic one, so nothing is left to model."
        : pS < 0.005 ? "The Slavic share is below 0.5%, too small to take out. Try the ancestry calculator instead."
        : pS > 0.98 ? "The Slavic share is above 98%, too large to take out meaningfully." : "";
      if (problem) { hideResults(problem, false); return; }
      const slavicPart = new Array(25).fill(0);
      sources.samples.forEach((s, i) => { if (isSlavic(s.group) && result.weights[i]) for (let k = 0; k < 25; k++) slavicPart[k] += result.weights[i] * s.coords[k]; });
      const coords = input.target.map((v, k) => (v - slavicPart[k]) / (1 - pS));
      const restGroups = sources.groups.filter((g) => !isSlavic(g));
      current.ghost = { coords, slavic: pS, result: fit(rest, restGroups, coords), groups: restGroups };
    }
    const key = mode + "|" + input.target.join(",");
    show(scroll, key !== shownKey);
    shownKey = key;
  }

  function ghostLine(label = current.label) {
    return "PreSlavic_" + label.replace(/[\s,]+/g, "_") + "," + current.ghost.coords.map((v) => v.toFixed(7)).join(",");
  }

  function show(scroll, newTarget) {
    const m = model();
    const ghost = current.ghost;
    const groups = ghost ? ghost.groups : sources.groups;
    const res = ghost ? ghost.result : current.result;
    const edited = editedText[m.id] != null;
    $("admixTitle").textContent = ghost ? "Pre-Slavic profile" : "Ancestry";
    $("admixSub").textContent = ghost
      ? `${current.label}: ${m.name} model without its Slavic part (${(ghost.slavic * 100).toFixed(1)}% Slavic)${edited ? ", edited sources" : ""}`
      : `${current.label}: ${m.name} model${edited ? " with edited sources" : ""}`;
    drawBar(groups, res.shares);
    $("fitDist").textContent = res.distance.toFixed(8);
    $("fitNote").textContent = ghost ? "(higher values mean more noise from taking out the Slavic part)" : "(lower is better, below 0.02 is a good fit)";
    $("infoBody").innerHTML = infoHtml(groups);
    $("ghostBlock").hidden = !ghost;
    if (ghost) $("ghostCoords").textContent = ghostLine();

    $("distTitle").textContent = ghost ? "Closest populations to your pre-Slavic profile" : "Closest populations";
    computeDistances(ghost ? ghost.coords : current.target);
    if (newTarget) {
      setPeriod(ghost ? "ancient" : "modern");
      $("searchInput").value = "";
    }
    renderTable();

    const el = $("results");
    el.classList.add("visible");
    fitBarLabels();
    const top = dists.find((d) => (ghost ? isAncient(d.ref) : isModern(d.ref)));
    announce(`${ghost ? "Pre-Slavic profile" : "Result"}: ${groups.map((g) => `${groupName(g)} ${(res.shares[g] * 100).toFixed(1)}%`).join(", ")}. Fit distance ${res.distance.toFixed(4)}.${top ? ` Closest ${ghost ? "ancient " : ""}population: ${top.ref.display}.` : ""}`);
    if (scroll) el.scrollIntoView({ behavior: "auto", block: "start" }); 
  }

  function computeDistances(coords) {
    dists = refs.map((r) => {
      let d = 0;
      for (let k = 0; k < 25; k++) d += (coords[k] - r.coords[k]) ** 2;
      return { ref: r, dist: Math.sqrt(d) };
    }).sort((a, b) => a.dist - b.dist);
  }

  function setPeriod(p) {
    period = p;
    document.querySelectorAll("#periodFilters .filter-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.period === p)));
  }

  function distInk(r, g, b, a) {
    const ink = X.isDark()
      ? [r, g, b].map((v) => Math.round(v + (255 - v) * 0.35))
      : [r, g, b].map((v) => Math.round(v * 0.5));
    return { text: `rgb(${ink.join(",")})`, bg: `rgba(${r},${g},${b},${a})` };
  }
  function distColor(dist) {
    const t = Math.min(dist / 0.08, 1);
    if (t < 0.01) return distInk(74, 222, 128, 0.12);
    if (t >= 1) return distInk(239, 68, 68, 0.10);
    let r, g, b;
    if (t < 0.5) { const s = t * 2; r = Math.round(74 + s * 179); g = Math.round(222 - s * 77); b = Math.round(128 - s * 80); }
    else { const s = (t - 0.5) * 2; r = Math.round(253 - s * 14); g = Math.round(145 - s * 77); b = Math.round(48 - s * 16); }
    return distInk(r, g, b, 0.10);
  }

  const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  function renderTable(fromSearch) {
    let list = period === "all" ? dists : dists.filter((d) => (period === "modern" ? isModern(d.ref) : isAncient(d.ref)));
    const q = fold($("searchInput").value.trim());
    if (q) list = list.filter((d) => fold(d.ref.display + " " + d.ref.country).includes(q));
    const wrap = $("distTableWrap");
    const nModern = dists.filter((d) => isModern(d.ref)).length, nAncient = dists.length - nModern;
    $("distSub").textContent = `${nModern} modern and ${nAncient} ancient populations`;
    if (fromSearch) announce(list.length ? `${list.length} population${list.length > 1 ? "s" : ""} found.` : "No populations found.");
    if (!list.length) { wrap.innerHTML = '<p class="empty-note">No populations found.</p>'; return; }
    let h = '<div class="dist-table-wrap"><table><thead><tr><th style="width:2.5rem">#</th><th>Population</th><th>Country</th><th>Period</th><th>Distance</th><th style="width:2.5rem"><span class="visually-hidden">Copy</span></th></tr></thead><tbody>';
    list.forEach((d, i) => {
      const r = d.ref, dc = distColor(d.dist);
      const showDate = r.date && r.period !== "Modern" && r.date !== "Various";
      const per = r.period ? esc(r.period) + (showDate ? `<span class="period-date">${esc(r.date)}</span>` : "") : "Added";
      h += `<tr><td><span class="rank-num">${i + 1}</span></td>` +
        `<td><span class="sample-name">${esc(r.display)}</span></td><td>${esc(r.country)}</td><td>${per}</td>` +
        `<td><span class="dist-val" style="color:${dc.text};background:${dc.bg}">${d.dist.toFixed(4)}</span></td>` +
        `<td><button type="button" class="act-btn" data-copy="${esc(r.name)}" title="Copy the coordinates of ${esc(r.display)}" aria-label="Copy the coordinates of ${esc(r.display)}">${COPY_ICON}</button></td></tr>`;
    });
    wrap.innerHTML = h + "</tbody></table></div>";
  }

  function copyText(text, btn, done, said) {
    const finish = (ok) => {
      announce(ok ? said : "Copying is blocked here. Select the text and press Ctrl+C.");
      if (!btn || !ok) return;
      clearTimeout(btn._copyTimer);
      if (done) {
        if (!btn.dataset.label) btn.dataset.label = btn.textContent;
        btn.textContent = done;
        btn._copyTimer = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1500);
      } else {
        btn.classList.add("is-done");
        btn._copyTimer = setTimeout(() => btn.classList.remove("is-done"), 900);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => finish(true), () => finish(fallbackCopy(text)));
    else finish(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function resultsText() {
    const m = model();
    const ghost = current.ghost;
    const res = ghost ? ghost.result : current.result;
    const groups = ghost ? ghost.groups : sources.groups;
    const lines = [];
    lines.push(`Target: ${ghost ? "PreSlavic_" : ""}${current.label}`);
    lines.push(`Model: ${m.name}${ghost ? " without its Slavic part" : ""} (${m.file}${editedText[m.id] != null ? ", edited" : ""})`);
    lines.push(`Distance: ${(res.distance * 100).toFixed(4)}% / ${res.distance.toFixed(8)}`, "");
    groups.slice().sort((a, b) => res.shares[b] - res.shares[a]).forEach((g) => { if (res.shares[g] >= 0.0005) lines.push(`${(res.shares[g] * 100).toFixed(1)} ${g}`); });
    if (ghost) lines.push("", "Slavic share taken out: " + (ghost.slavic * 100).toFixed(1) + "%", ghostLine());
    const top = (f) => dists.filter((d) => f(d.ref)).slice(0, 25).map((d) => `${d.dist.toFixed(8)}  ${d.ref.name}`);
    lines.push("", "Closest modern populations", ...top(isModern));
    lines.push("", "Closest ancient populations", ...top(isAncient));
    lines.push("", "Made with the G25 Balkan Ancestry Calculator, xorpde.github.io");
    return lines.join("\n");
  }

  const lineList = (nums) => `line${nums.length > 1 ? "s" : ""} ${nums.slice(0, 5).join(", ")}${nums.length > 5 ? " and more" : ""}`;
  function renderModelButtons() {
    const box = $("modelButtons");
    box.replaceChildren();
    MODELS.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "mode-btn"; b.dataset.model = m.id;
      b.textContent = m.name;
      b.setAttribute("aria-pressed", String(m.id === modelId));
      b.addEventListener("click", () => selectModel(m.id));
      box.append(b);
    });
  }
  function modelHint() {
    const m = model();
    const names = sources.groups.map(groupName);
    const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join("");
    $("modelHint").textContent = `${list}, from ${sources.samples.length} ancient samples (${m.file}${editedText[m.id] != null ? ", edited" : ""}).`;
  }
  function selectModel(id) {
    if (id === modelId) return;
    modelId = id;
    document.querySelectorAll("#modelButtons .mode-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.model === id)));
    sources = parseSources(editedText[id] != null ? editedText[id] : model().defaultText);
    if (!$("sourcesPanel").hidden) $("sourcesText").value = editedText[id] != null ? editedText[id] : model().defaultText;
    $("sourcesError").textContent = "";
    $("sourcesError").hidden = true;
    modelHint();
    if (current) calculate(false);
  }
  function toggleEditor(panel, btn, fill) {
    const open = panel.hidden;
    if (open) fill();
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) panel.scrollIntoView({ behavior: "auto", block: "nearest" });
  }
  function applySources(text) {
    const parsed = parseSources(text);
    const err = $("sourcesError");
    if (!parsed.samples.length) { err.textContent = "No valid source lines found."; err.hidden = false; return; }
    err.textContent = parsed.bad.length ? `Skipped ${lineList(parsed.bad)}: each line needs a name and 25 numbers.` : "";
    err.hidden = !parsed.bad.length;
    const m = model();
    editedText[m.id] = text.trim() === m.defaultText.trim() ? null : text;
    sources = parsed;
    modelHint();
    if (current) calculate(false);
  }
  function applySamples() {
    const known = new Map(DEFAULT_REFS.map((r) => [r.name, r]));
    const next = [], bad = [];
    $("samplesText").value.split(/\r?\n/).forEach((line, i) => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(",").map((s) => s.trim());
      const v = parts.slice(1).map((s) => (s === "" ? NaN : Number(s)));
      if (!parts[0] || v.length !== 25 || v.some((x) => !Number.isFinite(x))) { bad.push(i + 1); return; }
      const k = known.get(parts[0]);
      next.push(k ? { ...k, coords: v } : { name: parts[0], display: parts[0].replace(/_/g, " "), country: "", period: "", date: "", year: null, coords: v });
    });
    const err = $("samplesError");
    if (!next.length) { err.textContent = "No valid lines found."; err.hidden = false; return; }
    err.textContent = bad.length ? `Skipped ${lineList(bad)}: each line needs a name and 25 numbers.` : "";
    err.hidden = !bad.length;
    refs = next;
    if (current && $("results").classList.contains("visible")) { computeDistances(current.ghost ? current.ghost.coords : current.target); renderTable(); }
  }

  const MODE_HINTS = {
    normal: "Your ancestry as a mix of ancient sources, and the populations closest to you.",
    ghost: "Your profile without its Slavic part, compared to ancient populations.",
  };
  function setMode(m) {
    mode = m;
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    $("modeHint").textContent = MODE_HINTS[m];
    setInputError("");
    if (current) calculate(false);
  }

  const EXAMPLES = ["Albanian", "Greek", "Macedonian", "Bulgarian", "Serb", "Romanian", "Croat"];
  function renderExamples() {
    const box = $("sampleButtons");
    EXAMPLES.forEach((name) => {
      const r = DEFAULT_REFS.find((x) => x.name === name);
      if (!r) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = r.display;
      b.addEventListener("click", () => { $("coordInput").value = r.name + "," + r.coords.join(","); calculate(true); });
      box.append(b);
    });
    $("samples").hidden = !box.children.length;
  }

  function init() {
    renderModelButtons();
    modelHint();
    setMode("normal");
    renderExamples();

    document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); }));
    $("calcBtn").addEventListener("click", () => calculate(true));
    $("coordInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); calculate(true); } });
    $("coordInput").addEventListener("input", () => setInputError(""));

    $("editSourcesBtn").addEventListener("click", () => toggleEditor($("sourcesPanel"), $("editSourcesBtn"), () => {
      const m = model();
      $("sourcesText").value = editedText[m.id] != null ? editedText[m.id] : m.defaultText;
      $("sourcesError").hidden = true;
    }));
    $("applySourcesBtn").addEventListener("click", () => applySources($("sourcesText").value));
    $("resetSourcesBtn").addEventListener("click", () => { $("sourcesText").value = model().defaultText; applySources(model().defaultText); });

    $("editSamplesBtn").addEventListener("click", () => toggleEditor($("samplesPanel"), $("editSamplesBtn"), () => {
      $("samplesText").value = refText(refs);
      $("samplesError").hidden = true;
    }));
    $("applySamplesBtn").addEventListener("click", applySamples);
    $("resetSamplesBtn").addEventListener("click", () => { $("samplesText").value = refText(DEFAULT_REFS); applySamples(); });

    $("periodFilters").addEventListener("click", (e) => { const b = e.target.closest(".filter-btn"); if (b) { setPeriod(b.dataset.period); renderTable(true); } });
    $("searchInput").addEventListener("input", () => renderTable(true));
    $("distTableWrap").addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy]");
      if (!b) return;
      const r = refs.find((x) => x.name === b.dataset.copy);
      if (r) copyText(r.name + "," + r.coords.join(","), b, null, `Copied the coordinates of ${r.display}.`);
    });
    $("copyResultsBtn").addEventListener("click", (e) => { if (current) copyText(resultsText(), e.currentTarget, "Copied", "Results copied."); });
    $("copyGhostBtn").addEventListener("click", (e) => { if (current && current.ghost) copyText(ghostLine(), e.currentTarget, "Copied", "Pre-Slavic coordinates copied."); });
    document.addEventListener("xorpde:theme", () => { if (current && $("results").classList.contains("visible")) renderTable(); });
    new ResizeObserver(fitBarLabels).observe($("admixBar"));
  }
  init();
})();
