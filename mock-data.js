// Realistic mock data for demo mode (when beads is not available)

const agentsData = require('./data/agents.json');

function randomDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 14) + 8); // 8am-10pm
  d.setMinutes(Math.floor(Math.random() * 60));
  return d.toISOString();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursAgo(n) {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

const MOCK_EPICS = [
  {
    id: 'clawd-k4o',
    title: 'Polymarket Trading Engine v2.0',
    description: 'Complete trading engine with scanner, analyzer, trader, and monitoring',
    status: 'closed',
    priority: 1,
    issue_type: 'epic',
    owner: 'centauri@clawd.bot',
    created_at: daysAgo(14),
    updated_at: daysAgo(1),
    closed_at: daysAgo(1),
    close_reason: 'Completed',
    labels: ['polymarket', 'trading', 'gt:agent'],
    parent_id: null,
    children: [],
    depends_on: [],
    blocks: []
  },
  {
    id: 'clawd-xyz',
    title: 'Agency Launch Campaign',
    description: 'Full launch campaign for OpenClaw Agency public reveal',
    status: 'in_progress',
    priority: 1,
    issue_type: 'epic',
    owner: 'centauri@clawd.bot',
    created_at: daysAgo(5),
    updated_at: hoursAgo(2),
    closed_at: null,
    labels: ['launch', 'marketing', 'gt:agent'],
    parent_id: null,
    children: [],
    depends_on: [],
    blocks: []
  },
  {
    id: 'clawd-abc',
    title: 'Nostr DevRel Documentation Hub',
    description: 'Comprehensive documentation site for Nostr developers',
    status: 'in_progress',
    priority: 2,
    issue_type: 'epic',
    owner: 'centauri@clawd.bot',
    created_at: daysAgo(7),
    updated_at: hoursAgo(4),
    closed_at: null,
    labels: ['nostr', 'devrel', 'docs', 'gt:agent'],
    parent_id: null,
    children: [],
    depends_on: [],
    blocks: []
  }
];

const MOCK_TASKS = [
  // Polymarket epic tasks (all closed)
  { id: 'clawd-k4o.1', title: 'Scanner Module', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:coder'], closed_at: daysAgo(12) },
  { id: 'clawd-k4o.2', title: 'Analyzer Module', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:coder'], closed_at: daysAgo(11) },
  { id: 'clawd-k4o.3', title: 'Trader Module', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:coder'], closed_at: daysAgo(10) },
  { id: 'clawd-k4o.4', title: 'Status Dashboard', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:frontend'], closed_at: daysAgo(9) },
  { id: 'clawd-k4o.5', title: 'Portfolio Tracker', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:backend'], closed_at: daysAgo(8) },
  { id: 'clawd-k4o.6', title: 'Risk Management', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:security'], closed_at: daysAgo(7) },
  { id: 'clawd-k4o.7', title: 'API Integration', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:backend'], closed_at: daysAgo(6) },
  { id: 'clawd-k4o.8', title: 'Funding Pipeline', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:devops'], closed_at: daysAgo(5) },
  { id: 'clawd-k4o.9', title: 'Market Filters', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:coder'], closed_at: daysAgo(4) },
  { id: 'clawd-k4o.10', title: 'Configuration System', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:architect'], closed_at: daysAgo(3) },
  { id: 'clawd-k4o.11', title: 'Position Monitor', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:coder'], closed_at: daysAgo(3) },
  { id: 'clawd-k4o.12', title: 'Error Handling', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:coder'], closed_at: daysAgo(2) },
  { id: 'clawd-k4o.13', title: 'Cron Job Setup', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:devops'], closed_at: daysAgo(1) },
  { id: 'clawd-k4o.14', title: 'Dry-Run Testing', status: 'closed', parent_id: 'clawd-k4o', labels: ['gt:agent', 'role:tester'], closed_at: daysAgo(1) },

  // Launch Campaign tasks (mixed statuses)
  { id: 'clawd-xyz.1', title: 'Write README', status: 'closed', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:docs'], closed_at: daysAgo(3) },
  { id: 'clawd-xyz.2', title: 'Create Taglines & Messaging', status: 'closed', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:content-creator'], closed_at: daysAgo(2) },
  { id: 'clawd-xyz.3', title: 'Build Dashboard Spec', status: 'closed', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:architect'], closed_at: daysAgo(1) },
  { id: 'clawd-xyz.4', title: 'Build Dashboard MVP', status: 'in_progress', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:coder'], closed_at: null },
  { id: 'clawd-xyz.5', title: 'Design Landing Page', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:ui-designer'], closed_at: null },
  { id: 'clawd-xyz.6', title: 'Social Media Campaign', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:social-strategist'], closed_at: null },
  { id: 'clawd-xyz.7', title: 'Community Outreach Plan', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:community-builder'], closed_at: null },
  { id: 'clawd-xyz.8', title: 'Press Kit', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:brand-guardian'], closed_at: null },
  { id: 'clawd-xyz.9', title: 'QA Review', status: 'blocked', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:reality-checker'], closed_at: null },
  { id: 'clawd-xyz.10', title: 'Performance Benchmarks', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:performance-benchmarker'], closed_at: null },
  { id: 'clawd-xyz.11', title: 'Deploy to Production', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:devops'], closed_at: null },
  { id: 'clawd-xyz.12', title: 'Launch Announcement', status: 'open', parent_id: 'clawd-xyz', labels: ['gt:agent', 'role:growth-hacker'], closed_at: null },

  // DevRel docs tasks
  { id: 'clawd-abc.1', title: 'NIP Reference Guide', status: 'closed', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:docs'], closed_at: daysAgo(4) },
  { id: 'clawd-abc.2', title: 'Getting Started Tutorial', status: 'closed', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:docs'], closed_at: daysAgo(3) },
  { id: 'clawd-abc.3', title: 'API Documentation', status: 'in_progress', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:docs'], closed_at: null },
  { id: 'clawd-abc.4', title: 'Relay Implementation Guide', status: 'open', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:backend'], closed_at: null },
  { id: 'clawd-abc.5', title: 'Client SDK Examples', status: 'open', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:coder'], closed_at: null },
  { id: 'clawd-abc.6', title: 'Video Tutorials Script', status: 'in_progress', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:content-creator'], closed_at: null },
  { id: 'clawd-abc.7', title: 'Accessibility Audit', status: 'open', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:accessibility-auditor'], closed_at: null },
  { id: 'clawd-abc.8', title: 'SEO Optimization', status: 'open', parent_id: 'clawd-abc', labels: ['gt:agent', 'role:growth-hacker'], closed_at: null }
];

// Fill in children for epics
MOCK_EPICS.forEach(epic => {
  epic.children = MOCK_TASKS.filter(t => t.parent_id === epic.id).map(t => t.id);
});

// Complete tasks with full shape
const MOCK_ISSUES = [...MOCK_EPICS, ...MOCK_TASKS.map(t => ({
  ...t,
  description: '',
  priority: 2,
  issue_type: 'task',
  owner: 'centauri@clawd.bot',
  created_at: t.closed_at ? daysAgo(15) : daysAgo(5),
  updated_at: t.closed_at || hoursAgo(Math.floor(Math.random() * 48)),
  close_reason: t.status === 'closed' ? 'Completed' : null,
  children: [],
  depends_on: [],
  blocks: []
}))];

// Generate mock activity events
function generateMockActivity() {
  const events = [];
  const types = [
    { type: 'completed', symbol: '✓' },
    { type: 'started', symbol: '→' },
    { type: 'created', symbol: '+' }
  ];

  // Recent events from the last 3 days
  const recentTasks = MOCK_TASKS.filter(t => t.status === 'closed').slice(-8);
  recentTasks.forEach((task, i) => {
    const d = new Date(task.closed_at);
    events.push({
      timestamp: task.closed_at,
      time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`,
      type: 'completed',
      symbol: '✓',
      issueId: task.id,
      title: task.title,
      assignee: getAgentForRole(task.labels)
    });

    // Add a started event shortly before
    const started = new Date(d.getTime() - (30 + Math.random() * 120) * 60000);
    events.push({
      timestamp: started.toISOString(),
      time: `${String(started.getHours()).padStart(2,'0')}:${String(started.getMinutes()).padStart(2,'0')}:00`,
      type: 'started',
      symbol: '→',
      issueId: task.id,
      title: task.title,
      assignee: getAgentForRole(task.labels)
    });
  });

  // In-progress events
  MOCK_TASKS.filter(t => t.status === 'in_progress').forEach(task => {
    const d = new Date();
    d.setHours(d.getHours() - Math.floor(Math.random() * 4));
    events.push({
      timestamp: d.toISOString(),
      time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`,
      type: 'started',
      symbol: '→',
      issueId: task.id,
      title: task.title,
      assignee: getAgentForRole(task.labels)
    });
  });

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events;
}

function getAgentForRole(labels) {
  const roleLabel = labels.find(l => l.startsWith('role:'));
  if (!roleLabel) return 'Centauri';
  const roleId = roleLabel.replace('role:', '');
  for (const div of agentsData.divisions) {
    const agent = div.agents.find(a => a.id === roleId);
    if (agent) return agent.name;
  }
  return 'Centauri';
}

function getMockAgentStatuses() {
  const statuses = {};
  for (const div of agentsData.divisions) {
    for (const agent of div.agents) {
      const activeTask = MOCK_TASKS.find(t =>
        t.status === 'in_progress' &&
        t.labels.includes(`role:${agent.id}`)
      );
      const blockedTask = MOCK_TASKS.find(t =>
        t.status === 'blocked' &&
        t.labels.includes(`role:${agent.id}`)
      );
      const lastClosed = MOCK_TASKS
        .filter(t => t.status === 'closed' && t.labels.includes(`role:${agent.id}`))
        .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];
      const totalClosed = MOCK_TASKS.filter(t =>
        t.status === 'closed' && t.labels.includes(`role:${agent.id}`)
      ).length;

      statuses[agent.id] = {
        status: blockedTask ? 'blocked' : activeTask ? 'active' : 'idle',
        currentTask: activeTask ? { id: activeTask.id, title: activeTask.title } : null,
        lastActive: lastClosed ? lastClosed.closed_at : null,
        lifetimeTasksClosed: totalClosed
      };
    }
  }
  return statuses;
}

function getMockOverview() {
  const agentStatuses = getMockAgentStatuses();
  const divisions = agentsData.divisions.map(div => {
    const agents = div.agents.map(a => ({
      ...a,
      division: div.id,
      ...agentStatuses[a.id]
    }));
    const activeCount = agents.filter(a => a.status === 'active').length;
    const openTasks = MOCK_TASKS.filter(t =>
      ['open', 'in_progress'].includes(t.status) &&
      t.labels.some(l => div.agents.some(a => l === `role:${a.id}`))
    ).length;
    const closedTasks = MOCK_TASKS.filter(t =>
      t.status === 'closed' &&
      t.labels.some(l => div.agents.some(a => l === `role:${a.id}`))
    ).length;

    return {
      id: div.id,
      name: div.name,
      emoji: div.emoji,
      color: div.color,
      agentCount: div.agents.length,
      activeAgents: activeCount,
      idleAgents: div.agents.length - activeCount,
      openTasks,
      closedTasks,
      status: activeCount > 0 ? 'active' : 'idle',
      agents
    };
  });

  const totalIssues = MOCK_ISSUES.length;
  const openIssues = MOCK_ISSUES.filter(i => ['open', 'in_progress'].includes(i.status)).length;
  const closedIssues = MOCK_ISSUES.filter(i => i.status === 'closed').length;

  return { divisions, totalIssues, openIssues, closedIssues };
}

function getMockEpics() {
  return MOCK_EPICS.map(epic => {
    const children = MOCK_TASKS.filter(t => t.parent_id === epic.id);
    const closed = children.filter(t => t.status === 'closed').length;
    return {
      ...epic,
      taskCount: children.length,
      completedCount: closed,
      progress: children.length > 0 ? Math.round((closed / children.length) * 100) : 0,
      tasks: children.map(t => ({
        ...t,
        assignee: getAgentForRole(t.labels)
      }))
    };
  });
}

module.exports = {
  getMockOverview,
  getMockActivity: generateMockActivity,
  getMockIssues: () => MOCK_ISSUES,
  getMockEpics,
  getMockAgentStatuses,
  MOCK_ISSUES,
  MOCK_TASKS,
  MOCK_EPICS
};
