// Active Operations view — epics + live sessions

import { store } from '../state.js';

const STATUS_ICONS = {
  closed: '✓',
  in_progress: '◐',
  open: '○',
  blocked: '●',
  deferred: '❄'
};

export function renderOperations(container) {
  const epics = store.get('epics');
  const sessionData = store.get('sessions');

  let html = '<div class="view-header"><h2 class="view-title">Active Operations</h2></div>';

  // Live Sessions Section
  const activeSessions = sessionData?.active || [];
  const recentSessions = sessionData?.recent || [];

  if (activeSessions.length > 0 || recentSessions.length > 0) {
    html += '<div class="sessions-panel">';
    html += '<h3 style="font-size: 15px; font-weight: 600; margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">';
    html += `<span class="status-indicator status-indicator--active" style="animation: pulse 2s infinite;"></span> Live Agent Sessions`;
    if (activeSessions.length > 0) {
      html += ` <span class="badge badge--active">${activeSessions.length} active</span>`;
    }
    html += '</h3>';

    // Active sessions
    for (const session of activeSessions) {
      html += renderSessionCard(session, true);
    }

    // Recent sessions (collapsible)
    if (recentSessions.length > 0) {
      html += `<details style="margin-top: var(--space-sm);">
        <summary style="cursor: pointer; font-size: 13px; color: var(--text-secondary); padding: var(--space-xs) 0;">
          ${recentSessions.length} recent sessions
        </summary>
        <div style="margin-top: var(--space-sm);">
          ${recentSessions.map(s => renderSessionCard(s, false)).join('')}
        </div>
      </details>`;
    }

    html += '</div>';
  }

  // Epics Section
  if (!epics || epics.length === 0) {
    if (activeSessions.length === 0 && recentSessions.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">⚡</div>
          <div class="empty-state-text">No active operations</div>
          <div class="empty-state-sub">Spawn agents to see them here — operations appear when epics are created or sessions are running</div>
        </div>
      `;
    }
    container.innerHTML = html;
    return;
  }

  // Sort: in_progress first, then open, then closed
  const sorted = [...epics].sort((a, b) => {
    const order = { in_progress: 0, open: 1, blocked: 2, deferred: 3, closed: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  html += sorted.map(epic => renderEpic(epic)).join('');
  container.innerHTML = html;

  // Toggle task list visibility
  container.querySelectorAll('.epic-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskList = btn.closest('.epic-card').querySelector('.task-list');
      if (taskList) {
        taskList.style.display = taskList.style.display === 'none' ? 'block' : 'none';
        btn.textContent = taskList.style.display === 'none' ? '▶' : '▼';
      }
    });
  });
}

function renderSessionCard(session, isActive) {
  const typeClass = `session-type-badge--${session.type || 'subagent'}`;
  const typeLabel = session.type === 'cron' ? '⏰ Cron' : session.type === 'main' ? '🏠 Main' : '🤖 Subagent';
  const ageStr = formatAge(session.ageMinutes);

  return `
    <div class="session-card ${isActive ? 'session-card--active' : ''}">
      <span class="session-type-badge ${typeClass}">${typeLabel}</span>
      <div class="session-info">
        <div class="session-label">${session.label || session.sessionId?.slice(0, 8)}</div>
        <div class="session-task">${session.taskDescription || 'No description'}</div>
      </div>
      <div class="session-meta">
        <div>${ageStr}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${session.model || ''}</div>
      </div>
    </div>
  `;
}

function formatAge(minutes) {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderEpic(epic) {
  const progressPct = epic.progress || 0;
  const statusBadge = epic.status === 'closed' ? 'closed' : epic.status === 'in_progress' ? 'progress' : 'idle';
  const statusLabel = epic.status === 'closed' ? '✅ Complete' :
                      epic.status === 'in_progress' ? '◐ In Progress' :
                      epic.status === 'blocked' ? '● Blocked' : '○ Open';

  return `
    <div class="card epic-card">
      <div class="epic-header">
        <div>
          <div class="epic-title">
            <button class="btn btn-ghost btn-sm epic-toggle">▼</button>
            Epic: ${epic.title}
            <span class="epic-id">${epic.id}</span>
          </div>
        </div>
        <span class="badge badge--${statusBadge}">${statusLabel}</span>
      </div>
      <div class="epic-meta">
        <span>${epic.completedCount || 0}/${epic.taskCount || 0} tasks</span>
        <span class="epic-progress-text">${progressPct}%</span>
        ${epic.closed_at ? `<span>Closed ${formatDate(epic.closed_at)}</span>` : ''}
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${progressPct === 100 ? 'progress-fill--complete' : ''}" style="width: ${progressPct}%"></div>
      </div>
      <div class="task-list">
        ${(epic.tasks || []).map(task => renderTask(task)).join('')}
      </div>
    </div>
  `;
}

function renderTask(task) {
  const icon = STATUS_ICONS[task.status] || '○';
  return `
    <div class="task-item">
      <span class="task-status-icon task-status-icon--${task.status}">${icon}</span>
      <span class="task-id mono">${task.id}</span>
      <span class="task-title">${task.title}</span>
      <span class="task-assignee">${task.assignee || ''}</span>
    </div>
  `;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function initOperations() {
  const container = document.getElementById('view-operations');
  store.on('epics', () => {
    if (store.get('currentView') === 'operations') {
      renderOperations(container);
    }
  });
  store.on('sessions', () => {
    if (store.get('currentView') === 'operations') {
      renderOperations(container);
    }
  });
}
