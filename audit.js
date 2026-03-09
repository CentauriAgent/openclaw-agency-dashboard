// Audit logging module — logs auth events and team changes
const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, 'audit.log');

/**
 * Write an audit log entry
 */
function log(event) {
  const entry = {
    timestamp: new Date().toISOString(),
    ...event
  };
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(AUDIT_FILE, line, { mode: 0o600 });
  } catch (e) {
    console.error('Audit log write failed:', e.message);
  }
}

/**
 * Log authentication events
 */
function logAuth(action, details = {}) {
  log({ category: 'auth', action, ...details });
}

/**
 * Log team management events
 */
function logTeam(action, details = {}) {
  log({ category: 'team', action, ...details });
}

/**
 * Read audit log entries, optionally filtered
 * @param {number} limit - max entries to return
 * @param {string} category - filter by category (auth, team)
 * @returns {Array} audit entries (newest first)
 */
function readLog(limit = 100, category = null) {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    let entries = lines.map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    }).filter(Boolean);

    if (category) {
      entries = entries.filter(e => e.category === category);
    }

    // Newest first
    entries.reverse();
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

module.exports = { logAuth, logTeam, readLog };
