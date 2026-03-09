// Main application — init, routing, polling

import { api } from './api.js';
import { store } from './state.js';
import { checkSession, initLoginPage, logout } from './auth.js';
import { renderOverview, initOverview } from './views/overview.js';
import { renderOperations, initOperations } from './views/operations.js';
import { renderFeed, initFeed } from './views/feed.js';
import { renderRoster, initRoster } from './views/roster.js';
import { renderSettings, initSettings } from './views/settings.js';

const POLL_INTERVAL = 5000;
let pollTimer = null;
let ws = null;

// --- Initialization ---
async function init() {
  // Check existing session
  const user = await checkSession();

  if (user) {
    showDashboard(user);
  } else {
    showLogin();
  }

  // Event listeners
  window.addEventListener('auth:success', async () => {
    const user = store.get('user');
    if (user) showDashboard(user);
  });

  window.addEventListener('auth:expired', () => {
    showLogin();
  });

  window.addEventListener('navigate', (e) => {
    switchView(e.detail.view);
  });

  // Init login page handlers
  initLoginPage();
}

// --- Show Login ---
function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  stopPolling();
  closeWebSocket();
}

// --- Show Dashboard ---
function showDashboard(user) {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';

  // Set user profile in topbar
  updateUserProfile(user);

  // Show settings nav for owner/admin
  const settingsNav = document.getElementById('nav-settings');
  if (['owner', 'admin'].includes(user.role)) {
    settingsNav.style.display = 'flex';
  }

  // Init views
  initOverview();
  initOperations();
  initFeed();
  initRoster();
  initSettings();

  // Setup navigation
  setupNavigation();

  // Setup logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    showLogin();
  });

  // Initial data fetch
  fetchAllData();

  // Start polling
  startPolling();

  // Connect WebSocket
  connectWebSocket();
}

function updateUserProfile(user) {
  const avatar = document.getElementById('user-avatar');
  const name = document.getElementById('user-name');

  if (user.profile?.picture) {
    avatar.src = user.profile.picture;
    avatar.alt = user.profile.name || '';
  } else {
    // Generate initials avatar
    avatar.style.display = 'none';
    const initials = (user.profile?.name || user.npub?.slice(5, 7) || '??').slice(0, 2).toUpperCase();
    const placeholder = document.createElement('div');
    placeholder.className = 'user-avatar';
    placeholder.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:var(--accent-glow);color:var(--accent-bright);';
    placeholder.textContent = initials;
    avatar.parentNode.insertBefore(placeholder, avatar);
  }

  name.textContent = user.profile?.display_name || user.profile?.name || user.npub?.slice(0, 16) + '...';
}

// --- Navigation ---
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewId) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  // Update view visibility
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewId}`);
  });

  store.set('currentView', viewId);

  // Render the view
  const container = document.getElementById(`view-${viewId}`);
  switch (viewId) {
    case 'overview': renderOverview(container); break;
    case 'operations': renderOperations(container); break;
    case 'feed': renderFeed(container); break;
    case 'roster': renderRoster(container); break;
    case 'settings': renderSettings(container); break;
  }
}

// --- Data Fetching ---
async function fetchAllData() {
  try {
    const [overview, activity, agents, epics] = await Promise.all([
      api.get('/api/overview'),
      api.get('/api/activity'),
      api.get('/api/agents'),
      api.get('/api/epics')
    ]);

    store.update({
      overview,
      activity,
      agents,
      epics,
      connected: true,
      lastUpdate: new Date()
    });

    updateSidebarStats(overview);
    updateConnectionStatus(true);

    // Fetch team data if owner/admin
    const user = store.get('user');
    if (user && ['owner', 'admin'].includes(user.role)) {
      try {
        const team = await api.get('/api/team');
        store.set('team', team);
      } catch {}
    }

    // Render current view
    const currentView = store.get('currentView');
    switchView(currentView);

  } catch (e) {
    console.error('Fetch error:', e);
    updateConnectionStatus(false);
  }
}

function updateSidebarStats(overview) {
  if (!overview) return;
  document.getElementById('stat-total').textContent = overview.totalIssues || 0;
  document.getElementById('stat-open').textContent = overview.openIssues || 0;
  document.getElementById('stat-closed').textContent = overview.closedIssues || 0;
}

function updateConnectionStatus(connected) {
  const el = document.getElementById('connection-status');
  const text = document.getElementById('status-text');
  const lastUpdate = document.getElementById('last-update');

  el.className = `connection-status ${connected ? 'connected' : 'error'}`;
  text.textContent = connected ? 'Live' : 'Error';

  if (connected) {
    const now = new Date();
    lastUpdate.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

// --- Polling ---
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const [overview, activity] = await Promise.all([
        api.get('/api/overview'),
        api.get('/api/activity')
      ]);

      store.update({ overview, activity, connected: true, lastUpdate: new Date() });
      updateSidebarStats(overview);
      updateConnectionStatus(true);
    } catch (e) {
      if (e.message !== 'Session expired') {
        updateConnectionStatus(false);
      }
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// --- WebSocket ---
function connectWebSocket() {
  closeWebSocket();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'activity' && msg.data) {
        store.set('activity', msg.data);
      }
    } catch {}
  };

  ws.onclose = () => {
    // Reconnect after 5 seconds
    setTimeout(() => {
      if (store.get('user')) connectWebSocket();
    }, 5000);
  };

  ws.onerror = () => ws.close();
}

function closeWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// --- Boot ---
init();
