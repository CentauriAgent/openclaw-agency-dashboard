// Agency Overview view — with session data and connection status

import { store } from '../state.js';

export function renderOverview(container) {
  const overview = store.get('overview');
  if (!overview) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">Loading overview...</div></div>';
    return;
  }

  const { divisions } = overview;
  const sessionData = overview.sessions || store.get('sessions');
  const activeSessions = sessionData?.active || [];

  let html = `
    <div class="view-header">
      <h2 class="view-title">Agency Overview</h2>
    </div>
  `;

  // Active sessions summary banner
  if (activeSessions.length > 0) {
    html += `
      <div class="card card--active" style="margin-bottom: var(--space-lg); padding: var(--space-md) var(--space-lg);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <span class="status-indicator status-indicator--active" style="animation: pulse 2s infinite;"></span>
            <strong>${activeSessions.length} agent${activeSessions.length > 1 ? 's' : ''} running</strong>
          </div>
          <div style="display: flex; gap: var(--space-md); font-size: 13px; color: var(--text-secondary);">
            ${activeSessions.slice(0, 3).map(s =>
              `<span>🤖 ${s.label || 'Agent'}</span>`
            ).join('')}
            ${activeSessions.length > 3 ? `<span>+${activeSessions.length - 3} more</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  html += `<div class="grid-2">${divisions.map(div => renderDivisionCard(div)).join('')}</div>`;

  container.innerHTML = html;

  // Click handlers for division cards
  container.querySelectorAll('.division-card').forEach(card => {
    card.addEventListener('click', () => {
      const divId = card.dataset.division;
      store.set('currentView', 'roster');
      store.set('rosterFilter', divId);
      window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'roster', filter: divId } }));
    });
  });
}

function renderDivisionCard(div) {
  const totalTasks = div.openTasks + div.closedTasks;
  const progressPct = totalTasks > 0 ? Math.round((div.closedTasks / totalTasks) * 100) : 0;
  const isActive = div.activeAgents > 0;

  return `
    <div class="card division-card card--clickable ${isActive ? 'card--active' : ''}" data-division="${div.id}">
      <div class="card-header">
        <span class="card-title">
          <span>${div.emoji}</span>
          <span>${div.name}</span>
        </span>
        <span class="badge badge--${isActive ? 'active' : 'idle'}">${isActive ? 'Active' : 'Idle'}</span>
      </div>
      <div class="division-stats">
        <span><strong>${div.agentCount}</strong> agents</span>
        <span>•</span>
        <span><strong>${div.activeAgents}</strong> active</span>
        <span>•</span>
        <span><strong>${div.openTasks}</strong> open tasks</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${progressPct === 100 ? 'progress-fill--complete' : ''}" style="width: ${progressPct}%"></div>
      </div>
      <div class="division-agents">
        ${(div.agents || []).map(a => `
          <div class="agent-row">
            <span class="agent-emoji">${a.emoji}</span>
            <span class="agent-name">${a.name}</span>
            <span class="status-indicator status-indicator--${a.status || 'idle'}"></span>
            <span class="agent-status">${a.status === 'active' ? 'active' : a.status === 'blocked' ? 'blocked' : 'idle'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function initOverview() {
  const container = document.getElementById('view-overview');
  store.on('overview', () => {
    if (store.get('currentView') === 'overview') renderOverview(container);
  });
  store.on('sessions', () => {
    if (store.get('currentView') === 'overview') renderOverview(container);
  });
}
