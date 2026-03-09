// Nostr profile fetcher with file-based cache (1-hour TTL)
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '.profile-cache.json');
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let profileCache = new Map();

// Load cache from file on startup
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const now = Date.now();
      for (const [key, entry] of Object.entries(data)) {
        if (now - entry.fetchedAt < CACHE_TTL) {
          profileCache.set(key, entry);
        }
      }
      console.log(`📎 Loaded ${profileCache.size} cached profiles from disk`);
    }
  } catch (e) {
    console.error('Profile cache load failed:', e.message);
  }
}

// Save cache to file
function saveCacheToFile() {
  try {
    const data = {};
    for (const [key, entry] of profileCache) {
      data[key] = entry;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Profile cache save failed:', e.message);
  }
}

async function getProfile(npub) {
  const { nip19 } = require('nostr-tools');
  let pubkey;
  try {
    const decoded = nip19.decode(npub);
    pubkey = decoded.data;
  } catch (e) {
    return { npub, name: npub.slice(0, 12) + '...' };
  }

  const cached = profileCache.get(pubkey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.profile;
  }

  try {
    const { getTeamConfig } = require('./team');
    const config = getTeamConfig();
    const relays = config.relays || ['wss://relay.ditto.pub', 'wss://relay.primal.net'];

    const { SimplePool } = require('nostr-tools/pool');
    const pool = new SimplePool();

    const event = await Promise.race([
      pool.get(relays, { kinds: [0], authors: [pubkey] }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);

    pool.close(relays);

    if (event) {
      const content = JSON.parse(event.content);
      const profile = {
        npub,
        pubkey,
        name: content.name || content.display_name || npub.slice(0, 12) + '...',
        display_name: content.display_name || content.name || '',
        picture: content.picture || null,
        about: content.about || '',
        nip05: content.nip05 || null,
        lud16: content.lud16 || null
      };
      profileCache.set(pubkey, { profile, fetchedAt: Date.now() });
      saveCacheToFile();
      return profile;
    }
  } catch (e) {
    // Relay fetch failed — return fallback
  }

  const fallback = {
    npub,
    pubkey,
    name: npub.slice(0, 12) + '...',
    display_name: '',
    picture: null,
    about: '',
    nip05: null,
    lud16: null
  };
  profileCache.set(pubkey, { profile: fallback, fetchedAt: Date.now() });
  saveCacheToFile();
  return fallback;
}

/**
 * Batch fetch profiles for multiple npubs
 */
async function batchFetchProfiles(npubs) {
  const results = [];
  for (const npub of npubs) {
    try {
      const profile = await getProfile(npub);
      results.push(profile);
    } catch (e) {
      results.push({ npub, name: npub.slice(0, 12) + '...' });
    }
  }
  return results;
}

/**
 * Get cache stats
 */
function getProfileCacheStats() {
  return {
    size: profileCache.size,
    cacheFile: CACHE_FILE,
    exists: fs.existsSync(CACHE_FILE)
  };
}

// Load cache on startup
loadCacheFromFile();

module.exports = { getProfile, batchFetchProfiles, getProfileCacheStats };
