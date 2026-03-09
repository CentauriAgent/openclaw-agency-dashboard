// Active Operations view

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
  if (!epics || epics.length === 0) {
    container.innerHTML = `
      <div class="view-header"><h2 class="view-title">Active Operations</h2></div>
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <div class="empty-state-text">No epics found</div>
        <div class="empty-state-sub">Operations will appear here when epics are created in beads</div>
      </div>
    `;
    return;
  }

  // Sort: in_progress first, then open, then closed
  const sorted = [...epics].sort((a, b) => {
    const order = { in_progress: 0, open: 1, blocked: 2, deferred: 3, closed: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  container.innerHTML = `
    <div class="view-header"><h2 class="view-title">Active Operations</h2></div>
    ${sorted.map(epic => renderEpic(epic)).join('')}
  `;

  // Toggle task list visibility
  container.querySelectorAll('.epic-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskList = btn.closest('.epic-card').querySelector('.task-list');
      if (taskList) {
        taskList.style.display = taskList.style.display === 'none' ? 'block' : 'none';
        btn.textContent = taskList.style.display === 'none' ? '▶' : '▼';
      }
    });
  });
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
}
