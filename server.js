const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { WebSocketServer } = require('ws');
const { handleChallenge, handleVerify, handleLogout, handleMe, handleNostrConnectInit, handleNostrConnectPoll, requireAuth, requireRole } = require('./auth');
const { getTeam, addMember, removeMember, updateMember, getTeamMember } = require('./team');
const { getProfile, batchFetchProfiles, getProfileCacheStats } = require('./profiles');
const mock = require('./mock-data');
const sessions = require('./sessions');
const audit = require('./audit');
const agentsData = require('./data/agents.json');

const PORT = process.env.PORT || 7700;
const BD_CWD = process.env.BD_CWD || process.cwd();

// Check if beads is available
let beadsAvailable = false;
try {
  execSync('bd info', { cwd: BD_CWD, encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
  beadsAvailable = true;
  console.log('📦 Beads detected — using live data');
} catch {
  console.log('📦 Beads not available — using mock data');
}

// Check if OpenClaw sessions are available
let sessionsAvailable = false;
try {
  const sessionsFile = path.join(process.env.HOME, '.openclaw/agents/main/sessions/sessions.json');
  if (fs.existsSync(sessionsFile)) {
    sessionsAvailable = true;
    console.log('🤖 OpenClaw sessions detected — live agent data available');
  }
} catch {}

// Batch fetch profiles for team members on startup
setTimeout(async () => {
  try {
    const { getTeamConfig } = require('./team');
    const config = getTeamConfig();
    if (config?.members?.length) {
      const npubs = config.members.map(m => m.npub);
      await batchFetchProfiles(npubs);
      console.log(`👤 Pre-fetched ${npubs.length} team member profiles`);
    }
  } catch (e) {
    console.error('Profile prefetch failed:', e.message);
  }
}, 2000);

// --- Beads helpers ---
function bd(args) {
  if (!beadsAvailable) return null;
  try {
    return execSync(`bd ${args}`, { cwd: BD_CWD, encoding: 'utf8', timeout: 10000, stdio: 'pipe' }).trim();
  } catch { return null; }
}

function parseActivity(raw) {
  if (!raw) return [];
  return raw.split('\n').map(line => {
    const match = line.match(/\[(\d{2}:\d{2}:\d{2})\]\s+(\S+)\s+([\w.-]+)\s+(\w+)\s+·\s+(.+)/);
    if (!match) return null;
    return { time: match[1], symbol: match[2], issueId: match[3], type: match[4], title: match[5].trim() };
  }).filter(Boolean);
}

function parseIssuesJsonl() {
  const jsonlPath = path.join(BD_CWD, '.beads', 'issues.jsonl');
  if (!fs.existsSync(jsonlPath)) return [];
  return fs.readFileSync(jsonlPath, 'utf8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// --- MIME types ---
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff'
};

// --- Body parser helper ---
function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

// --- Route handler ---
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      req.body = await parseBody(req);
    }

    try {
      const result = await routeAPI(req, res, pathname, url.searchParams);
      if (!res.writableEnded) {
        res.end(JSON.stringify(result));
      }
    } catch (e) {
      console.error('API error:', e);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
    return;
  }

  // Static files
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}

async function routeAPI(req, res, pathname, params) {
  const method = req.method;

  // --- Public routes ---
  if (method === 'POST' && pathname === '/api/auth/challenge') {
    return handleChallenge(params, req, res);
  }
  if (method === 'POST' && pathname === '/api/auth/verify') {
    const result = await handleVerify(params, req, res);
    // Audit log
    if (result && !result.error) {
      audit.logAuth('login', { npub: result.npub, role: result.role, method: 'nip07' });
    } else if (result?.error) {
      audit.logAuth('login_failed', { error: result.error, ip: req.socket.remoteAddress });
    }
    return result;
  }
  if (method === 'POST' && pathname === '/api/auth/nostr-connect/init') {
    return handleNostrConnectInit(params, req, res);
  }
  if (method === 'POST' && pathname === '/api/auth/nostr-connect/poll') {
    const result = await handleNostrConnectPoll(params, req, res);
    if (result?.status === 'complete' && result.npub) {
      audit.logAuth('login', { npub: result.npub, role: result.role, method: 'nip46' });
    }
    return result;
  }
  if (method === 'GET' && pathname === '/api/health') {
    return {
      status: 'ok',
      beads: beadsAvailable,
      sessions: sessionsAvailable,
      timestamp: new Date().toISOString()
    };
  }

  // --- Protected routes ---
  if (!requireAuth(req, res)) return;

  // Auth
  if (method === 'POST' && pathname === '/api/auth/logout') {
    audit.logAuth('logout', { npub: req.user.sub });
    return handleLogout(params, req, res);
  }
  if (method === 'GET' && pathname === '/api/auth/me') return handleMe(params, req, res);

  // Profile
  if (method === 'GET' && pathname.startsWith('/api/profile/')) {
    const npub = pathname.split('/api/profile/')[1];
    return getProfile(decodeURIComponent(npub));
  }

  // Team
  if (method === 'GET' && pathname === '/api/team') {
    if (!requireRole(req, res, 'owner', 'admin')) return;
    return getTeam(req.user);
  }
  if (method === 'POST' && pathname === '/api/team/members') {
    if (!requireRole(req, res, 'owner', 'admin')) return;
    const result = addMember(req.user, req.body);
    if (result.ok) audit.logTeam('member_added', { npub: req.body.npub, role: req.body.role, by: req.user.sub });
    return result;
  }
  if (method === 'DELETE' && pathname.startsWith('/api/team/members/')) {
    if (!requireRole(req, res, 'owner', 'admin')) return;
    const npub = decodeURIComponent(pathname.split('/api/team/members/')[1]);
    const result = removeMember(req.user, npub);
    if (result.ok) audit.logTeam('member_removed', { npub, by: req.user.sub });
    return result;
  }
  if (method === 'PATCH' && pathname.startsWith('/api/team/members/')) {
    if (!requireRole(req, res, 'owner')) return;
    const npub = decodeURIComponent(pathname.split('/api/team/members/')[1]);
    const result = updateMember(req.user, npub, req.body);
    if (result.ok) audit.logTeam('role_changed', { npub, newRole: req.body.role, by: req.user.sub });
    return result;
  }

  // --- Data routes ---

  // Overview — with division access control
  if (method === 'GET' && pathname === '/api/overview') {
    let overview;
    if (!beadsAvailable) {
      overview = mock.getMockOverview();
    } else {
      const issues = parseIssuesJsonl();
      overview = computeOverview(issues);
    }
    // Merge session data into overview
    const sessionData = getSessionSummary();
    overview.sessions = sessionData;
    overview.dataSource = {
      beads: beadsAvailable,
      sessions: sessionsAvailable || !beadsAvailable
    };
    return filterByDivisionAccess(req.user, overview);
  }

  if (method === 'GET' && pathname === '/api/issues') {
    if (!beadsAvailable) return mock.getMockIssues();
    return parseIssuesJsonl();
  }

  if (method === 'GET' && pathname === '/api/epics') {
    if (!beadsAvailable) return mock.getMockEpics();
    const issues = parseIssuesJsonl();
    return computeEpics(issues);
  }

  if (method === 'GET' && pathname === '/api/activity') {
    let activity;
    if (!beadsAvailable) {
      activity = mock.getMockActivity();
    } else {
      activity = parseActivity(bd('activity --limit 100'));
    }
    // Merge memory entries into activity feed
    const memoryEntries = getMemoryAsActivity();
    return mergeActivityFeeds(activity, memoryEntries);
  }

  if (method === 'GET' && pathname === '/api/agents') {
    if (!beadsAvailable) {
      const statuses = mock.getMockAgentStatuses();
      return agentsData.divisions.flatMap(d =>
        d.agents.map(a => ({ ...a, division: d.id, divisionName: d.name, divisionEmoji: d.emoji, divisionColor: d.color, ...statuses[a.id] }))
      );
    }
    return agentsData.divisions.flatMap(d =>
      d.agents.map(a => ({ ...a, division: d.id, divisionName: d.name, divisionEmoji: d.emoji, divisionColor: d.color, status: 'idle', currentTask: null, lastActive: null, lifetimeTasksClosed: 0 }))
    );
  }

  // Sessions endpoint — THE BIG ONE
  if (method === 'GET' && pathname === '/api/sessions') {
    if (sessionsAvailable) {
      const active = sessions.getActiveSessions();
      const recent = sessions.getRecentSessions().slice(0, 20);
      return {
        active,
        recent,
        summary: {
          totalActive: active.length,
          totalRecent: recent.length,
          totalToday: sessions.getOpenClawSessions().filter(s => s.ageMinutes < 1440).length
        }
      };
    }
    return mock.getMockSessions ? sessions.getMockSessions() : { active: [], recent: [], summary: { totalActive: 0, totalRecent: 0, totalToday: 0 } };
  }

  // Memory / Historical browse
  if (method === 'GET' && pathname === '/api/memory/dates') {
    if (sessionsAvailable) {
      return { dates: sessions.getAvailableDates() };
    }
    // Mock dates
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return { dates };
  }

  if (method === 'GET' && pathname.startsWith('/api/memory/')) {
    const dateStr = pathname.split('/api/memory/')[1];
    if (dateStr === 'dates') return; // handled above
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.statusCode = 400;
      return { error: 'Invalid date format. Use YYYY-MM-DD.' };
    }
    if (sessionsAvailable) {
      return { date: dateStr, entries: sessions.parseMemoryFile(dateStr) };
    }
    return { date: dateStr, entries: sessions.getMockMemory(dateStr) };
  }

  // Dependency graph
  if (method === 'GET' && pathname.startsWith('/api/graph')) {
    const epicId = params.get('id') || pathname.split('/api/graph/')[1];
    if (!beadsAvailable) return mock.getMockGraph ? mock.getMockGraph(epicId) : computeMockGraph(epicId);

    const issues = parseIssuesJsonl();
    return computeGraph(issues, epicId);
  }

  // Search
  if (method === 'GET' && pathname === '/api/search') {
    const query = (params.get('q') || '').toLowerCase().trim();
    if (!query || query.length < 2) return { results: [] };
    return performSearch(query);
  }

  // Audit log
  if (method === 'GET' && pathname === '/api/audit') {
    if (!requireRole(req, res, 'owner')) return;
    const limit = parseInt(params.get('limit')) || 100;
    const category = params.get('category') || null;
    return { entries: audit.readLog(limit, category) };
  }

  if (method === 'GET' && pathname === '/api/ready') {
    if (!beadsAvailable) return mock.getMockIssues().filter(i => i.status === 'open');
    const raw = bd('ready');
    return raw ? raw.split('\n') : [];
  }

  if (method === 'GET' && pathname === '/api/blocked') {
    if (!beadsAvailable) return mock.getMockIssues().filter(i => i.status === 'blocked');
    const raw = bd('blocked');
    return raw ? raw.split('\n') : [];
  }

  res.statusCode = 404;
  return { error: 'Not found' };
}

// --- Computation helpers ---

function computeOverview(issues) {
  const divisions = agentsData.divisions.map(div => {
    const divTasks = issues.filter(i =>
      i.labels?.some(l => div.agents.some(a => l === `role:${a.id}`))
    );
    return {
      id: div.id, name: div.name, emoji: div.emoji, color: div.color,
      agentCount: div.agents.length,
      activeAgents: 0, idleAgents: div.agents.length,
      openTasks: divTasks.filter(t => ['open', 'in_progress'].includes(t.status)).length,
      closedTasks: divTasks.filter(t => t.status === 'closed').length,
      status: 'idle',
      agents: div.agents.map(a => ({ ...a, division: div.id, status: 'idle', currentTask: null, lastActive: null, lifetimeTasksClosed: 0 }))
    };
  });
  return {
    divisions,
    totalIssues: issues.length,
    openIssues: issues.filter(i => ['open', 'in_progress'].includes(i.status)).length,
    closedIssues: issues.filter(i => i.status === 'closed').length
  };
}

function computeEpics(issues) {
  const epics = issues.filter(i => i.issue_type === 'epic');
  return epics.map(epic => {
    const children = issues.filter(i => i.parent_id === epic.id);
    const closed = children.filter(t => t.status === 'closed').length;
    return {
      ...epic,
      taskCount: children.length,
      completedCount: closed,
      progress: children.length > 0 ? Math.round((closed / children.length) * 100) : 0,
      tasks: children
    };
  });
}

function computeGraph(issues, epicId) {
  let epic;
  if (epicId) {
    epic = issues.find(i => i.id === epicId);
  } else {
    // Pick the most recent in-progress epic, or any epic
    epic = issues.find(i => i.issue_type === 'epic' && i.status === 'in_progress')
      || issues.find(i => i.issue_type === 'epic');
  }

  if (!epic) return { nodes: [], edges: [], epicId: null, epicTitle: null };

  const children = issues.filter(i => i.parent_id === epic.id);
  const nodes = children.map(task => ({
    id: task.id,
    label: task.title,
    status: task.status,
    shortId: task.id.split('.').pop(),
    assignee: getAgentNameFromLabels(task.labels)
  }));

  const edges = [];
  for (const task of children) {
    if (task.depends_on) {
      for (const dep of task.depends_on) {
        if (children.find(c => c.id === dep)) {
          edges.push({ from: dep, to: task.id });
        }
      }
    }
    if (task.blocks) {
      for (const blocked of task.blocks) {
        if (children.find(c => c.id === blocked)) {
          edges.push({ from: task.id, to: blocked });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    epicId: epic.id,
    epicTitle: epic.title,
    epicStatus: epic.status
  };
}

function computeMockGraph(epicId) {
  const mockIssues = mock.getMockIssues();
  return computeGraph(mockIssues, epicId || 'clawd-xyz');
}

function getAgentNameFromLabels(labels) {
  if (!labels) return '';
  const roleLabel = labels.find(l => l.startsWith('role:'));
  if (!roleLabel) return '';
  const roleId = roleLabel.replace('role:', '');
  for (const div of agentsData.divisions) {
    const agent = div.agents.find(a => a.id === roleId);
    if (agent) return agent.name;
  }
  return '';
}

function getSessionSummary() {
  if (sessionsAvailable) {
    const active = sessions.getActiveSessions();
    const recent = sessions.getRecentSessions().slice(0, 5);
    return { active, recent, available: true };
  }
  if (!beadsAvailable) {
    const mockData = sessions.getMockSessions();
    return { ...mockData, available: true };
  }
  return { active: [], recent: [], available: false };
}

function getMemoryAsActivity() {
  try {
    const entries = sessionsAvailable ? sessions.getTodayMemory() : sessions.getMockMemory(new Date().toISOString().split('T')[0]);
    return entries.map(e => ({
      timestamp: e.timestamp,
      time: e.time.replace(/\s*(AM|PM)/i, ''),
      type: e.type === 'heartbeat' ? 'heartbeat' : e.type === 'agent' ? 'started' : 'created',
      symbol: e.type === 'heartbeat' ? '💓' : e.type === 'agent' ? '🤖' : '📝',
      issueId: '',
      title: e.title,
      assignee: 'Centauri',
      source: 'memory'
    }));
  } catch { return []; }
}

function mergeActivityFeeds(beadsActivity, memoryActivity) {
  const combined = [...(beadsActivity || []), ...(memoryActivity || [])];
  // Sort by timestamp/time descending
  combined.sort((a, b) => {
    const ta = a.timestamp || `1970-01-01T${a.time || '00:00:00'}Z`;
    const tb = b.timestamp || `1970-01-01T${b.time || '00:00:00'}Z`;
    return tb > ta ? 1 : ta > tb ? -1 : 0;
  });
  return combined;
}

function filterByDivisionAccess(user, overview) {
  // Check if user has division restrictions
  const member = getTeamMember(user.sub);
  if (!member?.divisions || member.divisions.length === 0) return overview;
  if (['owner', 'admin'].includes(user.role)) return overview;

  // Filter divisions
  overview.divisions = overview.divisions.filter(d => member.divisions.includes(d.id));
  return overview;
}

function performSearch(query) {
  const results = [];

  // Search agents
  for (const div of agentsData.divisions) {
    for (const agent of div.agents) {
      if (agent.name.toLowerCase().includes(query) || agent.desc.toLowerCase().includes(query) || agent.id.toLowerCase().includes(query)) {
        results.push({ type: 'agent', id: agent.id, title: `${agent.emoji} ${agent.name}`, subtitle: agent.desc, division: div.name });
      }
    }
  }

  // Search issues
  const issues = beadsAvailable ? parseIssuesJsonl() : mock.getMockIssues();
  for (const issue of issues) {
    if ((issue.title || '').toLowerCase().includes(query) || (issue.id || '').toLowerCase().includes(query)) {
      results.push({ type: 'issue', id: issue.id, title: issue.title, subtitle: `${issue.status} · ${issue.issue_type || 'task'}`, status: issue.status });
    }
  }

  // Search activity
  const activity = beadsAvailable ? parseActivity(bd('activity --limit 50')) : mock.getMockActivity().slice(0, 50);
  for (const event of activity || []) {
    if ((event.title || '').toLowerCase().includes(query)) {
      results.push({ type: 'activity', id: event.issueId, title: event.title, subtitle: `${event.time} · ${event.type}` });
    }
  }

  return { results: results.slice(0, 30), query };
}

// --- HTTP Server ---
const server = http.createServer(handleRequest);

// --- WebSocket ---
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// Poll for changes and broadcast via WebSocket
let lastActivityHash = '';
let lastSessionHash = '';

setInterval(async () => {
  try {
    // Activity changes
    let activity;
    if (beadsAvailable) {
      activity = parseActivity(bd('activity --limit 20'));
    } else {
      activity = mock.getMockActivity().slice(0, 20);
    }
    const hash = JSON.stringify(activity).slice(0, 200);
    if (hash !== lastActivityHash) {
      lastActivityHash = hash;
      broadcast({ type: 'activity', data: activity });
    }

    // Session changes
    if (sessionsAvailable) {
      const active = sessions.getActiveSessions();
      const sessionHash = JSON.stringify(active.map(s => s.sessionId)).slice(0, 200);
      if (sessionHash !== lastSessionHash) {
        lastSessionHash = sessionHash;
        broadcast({ type: 'sessions', data: { active, count: active.length } });
      }
    }
  } catch {}
}, 5000);

// Watch for beads file changes and broadcast immediately
try {
  const beadsPath = path.join(BD_CWD, '.beads');
  if (fs.existsSync(beadsPath)) {
    let debounce = null;
    fs.watch(beadsPath, { recursive: true }, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        try {
          const issues = parseIssuesJsonl();
          const overview = computeOverview(issues);
          broadcast({ type: 'overview', data: overview });
          const epics = computeEpics(issues);
          broadcast({ type: 'epics', data: epics });
        } catch {}
      }, 500);
    });
    console.log('👁️ Watching .beads/ for changes (WebSocket push)');
  }
} catch {}

// Watch memory directory for changes
try {
  const memDir = path.join(process.env.HOME, 'clawd/memory');
  if (fs.existsSync(memDir)) {
    fs.watch(memDir, (event, filename) => {
      if (filename && filename.endsWith('.md')) {
        const memoryEntries = getMemoryAsActivity();
        broadcast({ type: 'memory', data: memoryEntries });
      }
    });
    console.log('👁️ Watching memory/ for changes (WebSocket push)');
  }
} catch {}

// --- Start ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⭐ OpenClaw Agency Dashboard running at http://localhost:${PORT}`);
  console.log(`🔑 Auth: NIP-07 (extension) · NIP-46 (Nostr Connect) · nsec (direct key)`);
  console.log(`👥 Team config: agency-team.json`);
  console.log(`📦 Data: ${beadsAvailable ? 'Beads ✓' : 'Mock'} | Sessions: ${sessionsAvailable ? '✓' : 'Mock'}`);
  console.log('');
});
