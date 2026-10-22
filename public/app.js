/*
 * The sail plan webapp. Kept as a separate file, written without optional chaining
 * and similar newer syntax: a proxy such as signalk-navico-embedder only transpiles
 * external scripts for the MFD's Chromium 69, never an inline <script>, and in a
 * browser that cannot parse a script it simply never runs.
 */
window.sailplanStarted = true;
(function () {
  // The webapp (public/) is served at /signalk-sailplan-ui/, but registerWithRouter's
  // API routes are mounted separately at /plugins/signalk-sailplan-ui/ — these are
  // NOT the same base path, so this must be absolute.
  const PLUGIN_BASE = '/plugins/signalk-sailplan-ui';
  // /plugins/ is admin-only; reads go through the readonly /signalk/v1/api mirror
  // (plugin.signalKApiRoutes) so the app also loads for clients with no login
  // session, such as an MFD tile via signalk-mfd-plugin. Writes stay on PLUGIN_BASE.
  const READ_BASE = '/signalk/v1/api/signalk-sailplan-ui';
  // index.html ships "Loading..." in the message area; only this script can know the plan is really empty.
  const NO_PLAN_TEXT = 'No sail plan uploaded yet. Click "Upload sail plan\u2026" to add a diagram (PNG/JPG/SVG), then "Edit hotspots" to mark each sail and reef.';
  let SAILSCONFIG_BASE = '/plugins/sailsconfiguration'; // overridden by /state once loaded
  let POLL_INTERVAL_MS = 4000; // overridden by /config once loaded

  const statusEl = document.getElementById('status');
  const problemsEl = document.getElementById('problems');
  const areaEl = document.getElementById('area-readout');
  const stage = document.getElementById('stage');
  const img = document.getElementById('sail-image');
  const overlay = document.getElementById('overlay');
  const emptyMsg = document.getElementById('empty-msg');
  const sidebar = document.getElementById('sidebar');
  const modeBtn = document.getElementById('mode-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('file-input');
  const hsSail = document.getElementById('hs-sail');
  const hsReef = document.getElementById('hs-reef');
  const hsLabel = document.getElementById('hs-label');
  const hsAdd = document.getElementById('hs-add');
  const hsClear = document.getElementById('hs-clear');
  const hsList = document.getElementById('hs-list');
  const hsCount = document.getElementById('hs-count');
  const saveBtn = document.getElementById('save-btn');

  let editMode = false;
  let hotspots = [];       // saved hotspots: {id, sailId, label, reefs, points:[[x,y],...]}
  let drawingPoints = [];  // points for the hotspot currently being traced
  let inventory = {};      // sailId -> {name, active, reducedState}
  let pollTimer = null;

  function setStatus(msg) { statusEl.textContent = msg || ''; }

  function reefsOf(sail) {
    return (sail.reducedState && sail.reducedState.reefs) || 0;
  }

  // ---------- failures: say what went wrong, and on which path ----------

  const problems = {}; // key -> { kind: 'error' | 'nodata', text }
  let loginCache = null;

  function renderProblems() {
    problemsEl.innerHTML = '';
    Object.keys(problems).forEach(key => {
      const row = document.createElement('div');
      row.className = problems[key].kind;
      row.textContent = problems[key].text;
      problemsEl.appendChild(row);
    });
    resizeStage(); // the header grows and shrinks with the messages
  }

  function setProblem(key, problem) {
    if (problem) problems[key] = problem; else delete problems[key];
    renderProblems();
  }

  // Who Signal K thinks we are. /skServer/loginStatus is one of the few
  // non-/signalk paths the MFD embedder forwards. Cached so a failing poll
  // does not ask every few seconds.
  async function getLogin() {
    if (loginCache && Date.now() - loginCache.at < 30000) return loginCache.value;
    let value = null;
    try {
      const res = await fetch('/skServer/loginStatus', { credentials: 'include' });
      if (res.ok) value = HttpProblems.parseLoginStatus(await res.json());
    } catch (e) { /* unknown is fine, the message says so */ }
    loginCache = { at: Date.now(), value };
    return value;
  }

  // Every call goes through here: returns the response when ok, otherwise
  // records why it failed under `key` and returns null. A success clears it.
  // A 404 on a read is "no data", not an error; quietNoData hides even that.
  async function request(key, method, url, opts) {
    opts = opts || {};
    const hasBody = opts.body !== undefined;
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: 'include',
        headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
        body: hasBody ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      setProblem(key, HttpProblems.describe({ method, path: url, read: opts.read, networkError: true }));
      return null;
    }
    if (res.ok) { setProblem(key, null); return res; }
    const login = res.status === 401 ? await getLogin() : null;
    const problem = HttpProblems.describe({
      method, path: url, status: res.status, login, read: opts.read, emptyHint: opts.emptyHint
    });
    setProblem(key, opts.quietNoData && problem.kind === 'nodata' ? null : problem);
    return null;
  }

  async function readJson(key, res, url) {
    try {
      return await res.json();
    } catch (e) {
      setProblem(key, { kind: 'error', text: 'Unexpected non-JSON answer from ' + url + '.' });
      return null;
    }
  }

  const stageWrap = document.getElementById('stage-wrap');

  function resizeStage() {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const padding = 32; // #stage-wrap has 16px padding on each side
    const availW = Math.max(50, stageWrap.clientWidth - padding);
    const availH = Math.max(50, stageWrap.clientHeight - padding);
    const ratio = img.naturalWidth / img.naturalHeight;
    let w = availW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    stage.style.width = img.style.width = w + 'px';
    stage.style.height = img.style.height = h + 'px';
  }
  img.addEventListener('load', resizeStage);
  window.addEventListener('resize', resizeStage);

  function svgPointFromEvent(evt) {
    const rect = stage.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 100;
    const y = ((evt.clientY - rect.top) / rect.height) * 100;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
  }

  // ---------- data loading ----------

  async function loadConfig() {
    const res = await request('state', 'GET', `${READ_BASE}/state`, { read: true });
    if (!res) { emptyMsg.style.display = 'none'; return; } // the reason is in the header
    const cfg = await readJson('state', res, `${READ_BASE}/state`);
    if (!cfg) { emptyMsg.style.display = 'none'; return; }
    hotspots = cfg.hotspots || [];
    if (cfg.sailsConfigBase) SAILSCONFIG_BASE = cfg.sailsConfigBase;
    if (cfg.pollInterval) POLL_INTERVAL_MS = cfg.pollInterval * 1000;
    if (cfg.imageUrl) {
      img.src = `${READ_BASE}/image?ts=${Date.now()}`;
      img.style.display = 'block';
      emptyMsg.style.display = 'none';
    } else {
      img.style.display = 'none';
      emptyMsg.textContent = NO_PLAN_TEXT;
      emptyMsg.style.display = 'block';
    }
    renderHotspotList();
    render();
  }

  async function loadInventory() {
    const url = '/signalk/v1/api/vessels/self/sails/inventory';
    const res = await request('inventory', 'GET', url, {
      read: true, emptyHint: 'Is sailsconfiguration enabled, with sails configured?'
    });
    const data = res && await readJson('inventory', res, url);
    inventory = {};
    if (!data) return;
    Object.entries(data).forEach(([id, entry]) => {
      const v = entry && entry.value ? entry.value : entry;
      inventory[id] = v;
    });
    if (!Object.keys(inventory).length) {
      setProblem('inventory', { kind: 'nodata', text: 'No sails are configured in sailsconfiguration.' });
    }
    populateSailSelect();
  }

  async function loadArea() {
    const url = '/signalk/v1/api/vessels/self/sails/area';
    // no area is already explained by the inventory message
    const res = await request('area', 'GET', url, { read: true, quietNoData: true });
    const data = res && await readJson('area', res, url);
    const active = data && data.active && data.active.value;
    const total = data && data.total && data.total.value;
    if (typeof active !== 'number' || typeof total !== 'number') { areaEl.textContent = ''; return; }
    areaEl.innerHTML = `<strong>${active.toFixed(1)}</strong> / ${total.toFixed(1)} m&sup2; set`;
  }

  // An <img> only says "failed"; ask again to learn the status and path.
  img.addEventListener('error', async () => {
    const url = `${READ_BASE}/image`;
    const res = await request('image', 'GET', url, { read: true });
    if (res) setProblem('image', { kind: 'error', text: 'Could not display the image from ' + url + '. Is it a valid PNG, JPG or SVG?' });
  });
  img.addEventListener('load', () => setProblem('image', null));

  function populateSailSelect() {
    const current = hsSail.value;
    hsSail.innerHTML = '';
    Object.entries(inventory).forEach(([id, sail]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = sail.name || id;
      hsSail.appendChild(opt);
    });
    if (current) hsSail.value = current;
  }

  // ---------- rendering ----------

  function polygonPointsAttr(points) {
    return points.map(p => p.join(',')).join(' ');
  }

  function centroid(points) {
    const n = points.length;
    const x = points.reduce((s, p) => s + p[0], 0) / n;
    const y = points.reduce((s, p) => s + p[1], 0) / n;
    return [x, y];
  }

  function render() {
    overlay.innerHTML = '';

    hotspots.forEach(h => {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', polygonPointsAttr(h.points));
      poly.dataset.id = h.id;

      const sail = inventory[h.sailId];
      const reefs = h.reefs || 0;
      if (sail && sail.active && reefsOf(sail) === reefs) {
        poly.classList.add(reefs > 0 ? 'reefed' : 'active');
      }
      if (!editMode) {
        poly.addEventListener('click', () => onHotspotClick(h));
      }
      overlay.appendChild(poly);

      if (editMode) {
        const [cx, cy] = centroid(h.points);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', cy);
        text.setAttribute('class', 'hlabel');
        text.textContent = h.label || h.sailId;
        overlay.appendChild(text);
      }
    });

    if (editMode && drawingPoints.length) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', polygonPointsAttr(drawingPoints));
      line.setAttribute('class', 'drawing');
      overlay.appendChild(line);
      drawingPoints.forEach(p => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p[0]);
        c.setAttribute('cy', p[1]);
        c.setAttribute('r', 0.8);
        c.setAttribute('class', 'point');
        overlay.appendChild(c);
      });
    }
  }

  function renderHotspotList() {
    hsCount.textContent = hotspots.length;
    hsList.innerHTML = '';
    hotspots.forEach(h => {
      const row = document.createElement('div');
      row.className = 'hotspot-row';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = h.label || `${h.sailId} (reef ${h.reefs || 0})`;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Delete';
      del.addEventListener('click', () => {
        hotspots = hotspots.filter(x => x.id !== h.id);
        renderHotspotList();
        render();
      });
      row.appendChild(name);
      row.appendChild(del);
      hsList.appendChild(row);
    });
  }

  // ---------- interaction: view mode (set sail state) ----------

  async function onHotspotClick(h) {
    const sail = inventory[h.sailId];
    if (!sail) { setStatus(`Unknown sail "${h.sailId}" — check hotspot config.`); return; }
    const reefs = h.reefs || 0;
    const isCurrent = sail.active && reefsOf(sail) === reefs;
    setStatus(isCurrent ? `Stowing ${sail.name || h.sailId}…` : `Setting ${sail.name || h.sailId}…`);
    let ok;
    if (isCurrent) {
      ok = await request('write', 'PUT', `${SAILSCONFIG_BASE}/sails/${h.sailId}/active`, { body: { value: false } });
    } else {
      ok = await request('write', 'PUT', `${SAILSCONFIG_BASE}/sails/${h.sailId}/reducedState`,
        { body: { reefs, furledRatio: h.furledRatio || 0 } }) &&
        await request('write', 'PUT', `${SAILSCONFIG_BASE}/sails/${h.sailId}/active`, { body: { value: true } });
    }
    setStatus('');
    if (ok) {
      await loadInventory();
      render();
    }
  }

  // ---------- interaction: edit mode (draw hotspots) ----------

  stage.addEventListener('click', evt => {
    if (!editMode || img.style.display === 'none') return;
    if (evt.target.closest('#overlay') === null) return;
    drawingPoints.push(svgPointFromEvent(evt));
    render();
  });

  hsClear.addEventListener('click', () => { drawingPoints = []; render(); });

  hsAdd.addEventListener('click', () => {
    if (drawingPoints.length < 3) { setStatus('Trace at least 3 points before adding.'); return; }
    if (!hsSail.value) { setStatus('Load the sail inventory (sailsconfiguration) first.'); return; }
    hotspots.push({
      id: 'h' + Date.now().toString(36),
      sailId: hsSail.value,
      reefs: Number(hsReef.value) || 0,
      label: hsLabel.value || `${hsSail.options[hsSail.selectedIndex].textContent}${Number(hsReef.value) ? ' - reef ' + hsReef.value : ''}`,
      points: drawingPoints
    });
    drawingPoints = [];
    hsLabel.value = '';
    renderHotspotList();
    render();
    setStatus('');
  });

  saveBtn.addEventListener('click', async () => {
    const res = await request('save', 'PUT', `${PLUGIN_BASE}/hotspots`, { body: hotspots });
    setStatus(res ? 'Saved.' : '');
  });

  // ---------- upload ----------

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setStatus('Uploading…');
      const res = await request('save', 'PUT', `${PLUGIN_BASE}/image`, { body: { dataUrl: reader.result } });
      if (res) await loadConfig();
      setStatus('');
    };
    reader.readAsDataURL(file);
  });

  // ---------- mode toggle ----------

  modeBtn.addEventListener('click', () => {
    editMode = !editMode;
    sidebar.classList.toggle('open', editMode);
    modeBtn.textContent = editMode ? 'Done editing' : 'Edit hotspots';
    drawingPoints = [];
    resizeStage(); // sidebar open/close changes stage-wrap's available width
    render();
  });

  // ---------- polling ----------

  async function poll() {
    await Promise.all([loadInventory(), loadArea()]);
    if (!editMode) render();
  }

  (async function init() {
    await loadConfig();
    await Promise.all([loadInventory(), loadArea()]);
    render();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  })();
})();
