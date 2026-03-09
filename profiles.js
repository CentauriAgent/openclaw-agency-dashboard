const profileCache = new Map(); // pubkey → { profile, fetchedAt }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
  return fallback;
}

module.exports = { getProfile };
