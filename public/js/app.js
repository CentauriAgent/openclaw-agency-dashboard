// Main application — init, routing, polling, search, keyboard shortcuts

import { api } from './api.js';
import { store } from './state.js';
import { checkSession, initLoginPage, logout } from './auth.js';
import { renderOverview, initOverview } from './views/overview.js';
import { renderOperations, initOperations } from './views/operations.js';
import { renderGraph, initGraph } from './views/graph.js';
import { renderFeed, initFeed } from './views/feed.js';
import { renderRoster, initRoster } from './views/roster.js';
import { renderWorkflow, initWorkflow } from './views/workflow.js';
import { renderSettings, initSettings } from './views/settings.js';

const POLL_INTERVAL = 5000;
let pollTimer = null;
let ws = null;
let searchDebounce = null;

const VIEW_MAP = {
  overview: { render: renderOverview, init: initOverview },
  operations: { render: renderOperations, init: initOperations },
  graph: { render: renderGraph, init: initGraph },
  feed: { render: renderFeed, init: initFeed },
  roster: { render: renderRoster, init: initRoster },
  workflow: { render: renderWorkflow, init: initWorkflow },
  settings: { render: renderSettings, init: initSettings }
};

const VIEW_KEYS = ['overview', 'operations', 'graph', 'feed', 'roster', 'workflow', 'settings'];

// --- Initialization ---
async function init() {
  const user = await checkSession();

  if (user) {
    showDashboard(user);
  } else {
    showLogin();
  }

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

  updateUserProfile(user);

  // Show settings nav for owner/admin
  const settingsNav = document.getElementById('nav-settings');
  if (['owner', 'admin'].includes(user.role)) {
    settingsNav.style.display = 'flex';
  }

  // Init all views
  for (const view of Object.values(VIEW_MAP)) {
    view.init();
  }

  setupNavigation();
  setupSearch();
  setupKeyboardShortcuts();
  setupHamburgerMenu();

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    showLogin();
  });

  // Initial data fetch
  fetchAllData();
  startPolling();
  connectWebSocket();
}

function updateUserProfile(user) {
  const avatar = document.getElementById('user-avatar');
  const name = document.getElementById('user-name');

  if (user.profile?.picture) {
    avatar.src = user.profile.picture;
    avatar.alt = user.profile.name || '';
    avatar.style.display = '';
  } else {
    avatar.style.display = 'none';
    const initials = (user.profile?.name || user.npub?.slice(5, 7) || '??').slice(0, 2).toUpperCase();
    // Check if placeholder already exists
    const existing = avatar.parentNode.querySelector('.user-avatar-placeholder');
    if (!existing) {
      const placeholder = document.createElement('div');
      placeholder.className = 'user-avatar user-avatar-placeholder';
      placeholder.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:var(--accent-glow);color:var(--accent-bright);width:32px;height:32px;border-radius:50%;border:2px solid var(--accent-dim);';
      placeholder.textContent = initials;
      avatar.parentNode.insertBefore(placeholder, avatar);
    }
  }

  name.textContent = user.profile?.display_name || user.profile?.name || user.npub?.slice(0, 16) + '...';
}

// --- Navigation ---
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      // Close mobile sidebar
      document.getElementById('sidebar')?.classList.remove('sidebar--open');
      document.getElementById('sidebar-overlay')?.classList.remove('active');
    });
  });
}

function switchView(viewId) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewId}`);
  });

  store.set('currentView', viewId);

  const container = document.getElementById(`view-${viewId}`);
  const viewConfig = VIEW_MAP[viewId];
  if (viewConfig && container) {
    viewConfig.render(container);
  }
}

// --- Data Fetching ---
async function fetchAllData() {
  try {
    const [overview, activity, agents, epics, sessionData] = await Promise.all([
      api.get('/api/overview'),
      api.get('/api/activity'),
      api.get('/api/agents'),
      api.get('/api/epics'),
      api.get('/api/sessions').catch(() => ({ active: [], recent: [], summary: {} }))
    ]);

    store.update({
      overview,
      activity,
      agents,
      epics,
      sessions: sessionData,
      connected: true,
      lastUpdate: new Date()
    });

    updateSidebarStats(overview, sessionData);
    updateConnectionStatus(overview.dataSource || { beads: true, sessions: true });

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
    updateConnectionStatus({ beads: false, sessions: false });
  }
}

function updateSidebarStats(overview, sessionData) {
  if (!overview) return;
  document.getElementById('stat-total').textContent = overview.totalIssues || 0;
  document.getElementById('stat-open').textContent = overview.openIssues || 0;
  document.getElementById('stat-closed').textContent = overview.closedIssues || 0;

  // Show active sessions count
  const activeSessions = sessionData?.active?.length || sessionData?.summary?.totalActive || 0;
  const sessionsRow = document.getElementById('stat-sessions-row');
  const sessionsVal = document.getElementById('stat-sessions');
  if (activeSessions > 0) {
    sessionsRow.style.display = 'flex';
    sessionsVal.textContent = activeSessions;
  } else {
    sessionsRow.style.display = 'none';
  }
}

function updateConnectionStatus(dataSource) {
  const el = document.getElementById('connection-status');
  const text = document.getElementById('status-text');
  const lastUpdate = document.getElementById('last-update');

  if (dataSource.beads && dataSource.sessions) {
    el.className = 'connection-status connected';
    text.textContent = 'Live';
  } else if (dataSource.beads || dataSource.sessions) {
    el.className = 'connection-status partial';
    text.textContent = 'Partial';
  } else {
    el.className = 'connection-status error';
    text.textContent = 'Disconnected';
  }

  const now = new Date();
  lastUpdate.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// --- Polling ---
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const [overview, activity, sessionData] = await Promise.all([
        api.get('/api/overview'),
        api.get('/api/activity'),
        api.get('/api/sessions').catch(() => null)
      ]);

      const updates = { overview, activity, connected: true, lastUpdate: new Date() };
      if (sessionData) updates.sessions = sessionData;

      store.update(updates);
      updateSidebarStats(overview, sessionData);
      updateConnectionStatus(overview.dataSource || { beads: true, sessions: !!sessionData });
    } catch (e) {
      if (e.message !== 'Session expired') {
        updateConnectionStatus({ beads: false, sessions: false });
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
      } else if (msg.type === 'sessions' && msg.data) {
        const current = store.get('sessions') || {};
        store.set('sessions', { ...current, active: msg.data.active || [] });
      } else if (msg.type === 'overview' && msg.data) {
        store.set('overview', msg.data);
      } else if (msg.type === 'epics' && msg.data) {
        store.set('epics', msg.data);
      } else if (msg.type === 'memory' && msg.data) {
        // Merge memory updates into activity
        const activity = store.get('activity') || [];
        store.set('activity', [...msg.data, ...activity]);
      }
    } catch {}
  };

  ws.onclose = () => {
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

// --- Search ---
function setupSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  if (!input || !results) return;

  input.addEventListener('input', () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    const q = input.value.trim();
    if (q.length < 2) {
      results.style.display = 'none';
      return;
    }
    searchDebounce = setTimeout(async () => {
      try {
        const data = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
        renderSearchResults(results, data.results || []);
      } catch {}
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      results.style.display = 'none';
      input.blur();
    }
  });

  // Close search when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-bar')) {
      results.style.display = 'none';
    }
  });
}

function renderSearchResults(container, items) {
  if (items.length === 0) {
    container.innerHTML = '<div class="search-no-results">No results found</div>';
    container.style.display = 'block';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="search-result-item" data-type="${item.type}" data-id="${item.id}">
      <span class="search-result-type">${item.type}</span>
      <span class="search-result-title">${item.title}</span>
      <span class="search-result-subtitle">${item.subtitle || ''}</span>
    </div>
  `).join('');

  container.style.display = 'block';

  // Click handlers
  container.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const type = el.dataset.type;
      if (type === 'agent') switchView('roster');
      else if (type === 'issue') switchView('operations');
      else if (type === 'activity') switchView('feed');
      container.style.display = 'none';
      document.getElementById('search-input').value = '';
    });
  });
}

// --- Keyboard Shortcuts ---
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger when typing in inputs
    const active = document.activeElement;
    const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

    // Escape always works
    if (e.key === 'Escape') {
      document.getElementById('shortcuts-modal').style.display = 'none';
      document.getElementById('search-results').style.display = 'none';
      const searchInput = document.getElementById('search-input');
      if (searchInput === document.activeElement) {
        searchInput.value = '';
        searchInput.blur();
      }
      return;
    }

    if (isInput) return;

    // Don't trigger on login page
    if (document.getElementById('login-page').style.display !== 'none') return;

    switch (e.key) {
      case '1': switchView(VIEW_KEYS[0]); break;
      case '2': switchView(VIEW_KEYS[1]); break;
      case '3': switchView(VIEW_KEYS[2]); break;
      case '4': switchView(VIEW_KEYS[3]); break;
      case '5': switchView(VIEW_KEYS[4]); break;
      case '6': switchView(VIEW_KEYS[5]); break;
      case '7': switchView(VIEW_KEYS[6]); break;
      case '/':
        e.preventDefault();
        document.getElementById('search-input')?.focus();
        break;
      case 'r':
        fetchAllData();
        break;
      case '?':
        e.preventDefault();
        const modal = document.getElementById('shortcuts-modal');
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
        break;
    }
  });

  // Close shortcuts modal
  document.getElementById('close-shortcuts')?.addEventListener('click', () => {
    document.getElementById('shortcuts-modal').style.display = 'none';
  });
  document.getElementById('shortcuts-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.style.display = 'none';
    }
  });
}

// --- Hamburger Menu (Mobile) ---
function setupHamburgerMenu() {
  const btn = document.getElementById('hamburger-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!btn || !sidebar) return;

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar--open');
    overlay?.classList.toggle('active');
  });

  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('sidebar--open');
    overlay.classList.remove('active');
  });
}

// --- Boot ---
init();
