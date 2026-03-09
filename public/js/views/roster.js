// Agent Roster view

import { store } from '../state.js';

const DIVISION_ORDER = ['engineering', 'design', 'marketing', 'product', 'project-management', 'testing', 'operations'];

export function renderRoster(container) {
  const agents = store.get('agents');
  const filter = store.get('rosterFilter') || 'all';

  if (!agents || agents.length === 0) {
    container.innerHTML = `
      <div class="view-header"><h2 class="view-title">Agent Roster</h2></div>
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-text">Loading roster...</div>
      </div>
    `;
    return;
  }

  // Group agents by division
  const divisions = {};
  for (const agent of agents) {
    const divId = agent.division || 'unknown';
    if (!divisions[divId]) {
      divisions[divId] = {
        id: divId,
        name: agent.divisionName || divId,
        emoji: agent.divisionEmoji || '📁',
        color: agent.divisionColor || '#666',
        agents: []
      };
    }
    divisions[divId].agents.push(agent);
  }

  // Filter
  const filteredDivs = filter === 'all'
    ? DIVISION_ORDER.map(id => divisions[id]).filter(Boolean)
    : [divisions[filter]].filter(Boolean);

  container.innerHTML = `
    <div class="roster-header">
      <h2 class="view-title">Agent Roster</h2>
      <div class="roster-filters">
        <select id="roster-division-filter">
          <option value="all" ${filter === 'all' ? 'selected' : ''}>All Divisions</option>
          ${DIVISION_ORDER.map(id => {
            const div = divisions[id];
            return div ? `<option value="${id}" ${filter === id ? 'selected' : ''}>${div.emoji} ${div.name}</option>` : '';
          }).join('')}
        </select>
      </div>
    </div>
    ${filteredDivs.map(div => renderDivision(div)).join('')}
  `;

  // Filter handler
  container.querySelector('#roster-division-filter')?.addEventListener('change', (e) => {
    store.set('rosterFilter', e.target.value);
    renderRoster(container);
  });
}

function renderDivision(div) {
  return `
    <div class="roster-division">
      <div class="roster-division-header" style="border-color: ${div.color}40">
        <span>${div.emoji}</span>
        <span>${div.name}</span>
        <span style="color: var(--text-muted); font-size: 12px; font-weight: 400; margin-left: auto;">
          ${div.agents.length} agents
        </span>
      </div>
      ${div.agents.map(agent => renderAgent(agent)).join('')}
    </div>
  `;
}

function renderAgent(agent) {
  const statusClass = agent.status || 'idle';
  const lastActive = agent.lastActive ? formatRelativeTime(agent.lastActive) : '—';
  const taskCount = agent.lifetimeTasksClosed || 0;
  const currentTask = agent.currentTask
    ? `<span style="color: var(--accent-bright)">Current: ${agent.currentTask.id}</span>`
    : `<span>Last: ${lastActive}</span>`;

  return `
    <div class="roster-agent">
      <div class="roster-agent-info">
        <span class="agent-emoji">${agent.emoji}</span>
        <span class="roster-agent-name">${agent.name}</span>
        <span class="status-indicator status-indicator--${statusClass}"></span>
        <span class="badge badge--${statusClass}">${statusClass}</span>
      </div>
      <div class="roster-agent-meta">
        ${currentTask}
        <span>Tasks: <strong>${taskCount}</strong></span>
      </div>
    </div>
  `;
}

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

export function initRoster() {
  const container = document.getElementById('view-roster');
  store.on('agents', () => {
    if (store.get('currentView') === 'roster') {
      renderRoster(container);
    }
  });
}
