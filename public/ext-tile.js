// The "Sails set" widget for plotter hosts: area and sails currently set, one tap to the sail plan.
import { connectExtension } from './vendor/plotterext-bus/extension.js';

const API = '/signalk/v1/api/vessels/self/sails';
const POLL_MS = 4000;

// Same window as the toolbar button in plotterext.js.
const WINDOW = {
  panel: 'sailplan',
  title: 'Sail Plan',
  single: true,
  restoreKey: 'sailplan',
  geometry: { anchor: 'bottom-right', offset: { x: 16, y: 16 }, width: '45%', height: '75%', minWidth: 320, minHeight: 320 }
};

const tile = document.getElementById('tile');
const areaEl = document.getElementById('area');
const sailsEl = document.getElementById('sails');

// Not awaited: opened outside a host the tile still shows the sails, it just cannot open the window.
let client = null;
connectExtension().then((c) => { client = c; }).catch(() => {});

async function get(path) {
  const res = await fetch(API + path, { credentials: 'include' });
  if (!res.ok) {
    const error = new Error('HTTP ' + res.status);
    error.status = res.status;
    error.path = API + path;
    throw error;
  }
  return res.json();
}

function setArea(active, total) {
  const text = typeof active === 'number' && typeof total === 'number'
    ? '<strong>' + active.toFixed(0) + '</strong> / ' + total.toFixed(0)
    : '&ndash;';
  areaEl.innerHTML = text + '<small>m&sup2; set</small>';
}

function describeSail(sail) {
  const state = sail.reducedState || {};
  let text = sail.name || sail.id;
  if (state.reefs > 0) text += ' R' + state.reefs;
  if (state.furledRatio > 0) text += ' ' + Math.round(state.furledRatio * 100) + '% furled';
  return text;
}

function render(inventory, area) {
  const sails = Object.keys(inventory).map((id) => {
    const entry = inventory[id];
    return Object.assign({ id }, entry && entry.value ? entry.value : entry);
  });
  const set = sails.filter((sail) => sail.active);
  setArea(area && area.active && area.active.value, area && area.total && area.total.value);
  sailsEl.className = set.length ? '' : 'none';
  sailsEl.textContent = set.length ? set.map(describeSail).join(' · ') : (sails.length ? 'No sails set' : 'No sails configured');
  tile.removeAttribute('title');
}

function showProblem(error) {
  setArea(null, null);
  if (error.status === 404) {
    sailsEl.className = 'none';
    sailsEl.textContent = 'No sail data';
    return;
  }
  const problem = window.HttpProblems.describe({ method: 'GET', path: error.path || API, status: error.status, read: true });
  sailsEl.className = 'problem';
  sailsEl.textContent = error.status ? 'Not available (' + error.status + ')' : 'Offline';
  tile.title = problem.text;
}

async function refresh() {
  try {
    const [inventory, area] = await Promise.all([get('/inventory'), get('/area').catch(() => null)]);
    render(inventory, area);
  } catch (error) {
    showProblem(error);
  }
}

async function openSailPlan() {
  if (!client) return;
  try {
    if (client.hasCapability('windows')) await client.call('ui.openWindow', WINDOW);
    else await client.call('ui.openPanel', { panel: WINDOW.panel });
  } catch (error) {
    // the host declined; there is nothing more the tile can do
  }
}

tile.addEventListener('click', openSailPlan);
tile.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') openSailPlan();
});

refresh();
setInterval(refresh, POLL_MS);
