// Client-side NIP-07 authentication

import { api } from './api.js';
import { store } from './state.js';

export async function checkSession() {
  try {
    const data = await api.get('/api/auth/me');
    store.set('user', data);
    return data;
  } catch {
    store.set('user', null);
    return null;
  }
}

export async function loginWithExtension() {
  // Check for NIP-07 extension
  if (!window.nostr) {
    throw new Error('No Nostr extension detected. Install nos2x, Alby, or another NIP-07 extension.');
  }

  // 1. Get challenge from server
  const { event: challenge } = await api.post('/api/auth/challenge');

  // 2. Get public key from extension
  const pubkey = await window.nostr.getPublicKey();

  // 3. Build the event to sign
  const eventToSign = {
    ...challenge,
    pubkey
  };

  // 4. Sign with extension
  const signedEvent = await window.nostr.signEvent(eventToSign);

  // 5. Verify with server
  const result = await api.post('/api/auth/verify', { event: signedEvent });

  // 6. Store session
  store.set('user', {
    npub: result.npub,
    pubkey: signedEvent.pubkey,
    role: result.role,
    profile: result.profile
  });

  return result;
}

export async function logout() {
  try {
    await api.post('/api/auth/logout');
  } catch {
    // Ignore errors on logout
  }
  store.set('user', null);
}

export function initLoginPage() {
  const errorEl = document.getElementById('login-error');
  const loadingEl = document.getElementById('login-loading');
  const btnNip07 = document.getElementById('btn-nip07');

  // Check if extension is available
  if (!window.nostr) {
    btnNip07.innerHTML = '🔑 No Extension Detected <span class="btn-sub">(Install nos2x or Alby)</span>';
    // Re-check after a moment (extensions may load late)
    setTimeout(() => {
      if (window.nostr) {
        btnNip07.innerHTML = '🔑 Login with Extension <span class="btn-sub">(NIP-07)</span>';
      }
    }, 1000);
  }

  btnNip07.addEventListener('click', async () => {
    if (!window.nostr) {
      showError('No Nostr extension detected. Please install nos2x, Alby, or another NIP-07 compatible extension.');
      return;
    }

    errorEl.style.display = 'none';
    loadingEl.style.display = 'flex';
    btnNip07.disabled = true;

    try {
      await loginWithExtension();
      // Success — app.js will handle the transition
      window.dispatchEvent(new CustomEvent('auth:success'));
    } catch (e) {
      showError(e.data?.error || e.message || 'Login failed');
    } finally {
      loadingEl.style.display = 'none';
      btnNip07.disabled = false;
    }
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
}
