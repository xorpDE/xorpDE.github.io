/*
 * In-browser map engine (a MODULE worker — create it with { type: "module" }; Pyodide 314 no longer
 * runs in classic workers).
 *
 * Runs the g25heatmap Python package (the same code as the command line tool, shipped as
 * py/g25heatmap.zip) with Pyodide, so every map is computed on the visitor's own device.
 *
 * Protocol
 *   page -> worker  { type: "render", id, coords, name|null, maxDistance, brand, region, view? }
 *                   view (optional): [xmin, xmax, ymin, ymax] in EPSG:3857 metres — draws exactly that window
 *                   region: world|europe|balkans|mediterranean|eastern_mediterranean|middle_east|
 *                           central_asia|south_asia|east_asia|southeast_asia|africa|north_america|
 *                           south_america (default europe)
 *                   coords: pasted text, one or more "Name,PC1,...,PC25" lines (several lines are averaged)
 *   worker -> page  { type: "status", stage, text, progress }   stage: boot|packages|engine|ready|
 *                                                                 distances|kriging|drawing|done
 *                   { type: "ready", seconds }                   engine loaded
 *                   { type: "result", id, png (ArrayBuffer), filename, title, region, view, mapBox, extent,
 *                     width, height, vmin, vmax,
 *                     nearest: [[label, distance], ...12], seconds, memoryMB }
 *                   { type: "error", id|null, message, kind }    kind: "input" (bad coordinates) | "internal"
 * A render sent while the engine is still loading is queued. Send one render at a time.
 */
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

// Pyodide 314.0.7 bundles numpy 2.4.6, scipy 1.18.0, matplotlib 3.10.8 and pillow 12.2.0 (pinned locally too).
const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const BUNDLE_URL = new URL("../py/g25heatmap.zip", self.location.href).href;
const ENGINE_DIR = "/home/pyodide/engine";

const started = performance.now();
let engine = null;
let pyodideRef = null;

function memoryMB() {
  try {
    return Math.round(pyodideRef._module.HEAP8.length / 1048576);
  } catch (err) {
    return null;
  }
}
let queue = Promise.resolve();

function status(stage, text, progress = null) {
  self.postMessage({ type: "status", stage, text, progress });
}

async function init() {
  status("boot", "Downloading the map engine (only the first time)…", 0.02);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  pyodideRef = pyodide;
  status("packages", "Loading numpy, scipy and matplotlib…", 0.08);
  await pyodide.loadPackage(["numpy", "scipy", "matplotlib", "pillow"]);
  status("engine", "Loading the reference populations and map data…", 0.24);
  const response = await fetch(BUNDLE_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`could not download ${BUNDLE_URL} (HTTP ${response.status})`);
  pyodide.unpackArchive(await response.arrayBuffer(), "zip", { extractDir: ENGINE_DIR });
  pyodide.runPython(`import sys\nif "${ENGINE_DIR}" not in sys.path: sys.path.insert(0, "${ENGINE_DIR}")`);
  engine = pyodide.pyimport("g25heatmap.webapp");
  engine.warmup();
  status("ready", "Map engine ready.", null);
  self.postMessage({ type: "ready", seconds: (performance.now() - started) / 1000 });
}

const ready = init().catch((err) => {
  self.postMessage({
    type: "error",
    id: null,
    kind: "internal",
    message: "The map engine could not be loaded: " + (err && err.message ? err.message : String(err)),
  });
  throw err;
});

function render(msg) {
  const t0 = performance.now();
  status("distances", "Reading your coordinates…", 0.3);
  const progress = (stage, text, fraction) => status(stage, text, fraction);
  let out;
  try {
    // "undefined" (not null) arrives in Python as None; Pyodide turns null into a JsNull object
    out = engine.render(String(msg.coords || ""), msg.name ? String(msg.name) : undefined,
      Number(msg.maxDistance) || 0.1, String(msg.brand || ""), String(msg.region || "europe"), progress,
      Array.isArray(msg.view) && msg.view.length === 4 ? msg.view.map(Number) : undefined);
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, kind: "internal", message: String(err && err.message || err) });
    return;
  }
  try {
    const meta = JSON.parse(out.get(1));
    const pngProxy = out.get(0);
    if (!pngProxy) {
      self.postMessage({ type: "error", id: msg.id, kind: meta.kind || "internal", message: meta.error || "Unknown error" });
      return;
    }
    const bytes = pngProxy.toJs();
    pngProxy.destroy();
    const png = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    status("done", "Done.", 1);
    self.postMessage({ type: "result", id: msg.id, png, ...meta, memoryMB: memoryMB(),
      seconds: (performance.now() - t0) / 1000 }, [png]);
  } finally {
    out.destroy();
  }
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type !== "render") return;
  queue = queue
    .then(() => ready)
    .then(() => render(msg))
    .catch(() => {
      /* load errors were already reported */
    });
};
