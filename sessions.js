// OpenClaw Session Integration — reads active/recent sessions and memory files
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SESSIONS_FILE = path.join(process.env.HOME, '.openclaw/agents/main/sessions/sessions.json');
const MEMORY_DIR = path.join(process.env.HOME, 'clawd/memory');

/**
 * Read OpenClaw sessions from sessions.json
 * Returns parsed session objects with key metadata
 */
function getOpenClawSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const data = JSON.parse(raw);

    // sessions.json is a map of sessionKey → session object
    const sessions = Object.entries(data).map(([key, s]) => {
      const age = Date.now() - (s.updatedAt || 0);
      const ageMinutes = Math.round(age / 60000);
      const isActive = ageMinutes < 5; // Active if updated in last 5 min

      // Extract label from key
      let label = key;
      let sessionType = 'unknown';
      if (key.includes(':subag')) {
        sessionType = 'subagent';
        label = s.origin?.label || key.split(':').pop().slice(0, 8);
      } else if (key.includes(':cron:')) {
        sessionType = 'cron';
        label = 'Cron Job';
      } else if (key === 'agent:main:main') {
        sessionType = 'main';
        label = 'Main Session';
      }

      // Try to get task description from subagent context
      let taskDescription = null;
      if (s.subagentTask) {
        taskDescription = s.subagentTask;
      } else if (s.origin?.label) {
        taskDescription = s.origin.label;
      }

      // Parse model info
      let model = 'unknown';
      if (s.skillsSnapshot?.skills) {
        // Try to extract from session metadata
      }
      // Model is in the CLI output format — parse from sessionFile if available
      // For now, return what we have

      return {
        sessionId: s.sessionId,
        key,
        type: sessionType,
        label,
        taskDescription,
        channel: s.lastChannel || s.origin?.surface || 'unknown',
        model: s.model || 'unknown',
        updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        ageMinutes,
        isActive,
        chatType: s.chatType || 'direct',
        compactionCount: s.compactionCount || 0
      };
    });

    // Sort by updatedAt descending
    sessions.sort((a, b) => (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1);

    return sessions;
  } catch (e) {
    console.error('Failed to read OpenClaw sessions:', e.message);
    return [];
  }
}

/**
 * Get active sessions (updated in last 5 minutes)
 */
function getActiveSessions() {
  return getOpenClawSessions().filter(s => s.isActive);
}

/**
 * Get recent sessions (last 24 hours, excluding active)
 */
function getRecentSessions() {
  return getOpenClawSessions().filter(s => !s.isActive && s.ageMinutes < 1440);
}

/**
 * Parse memory file for a given date (YYYY-MM-DD)
 * Extracts structured activity entries
 */
function parseMemoryFile(dateStr) {
  const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const entries = [];
  const lines = content.split('\n');

  let currentEntry = null;

  for (const line of lines) {
    // Match ## HH:MM [AP]M - Title patterns
    const headerMatch = line.match(/^## (\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–—]\s*(.+)/i);
    if (headerMatch) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        time: headerMatch[1].trim(),
        title: headerMatch[2].trim(),
        content: '',
        timestamp: parseTimeToISO(dateStr, headerMatch[1].trim()),
        type: categorizeEntry(headerMatch[2].trim())
      };
      continue;
    }

    // Accumulate content for current entry
    if (currentEntry && line.trim()) {
      currentEntry.content += (currentEntry.content ? '\n' : '') + line.trim();
    }
  }

  if (currentEntry) entries.push(currentEntry);
  return entries;
}

/**
 * Get today's memory entries
 */
function getTodayMemory() {
  const today = new Date().toISOString().split('T')[0];
  return parseMemoryFile(today);
}

/**
 * Get available memory dates
 */
function getAvailableDates() {
  try {
    if (!fs.existsSync(MEMORY_DIR)) return [];
    return fs.readdirSync(MEMORY_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function parseTimeToISO(dateStr, timeStr) {
  try {
    // Handle "4:17 AM" or "14:30" formats
    let hours, minutes;
    const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);

    if (match12) {
      hours = parseInt(match12[1]);
      minutes = parseInt(match12[2]);
      const period = match12[3].toUpperCase();
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
    } else if (match24) {
      hours = parseInt(match24[1]);
      minutes = parseInt(match24[2]);
    } else {
      return `${dateStr}T00:00:00Z`;
    }

    return `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`;
  } catch {
    return `${dateStr}T00:00:00Z`;
  }
}

function categorizeEntry(title) {
  const lower = title.toLowerCase();
  if (lower.includes('heartbeat')) return 'heartbeat';
  if (lower.includes('clawstr')) return 'social';
  if (lower.includes('email')) return 'email';
  if (lower.includes('calendar')) return 'calendar';
  if (lower.includes('deploy') || lower.includes('build')) return 'deploy';
  if (lower.includes('subagent') || lower.includes('agent')) return 'agent';
  if (lower.includes('task') || lower.includes('epic')) return 'task';
  return 'general';
}

/**
 * Generate mock session data for demo mode
 */
function getMockSessions() {
  const now = Date.now();
  return {
    active: [
      {
        sessionId: 'mock-sub-001',
        key: 'agent:main:subagent:mock-001',
        type: 'subagent',
        label: 'dashboard-phase2',
        taskDescription: 'Building Phase 2 of Agency Dashboard — dependency graph, workflow monitor, session integration',
        channel: 'signal',
        model: 'claude-opus-4-6',
        updatedAt: new Date(now - 60000).toISOString(),
        ageMinutes: 1,
        isActive: true,
        chatType: 'direct'
      },
      {
        sessionId: 'mock-sub-002',
        key: 'agent:main:subagent:mock-002',
        type: 'subagent',
        label: 'content-writer',
        taskDescription: 'Writing launch blog post for OpenClaw Agency reveal',
        channel: 'signal',
        model: 'claude-opus-4-6',
        updatedAt: new Date(now - 120000).toISOString(),
        ageMinutes: 2,
        isActive: true,
        chatType: 'direct'
      }
    ],
    recent: [
      {
        sessionId: 'mock-cron-001',
        key: 'agent:main:cron:mock-cron-001',
        type: 'cron',
        label: 'Heartbeat Check',
        taskDescription: 'Periodic heartbeat — email, calendar, social check',
        channel: 'system',
        model: 'claude-sonnet-4-6',
        updatedAt: new Date(now - 1800000).toISOString(),
        ageMinutes: 30,
        isActive: false,
        chatType: 'direct'
      },
      {
        sessionId: 'mock-sub-003',
        key: 'agent:main:subagent:mock-003',
        type: 'subagent',
        label: 'spec-writer',
        taskDescription: 'Created dashboard architecture spec with competitive analysis',
        channel: 'signal',
        model: 'claude-opus-4-6',
        updatedAt: new Date(now - 3600000).toISOString(),
        ageMinutes: 60,
        isActive: false,
        chatType: 'direct'
      },
      {
        sessionId: 'mock-cron-002',
        key: 'agent:main:cron:mock-cron-002',
        type: 'cron',
        label: 'Clawstr Social',
        taskDescription: 'Clawstr engagement — replied to 4 posts, reacted to 2',
        channel: 'system',
        model: 'claude-sonnet-4-6',
        updatedAt: new Date(now - 7200000).toISOString(),
        ageMinutes: 120,
        isActive: false,
        chatType: 'direct'
      }
    ],
    summary: {
      totalActive: 2,
      totalRecent: 3,
      totalToday: 15,
      modelsUsed: ['claude-opus-4-6', 'claude-sonnet-4-6']
    }
  };
}

/**
 * Get mock memory entries for demo mode
 */
function getMockMemory(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  if (dateStr !== today) {
    return [
      { time: '9:00 AM', title: 'Morning Heartbeat', content: 'Calendar check, email review, all clear', timestamp: `${dateStr}T09:00:00Z`, type: 'heartbeat' },
      { time: '10:30 AM', title: 'Subagent Work — PR Review', content: 'Spawned coder agent to review and test PR #47 for Agora project', timestamp: `${dateStr}T10:30:00Z`, type: 'agent' },
      { time: '2:00 PM', title: 'Clawstr Engagement', content: 'Replied to 3 threads on agent identity and Nostr development', timestamp: `${dateStr}T14:00:00Z`, type: 'social' },
      { time: '4:00 PM', title: 'Task Completion', content: 'Closed 5 tasks on trading engine epic, all tests passing', timestamp: `${dateStr}T16:00:00Z`, type: 'task' }
    ];
  }
  return [
    { time: '4:17 AM', title: 'Heartbeat / Clawstr Engagement', content: 'Caught up on 31 notifications, replied to 4 threads', timestamp: `${today}T04:17:00Z`, type: 'heartbeat' },
    { time: '7:17 AM', title: 'Heartbeat / Clawstr', content: 'Replied to Jorgenclaw on MLS epoch recovery', timestamp: `${today}T07:17:00Z`, type: 'social' },
    { time: '9:17 AM', title: 'Heartbeat / Clawstr', content: 'Engaged on relay-as-append-log discussion', timestamp: `${today}T09:17:00Z`, type: 'social' },
    { time: '2:00 PM', title: 'Agency Dashboard Build', content: 'Spawned coder subagent for Phase 2 build', timestamp: `${today}T14:00:00Z`, type: 'agent' }
  ];
}

module.exports = {
  getOpenClawSessions,
  getActiveSessions,
  getRecentSessions,
  parseMemoryFile,
  getTodayMemory,
  getAvailableDates,
  getMockSessions,
  getMockMemory
};
