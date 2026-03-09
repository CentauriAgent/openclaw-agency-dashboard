// Agency Overview view

import { store } from '../state.js';

const STATUS_ICONS = {
  active: '●',
  idle: '○',
  blocked: '●'
};

export function renderOverview(container) {
  const overview = store.get('overview');
  if (!overview) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">Loading overview...</div></div>';
    return;
  }

  const { divisions } = overview;

  container.innerHTML = `
    <div class="view-header">
      <h2 class="view-title">Agency Overview</h2>
    </div>
    <div class="grid-2">
      ${divisions.map(div => renderDivisionCard(div)).join('')}
    </div>
  `;

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
            <span class="agent-status">${a.status === 'active' ? 'active' : 'idle'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function initOverview() {
  const container = document.getElementById('view-overview');
  store.on('overview', () => renderOverview(container));
}
