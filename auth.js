const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const WebSocket = require('ws');

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

// NIP-46 Nostr Connect sessions: sessionId → { challenge, nonce, createdAt, result, tempSecretKey, tempPubkey }
const nip46Sessions = new Map();
const NIP46_RELAY = 'wss://relay.ditto.pub';
const NIP46_TIMEOUT = 60000; // 60 seconds

// Clean up expired challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [nonce, ts] of challenges) {
    if (now - ts > CHALLENGE_TTL) challenges.delete(nonce);
  }
  // Clean up expired NIP-46 sessions
  for (const [sessionId, session] of nip46Sessions) {
    if (now - session.createdAt > NIP46_TIMEOUT + 10000) {
      nip46Sessions.delete(sessionId);
    }
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

// --- NIP-46 Nostr Connect ---

async function handleNostrConnectInit(params, req, res) {
  const { generateSecretKey, getPublicKey } = require('nostr-tools/pure');

  // Generate a temporary keypair for this NIP-46 session
  const tempSk = generateSecretKey();
  const tempPkHex = getPublicKey(tempSk);
  const tempSkHex = Buffer.from(tempSk).toString('hex');

  // Generate challenge nonce
  const nonce = crypto.randomBytes(16).toString('hex');
  challenges.set(nonce, Date.now());

  const sessionId = crypto.randomBytes(16).toString('hex');

  const session = {
    nonce,
    createdAt: Date.now(),
    tempSecretKey: tempSkHex,
    tempPubkey: tempPkHex,
    result: null, // will hold { signedEvent } when complete
    status: 'pending', // pending | connected | complete | error
    remoteSignerPubkey: null
  };

  nip46Sessions.set(sessionId, session);

  // Build the nostrconnect:// URI
  // Format: nostrconnect://<client-pubkey>?relay=<relay>&metadata=<json>
  const metadata = JSON.stringify({
    name: 'OpenClaw Agency Dashboard',
    description: 'Sign in to the OpenClaw Agency Dashboard',
    url: 'http://localhost:7700'
  });
  const connectUri = `nostrconnect://${tempPkHex}?relay=${encodeURIComponent(NIP46_RELAY)}&metadata=${encodeURIComponent(metadata)}`;

  // Start listening on relay for NIP-46 responses
  subscribeNip46(sessionId, session, nonce);

  return {
    sessionId,
    connectUri,
    relay: NIP46_RELAY,
    expiresIn: NIP46_TIMEOUT / 1000
  };
}

function subscribeNip46(sessionId, session, nonce) {
  let ws;
  let closed = false;

  const cleanup = () => {
    closed = true;
    if (ws && ws.readyState <= 1) {
      try { ws.close(); } catch {}
    }
  };

  // Timeout
  const timeout = setTimeout(() => {
    if (session.status === 'pending') {
      session.status = 'timeout';
    }
    cleanup();
  }, NIP46_TIMEOUT + 5000);

  try {
    ws = new WebSocket(NIP46_RELAY);

    ws.on('open', () => {
      if (closed) return;
      // Subscribe for kind 24133 events (NIP-46 responses) addressed to our temp pubkey
      const subId = `nip46-${sessionId.slice(0, 8)}`;
      const filter = {
        kinds: [24133],
        '#p': [session.tempPubkey],
        since: Math.floor(Date.now() / 1000) - 10
      };
      ws.send(JSON.stringify(['REQ', subId, filter]));
    });

    ws.on('message', async (data) => {
      if (closed) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] !== 'EVENT' || !msg[2]) return;

        const event = msg[2];
        if (event.kind !== 24133) return;

        // Decrypt the NIP-46 message (NIP-04 encrypted)
        const { decrypt } = require('nostr-tools/nip04');
        const skUint8 = Uint8Array.from(Buffer.from(session.tempSecretKey, 'hex'));
        const content = decrypt(skUint8, event.pubkey, event.content);
        // Handle both sync (string) and async (promise) return
        const decrypted = typeof content === 'string' ? content : await content;
        const nip46msg = JSON.parse(decrypted);

        if (nip46msg.method === 'connect') {
          // Remote signer is connecting — send sign_event request
          session.status = 'connected';
          session.remoteSignerPubkey = event.pubkey;

          // Build the challenge event for signing
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

          // Send sign_event request
          const requestId = crypto.randomBytes(8).toString('hex');
          const { encrypt } = require('nostr-tools/nip04');
          const { finalizeEvent } = require('nostr-tools/pure');
          const requestMsg = JSON.stringify({
            id: requestId,
            method: 'sign_event',
            params: [JSON.stringify(challengeEvent)]
          });

          const skUint8 = Uint8Array.from(Buffer.from(session.tempSecretKey, 'hex'));
          const encResult = encrypt(skUint8, event.pubkey, requestMsg);
          const encrypted = typeof encResult === 'string' ? encResult : await encResult;
          const responseEvent = finalizeEvent({
            kind: 24133,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', event.pubkey]],
            content: encrypted
          }, skUint8);

          ws.send(JSON.stringify(['EVENT', responseEvent]));

        } else if (nip46msg.result && session.status === 'connected') {
          // Got the signed event back
          try {
            const signedEvent = JSON.parse(nip46msg.result);
            const { verifyEvent } = require('nostr-tools/pure');
            if (verifyEvent(signedEvent)) {
              session.result = { signedEvent };
              session.status = 'complete';
            } else {
              session.status = 'error';
              session.error = 'Invalid signature';
            }
          } catch (e) {
            session.status = 'error';
            session.error = 'Failed to parse signed event';
          }
          cleanup();
          clearTimeout(timeout);
        }
      } catch (e) {
        console.error('NIP-46 message error:', e.message);
      }
    });

    ws.on('error', (err) => {
      console.error('NIP-46 relay error:', err.message);
      if (session.status === 'pending') {
        session.status = 'error';
        session.error = 'Relay connection failed';
      }
      cleanup();
      clearTimeout(timeout);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
    });
  } catch (e) {
    console.error('NIP-46 subscribe error:', e.message);
    session.status = 'error';
    session.error = 'Failed to connect to relay';
    clearTimeout(timeout);
  }
}

async function handleNostrConnectPoll(params, req, res) {
  const { getTeamMember } = require('./team');

  let body = req.body;
  const sessionId = body?.sessionId;

  if (!sessionId || !nip46Sessions.has(sessionId)) {
    res.statusCode = 400;
    return { error: 'Invalid or expired session' };
  }

  const session = nip46Sessions.get(sessionId);

  if (session.status === 'pending' || session.status === 'connected') {
    return { status: session.status };
  }

  if (session.status === 'timeout') {
    nip46Sessions.delete(sessionId);
    return { status: 'timeout', error: 'Connection timed out' };
  }

  if (session.status === 'error') {
    nip46Sessions.delete(sessionId);
    return { status: 'error', error: session.error || 'Unknown error' };
  }

  if (session.status === 'complete' && session.result?.signedEvent) {
    const signedEvent = session.result.signedEvent;
    nip46Sessions.delete(sessionId);

    // Consume the nonce
    challenges.delete(session.nonce);

    // Check team membership
    const pubkey = signedEvent.pubkey;
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

    return { status: 'complete', token, profile, role: member.role, npub };
  }

  return { status: session.status };
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
  handleNostrConnectInit,
  handleNostrConnectPoll,
  requireAuth,
  requireRole
};
