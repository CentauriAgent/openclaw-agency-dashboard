// Workflow Monitor view — cross-division pipeline visualization

import { store } from '../state.js';

const DIVISION_INFO = {
  product: { emoji: '📦', name: 'Product', color: '#f59e0b' },
  engineering: { emoji: '🏗️', name: 'Engineering', color: '#3b82f6' },
  design: { emoji: '🎨', name: 'Design', color: '#ec4899' },
  testing: { emoji: '🧪', name: 'Testing', color: '#ef4444' },
  marketing: { emoji: '📣', name: 'Marketing', color: '#22c55e' },
  operations: { emoji: '🛟', name: 'Operations', color: '#14b8a6' },
  'project-management': { emoji: '🎬', name: 'PM', color: '#6366f1' }
};

const WORKFLOW_TEMPLATES = [
  {
    name: 'Ship a Feature',
    icon: '🚢',
    desc: 'Product → Engineering → Testing → Marketing → Operations',
    phases: ['product', 'engineering', 'testing', 'marketing', 'operations']
  },
  {
    name: 'Launch Campaign',
    icon: '🚀',
    desc: 'Product → Design → Marketing → Operations',
    phases: ['product', 'design', 'marketing', 'operations']
  },
  {
    name: 'Security Audit',
    icon: '🔒',
    desc: 'Engineering → Testing → Operations',
    phases: ['engineering', 'testing', 'operations']
  },
  {
    name: 'Design Sprint',
    icon: '⚡',
    desc: 'Product → Design → Engineering → Testing',
    phases: ['product', 'design', 'engineering', 'testing']
  }
];

export function renderWorkflow(container) {
  const epics = store.get('epics') || [];
  const agents = store.get('agents') || [];

  // Find epics that span multiple divisions (cross-division workflows)
  const workflows = detectWorkflows(epics, agents);

  if (workflows.length === 0) {
    container.innerHTML = `
      <div class="view-header"><h2 class="view-title">Workflow Monitor</h2></div>
      <div class="empty-state">
        <div class="empty-state-icon">🔄</div>
        <div class="empty-state-text">No active cross-division workflows</div>
        <div class="empty-state-sub">Workflows appear when epics span multiple divisions</div>
      </div>
      <div style="margin-top: var(--space-xl);">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: var(--space-md);">📋 Workflow Templates</h3>
        <div class="workflow-templates">
          ${WORKFLOW_TEMPLATES.map(t => `
            <div class="workflow-template-card">
              <div class="template-icon">${t.icon}</div>
              <div class="template-name">${t.name}</div>
              <div class="template-desc">${t.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="view-header"><h2 class="view-title">Workflow Monitor</h2></div>
    ${workflows.map(wf => renderWorkflowPipeline(wf)).join('')}
  `;
}

function detectWorkflows(epics, agents) {
  const workflows = [];

  for (const epic of epics) {
    if (!epic.tasks || epic.tasks.length === 0) continue;
    if (epic.status === 'closed') continue; // Skip completed epics for active workflows

    // Find which divisions are involved
    const divisionsInvolved = new Map(); // divId → { tasks, agents }

    for (const task of epic.tasks) {
      const roleLabel = (task.labels || []).find(l => l.startsWith('role:'));
      if (!roleLabel) continue;
      const roleId = roleLabel.replace('role:', '');

      // Find which division this role belongs to
      const agent = agents.find(a => a.id === roleId);
      if (!agent) continue;

      const divId = agent.division;
      if (!divisionsInvolved.has(divId)) {
        divisionsInvolved.set(divId, { tasks: [], agents: new Set() });
      }
      divisionsInvolved.get(divId).tasks.push(task);
      divisionsInvolved.get(divId).agents.add(roleId);
    }

    // Only show as workflow if 2+ divisions involved
    if (divisionsInvolved.size >= 2) {
      // Determine phase order based on task completion order
      const phases = [];
      for (const [divId, data] of divisionsInvolved) {
        const closed = data.tasks.filter(t => t.status === 'closed').length;
        const inProgress = data.tasks.filter(t => t.status === 'in_progress').length;
        const total = data.tasks.length;
        const progress = total > 0 ? Math.round((closed / total) * 100) : 0;

        let phaseStatus = 'waiting';
        if (progress === 100) phaseStatus = 'complete';
        else if (inProgress > 0 || (closed > 0 && closed < total)) phaseStatus = 'active';

        phases.push({
          divId,
          info: DIVISION_INFO[divId] || { emoji: '📁', name: divId, color: '#666' },
          tasks: data.tasks,
          agents: Array.from(data.agents),
          closed,
          total,
          progress,
          status: phaseStatus
        });
      }

      // Sort: complete first, then active, then waiting
      const statusOrder = { complete: 0, active: 1, waiting: 2 };
      phases.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

      workflows.push({
        epicId: epic.id,
        epicTitle: epic.title,
        epicProgress: epic.progress,
        phases
      });
    }
  }

  return workflows;
}

function renderWorkflowPipeline(workflow) {
  return `
    <div class="card" style="margin-bottom: var(--space-lg);">
      <div class="card-header">
        <span class="card-title">${workflow.epicTitle}</span>
        <span class="badge badge--progress">${workflow.epicProgress}%</span>
      </div>
      <div class="workflow-pipeline">
        ${workflow.phases.map((phase, i) => `
          ${i > 0 ? '<div class="workflow-arrow">→</div>' : ''}
          <div class="workflow-phase workflow-phase--${phase.status}">
            <div class="workflow-phase-header">
              <span>${phase.info.emoji}</span>
              <span>${phase.info.name}</span>
            </div>
            <div class="workflow-phase-status">
              ${phase.status === 'complete' ? '✅ Complete' : phase.status === 'active' ? '◐ Active' : '○ Waiting'}
              — ${phase.closed}/${phase.total} tasks
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${phase.progress === 100 ? 'progress-fill--complete' : ''}" style="width: ${phase.progress}%"></div>
            </div>
            <div class="workflow-phase-agents">
              ${phase.tasks.slice(0, 4).map(t => {
                const icon = t.status === 'closed' ? '✓' : t.status === 'in_progress' ? '◐' : '○';
                const cls = t.status === 'closed' ? 'task-status-icon--closed' : t.status === 'in_progress' ? 'task-status-icon--in_progress' : 'task-status-icon--open';
                return `<div class="workflow-phase-agent"><span class="${cls}">${icon}</span> ${t.title}</div>`;
              }).join('')}
              ${phase.tasks.length > 4 ? `<div class="workflow-phase-agent" style="color: var(--text-muted);">+${phase.tasks.length - 4} more</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function initWorkflow() {
  const container = document.getElementById('view-workflow');
  store.on('epics', () => {
    if (store.get('currentView') === 'workflow') {
      renderWorkflow(container);
    }
  });
}
