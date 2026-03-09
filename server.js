const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { WebSocketServer } = require('ws');
const { handleChallenge, handleVerify, handleLogout, handleMe, handleNostrConnectInit, handleNostrConnectPoll, requireAuth, requireRole } = require('./auth');
const { getTeam, addMember, removeMember, updateMember } = require('./team');
const { getProfile } = require('./profiles');
const mock = require('./mock-data');
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

  // API routes
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    // Parse body for POST/PATCH/DELETE
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

  // Security: prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback: serve index.html for non-file paths
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
    return handleVerify(params, req, res);
  }
  if (method === 'POST' && pathname === '/api/auth/nostr-connect/init') {
    return handleNostrConnectInit(params, req, res);
  }
  if (method === 'POST' && pathname === '/api/auth/nostr-connect/poll') {
    return handleNostrConnectPoll(params, req, res);
  }
  if (method === 'GET' && pathname === '/api/health') {
    return { status: 'ok', beads: beadsAvailable, timestamp: new Date().toISOString() };
  }

  // --- Protected routes ---
  if (!requireAuth(req, res)) return;

  // Auth
  if (method === 'POST' && pathname === '/api/auth/logout') return handleLogout(params, req, res);
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
    return addMember(req.user, req.body);
  }
  if (method === 'DELETE' && pathname.startsWith('/api/team/members/')) {
    if (!requireRole(req, res, 'owner', 'admin')) return;
    const npub = decodeURIComponent(pathname.split('/api/team/members/')[1]);
    return removeMember(req.user, npub);
  }
  if (method === 'PATCH' && pathname.startsWith('/api/team/members/')) {
    if (!requireRole(req, res, 'owner')) return;
    const npub = decodeURIComponent(pathname.split('/api/team/members/')[1]);
    return updateMember(req.user, npub, req.body);
  }

  // --- Data routes ---
  if (method === 'GET' && pathname === '/api/overview') {
    if (!beadsAvailable) return mock.getMockOverview();
    const issues = parseIssuesJsonl();
    return computeOverview(issues);
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
    if (!beadsAvailable) return mock.getMockActivity();
    return parseActivity(bd('activity --limit 100'));
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

// Poll for changes and broadcast
let lastActivityHash = '';
setInterval(async () => {
  try {
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
  } catch {}
}, 5000);

// --- Start ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⭐ OpenClaw Agency Dashboard running at http://localhost:${PORT}`);
  console.log(`🔑 Auth: NIP-07 (extension) · NIP-46 (Nostr Connect) · nsec (direct key)`);
  console.log(`👥 Team config: agency-team.json`);
  console.log(`📦 Data source: ${beadsAvailable ? 'Beads (live)' : 'Mock data (demo)'}`);
  console.log('');
});
