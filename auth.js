const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SECRET_FILE = path.join(__dirname, '.session-secret');
let SESSION_SECRET = null;

function getSecret() {
  if (SESSION_SECRET) return SESSION_SECRET;
  if (fs.existsSync(SECRET_FILE)) {
    SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } else {
    SESSION_SECRET = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, SESSION_SECRET, { mode: 0o600 });
    console.log('🔑 Generated new session secret');
  }
  return SESSION_SECRET;
}

// Store active challenges (nonce → timestamp) for replay protection
const challenges = new Map();
const CHALLENGE_TTL = 60000; // 60 seconds

// Clean up expired challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [nonce, ts] of challenges) {
    if (now - ts > CHALLENGE_TTL) challenges.delete(nonce);
  }
}, 30000);

function handleChallenge(params, req, res) {
  const nonce = crypto.randomBytes(16).toString('hex');
  challenges.set(nonce, Date.now());

  const challengeEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', 'http://localhost:7700/api/auth/verify'],
      ['method', 'POST'],
      ['payload', crypto.createHash('sha256').update('').digest('hex')],
      ['nonce', nonce]
    ],
    content: ''
  };

  return { event: challengeEvent };
}

async function handleVerify(params, req, res) {
  const { getTeamMember } = require('./team');

  let body = req.body;
  if (!body || !body.event) {
    res.statusCode = 400;
    return { error: 'Missing signed event' };
  }

  const event = body.event;

  // Validate kind
  if (event.kind !== 27235) {
    res.statusCode = 401;
    return { error: 'Invalid event kind' };
  }

  // Validate timestamp (within 60 seconds)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > 60) {
    res.statusCode = 401;
    return { error: 'Challenge expired' };
  }

  // Validate URL tag
  const uTag = event.tags?.find(t => t[0] === 'u');
  if (!uTag || !uTag[1].includes('/api/auth/verify')) {
    res.statusCode = 401;
    return { error: 'Invalid URL tag' };
  }

  // Validate nonce
  const nonceTag = event.tags?.find(t => t[0] === 'nonce');
  if (!nonceTag || !challenges.has(nonceTag[1])) {
    res.statusCode = 401;
    return { error: 'Invalid or expired nonce' };
  }
  challenges.delete(nonceTag[1]); // One-time use

  // Verify signature using nostr-tools
  try {
    const { verifyEvent } = require('nostr-tools/pure');
    if (!verifyEvent(event)) {
      res.statusCode = 401;
      return { error: 'Invalid signature' };
    }
  } catch (e) {
    res.statusCode = 401;
    return { error: 'Signature verification failed' };
  }

  // Extract pubkey and check team membership
  const pubkey = event.pubkey;
  const { nip19 } = require('nostr-tools');
  const npub = nip19.npubEncode(pubkey);

  const member = getTeamMember(npub);
  if (!member) {
    res.statusCode = 403;
    return { error: 'Not a team member' };
  }

  // Create JWT
  const secret = getSecret();
  const token = jwt.sign(
    { sub: npub, pubkey, role: member.role },
    secret,
    { expiresIn: '24h' }
  );

  // Set cookie
  res.setHeader('Set-Cookie', cookie.serialize('dashboard_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86400,
    path: '/'
  }));

  // Fetch profile
  const { getProfile } = require('./profiles');
  const profile = await getProfile(npub);

  return { token, profile, role: member.role, npub };
}

function handleLogout(params, req, res) {
  res.setHeader('Set-Cookie', cookie.serialize('dashboard_session', '', {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/'
  }));
  return { ok: true };
}

async function handleMe(params, req, res) {
  const { getProfile } = require('./profiles');
  const profile = await getProfile(req.user.sub);
  return {
    npub: req.user.sub,
    pubkey: req.user.pubkey,
    role: req.user.role,
    profile
  };
}

function requireAuth(req, res) {
  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  const token = cookies.dashboard_session
    || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

  if (!token) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return false;
  }

  try {
    const secret = getSecret();
    const payload = jwt.verify(token, secret);
    req.user = payload;
    return true;
  } catch (e) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Session expired' }));
    return false;
  }
}

function requireRole(req, res, ...roles) {
  if (!req.user || !roles.includes(req.user.role)) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: 'Insufficient permissions' }));
    return false;
  }
  return true;
}

// Initialize secret on load
getSecret();

module.exports = {
  handleChallenge,
  handleVerify,
  handleLogout,
  handleMe,
  requireAuth,
  requireRole
};
