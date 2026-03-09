const fs = require('fs');
const path = require('path');

const TEAM_FILE = path.join(__dirname, 'agency-team.json');
const DEFAULT_OWNER = 'npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424';

let teamConfig = null;

function loadTeam() {
  if (fs.existsSync(TEAM_FILE)) {
    try {
      teamConfig = JSON.parse(fs.readFileSync(TEAM_FILE, 'utf8'));
    } catch (e) {
      console.error('❌ Failed to parse agency-team.json:', e.message);
      teamConfig = createDefaultTeam();
    }
  } else {
    teamConfig = createDefaultTeam();
    saveTeam();
    console.log('👥 Created default agency-team.json');
  }
  return teamConfig;
}

function createDefaultTeam() {
  return {
    agency: 'OpenClaw Agency',
    owner: DEFAULT_OWNER,
    members: [
      {
        npub: DEFAULT_OWNER,
        role: 'owner',
        added: new Date().toISOString()
      }
    ],
    relays: [
      'wss://relay.ditto.pub',
      'wss://relay.primal.net',
      'wss://nos.lol'
    ]
  };
}

function saveTeam() {
  fs.writeFileSync(TEAM_FILE, JSON.stringify(teamConfig, null, 2), { mode: 0o600 });
}

function getTeamConfig() {
  if (!teamConfig) loadTeam();
  return teamConfig;
}

function getTeamMember(npub) {
  const config = getTeamConfig();
  return config.members.find(m => m.npub === npub) || null;
}

function getTeam(user) {
  if (!['owner', 'admin'].includes(user.role)) {
    return { error: 'Insufficient permissions' };
  }
  const config = getTeamConfig();
  return {
    agency: config.agency,
    owner: config.owner,
    members: config.members,
    relays: config.relays
  };
}

function addMember(user, body) {
  if (!['owner', 'admin'].includes(user.role)) {
    return { error: 'Insufficient permissions' };
  }

  const { npub, role } = body;
  if (!npub || !npub.startsWith('npub1')) {
    return { error: 'Invalid npub' };
  }

  const validRoles = user.role === 'owner' ? ['admin', 'viewer'] : ['viewer'];
  if (!validRoles.includes(role)) {
    return { error: `Invalid role. Allowed: ${validRoles.join(', ')}` };
  }

  const config = getTeamConfig();
  if (config.members.find(m => m.npub === npub)) {
    return { error: 'Member already exists' };
  }

  const member = {
    npub,
    role,
    added: new Date().toISOString(),
    addedBy: user.sub
  };

  config.members.push(member);
  saveTeam();
  console.log(`👤 Added team member: ${npub} as ${role} (by ${user.sub})`);

  return { ok: true, member };
}

function removeMember(user, npub) {
  if (!['owner', 'admin'].includes(user.role)) {
    return { error: 'Insufficient permissions' };
  }

  const config = getTeamConfig();

  // Can't remove owner
  if (npub === config.owner) {
    return { error: 'Cannot remove the owner' };
  }

  const member = config.members.find(m => m.npub === npub);
  if (!member) {
    return { error: 'Member not found' };
  }

  // Admins can't remove other admins
  if (user.role === 'admin' && member.role === 'admin') {
    return { error: 'Admins cannot remove other admins' };
  }

  config.members = config.members.filter(m => m.npub !== npub);
  saveTeam();
  console.log(`👤 Removed team member: ${npub} (by ${user.sub})`);

  return { ok: true };
}

function updateMember(user, npub, body) {
  if (user.role !== 'owner') {
    return { error: 'Only the owner can change roles' };
  }

  const config = getTeamConfig();
  const member = config.members.find(m => m.npub === npub);
  if (!member) {
    return { error: 'Member not found' };
  }

  if (npub === config.owner) {
    return { error: 'Cannot change owner role via API' };
  }

  const { role } = body;
  if (!['admin', 'viewer'].includes(role)) {
    return { error: 'Invalid role' };
  }

  member.role = role;
  saveTeam();
  console.log(`👤 Updated role for ${npub} to ${role} (by ${user.sub})`);

  return { ok: true, member };
}

function initDefault() {
  if (fs.existsSync(TEAM_FILE)) {
    console.log('agency-team.json already exists');
    return;
  }
  teamConfig = createDefaultTeam();
  saveTeam();
  console.log('✅ Created agency-team.json with default owner');
}

// Load on require
loadTeam();

module.exports = {
  getTeamConfig,
  getTeamMember,
  getTeam,
  addMember,
  removeMember,
  updateMember,
  initDefault
};
