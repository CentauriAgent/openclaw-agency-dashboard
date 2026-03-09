// Client-side authentication — NIP-07, NIP-46, nsec

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

// --- NIP-07: Browser Extension Login ---

export async function loginWithExtension() {
  if (!window.nostr) {
    throw new Error('No Nostr extension detected. Install nos2x, Alby, or another NIP-07 extension.');
  }

  const { event: challenge } = await api.post('/api/auth/challenge');
  const pubkey = await window.nostr.getPublicKey();
  const eventToSign = { ...challenge, pubkey };
  const signedEvent = await window.nostr.signEvent(eventToSign);
  const result = await api.post('/api/auth/verify', { event: signedEvent });

  store.set('user', {
    npub: result.npub,
    pubkey: signedEvent.pubkey,
    role: result.role,
    profile: result.profile
  });

  return result;
}

// --- nsec: Direct Key Login (client-side only) ---

export async function loginWithNsec(nsecOrHex) {
  // Import nostr-tools from CDN (loaded in index.html)
  const nostrTools = window.NostrTools;
  if (!nostrTools) {
    throw new Error('Nostr tools library not loaded');
  }

  let secretKeyBytes;
  let pubkeyHex;

  try {
    if (nsecOrHex.startsWith('nsec1')) {
      // Decode nsec
      const decoded = nostrTools.nip19.decode(nsecOrHex);
      if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
      secretKeyBytes = decoded.data;
    } else {
      // Treat as hex
      secretKeyBytes = hexToBytes(nsecOrHex);
    }

    pubkeyHex = nostrTools.getPublicKey(secretKeyBytes);
  } catch (e) {
    throw new Error('Invalid secret key. Please check and try again.');
  }

  // Get challenge from server
  const { event: challenge } = await api.post('/api/auth/challenge');

  // Build and sign the event client-side
  const eventToSign = {
    ...challenge,
    pubkey: pubkeyHex
  };

  const signedEvent = nostrTools.finalizeEvent(eventToSign, secretKeyBytes);

  // Send only the signed event (nsec never leaves the browser)
  const result = await api.post('/api/auth/verify', { event: signedEvent });

  // Optionally store in sessionStorage
  try {
    sessionStorage.setItem('dashboard_nsec', nsecOrHex);
  } catch {}

  store.set('user', {
    npub: result.npub,
    pubkey: pubkeyHex,
    role: result.role,
    profile: result.profile,
    authMethod: 'nsec'
  });

  return result;
}

// Helper: hex string to Uint8Array
function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function clearStoredNsec() {
  try { sessionStorage.removeItem('dashboard_nsec'); } catch {}
}

export function getStoredNsec() {
  try { return sessionStorage.getItem('dashboard_nsec'); } catch { return null; }
}

// --- NIP-46: Nostr Connect Login ---

export async function loginWithNostrConnect(onStatusUpdate) {
  // 1. Init session on server
  const initResult = await api.post('/api/auth/nostr-connect/init');
  const { sessionId, connectUri, expiresIn } = initResult;

  if (onStatusUpdate) {
    onStatusUpdate({ status: 'show-qr', connectUri, expiresIn });
  }

  // 2. Poll for completion
  const pollInterval = 2000;
  const maxPolls = Math.ceil((expiresIn * 1000) / pollInterval);

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    const pollResult = await api.post('/api/auth/nostr-connect/poll', { sessionId });

    if (pollResult.status === 'connected') {
      if (onStatusUpdate) onStatusUpdate({ status: 'connected' });
      continue;
    }

    if (pollResult.status === 'complete') {
      store.set('user', {
        npub: pollResult.npub,
        pubkey: pollResult.pubkey,
        role: pollResult.role,
        profile: pollResult.profile,
        authMethod: 'nip46'
      });
      return pollResult;
    }

    if (pollResult.status === 'timeout') {
      throw new Error('Connection timed out. Please try again.');
    }

    if (pollResult.status === 'error') {
      throw new Error(pollResult.error || 'Connection failed');
    }
  }

  throw new Error('Connection timed out. Please try again.');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Logout ---

export async function logout() {
  clearStoredNsec();
  try {
    await api.post('/api/auth/logout');
  } catch {}
  store.set('user', null);
}

// --- Login Page Init ---

export function initLoginPage() {
  const errorEl = document.getElementById('login-error');
  const loadingEl = document.getElementById('login-loading');
  const loadingText = document.getElementById('login-loading-text');

  // --- NIP-07 Extension ---
  const btnNip07 = document.getElementById('btn-nip07');
  const extensionDetected = !!window.nostr;

  if (!extensionDetected) {
    btnNip07.classList.add('btn-secondary');
    btnNip07.classList.remove('btn-primary');
    btnNip07.innerHTML = '🔑 Login with Extension <span class="btn-sub">(not detected)</span>';
    // Re-check after extensions load
    setTimeout(() => {
      if (window.nostr) {
        btnNip07.classList.add('btn-primary');
        btnNip07.classList.remove('btn-secondary');
        btnNip07.innerHTML = '🔑 Login with Extension <span class="btn-sub">(NIP-07) ✓ Recommended</span>';
        document.getElementById('nip07-badge')?.classList.add('visible');
      }
    }, 1500);
  } else {
    btnNip07.innerHTML = '🔑 Login with Extension <span class="btn-sub">(NIP-07) ✓ Recommended</span>';
  }

  btnNip07.addEventListener('click', async () => {
    if (!window.nostr) {
      showError('No Nostr extension detected. Please install nos2x, Alby, or another NIP-07 compatible extension.');
      return;
    }
    hideError();
    showLoading('Signing in with extension...');
    disableAllButtons(true);
    try {
      await loginWithExtension();
      window.dispatchEvent(new CustomEvent('auth:success'));
    } catch (e) {
      showError(e.data?.error || e.message || 'Login failed');
    } finally {
      hideLoading();
      disableAllButtons(false);
    }
  });

  // --- NIP-46 Nostr Connect ---
  const btnNip46 = document.getElementById('btn-nip46');
  const nip46Section = document.getElementById('nip46-section');
  const nip46QrContainer = document.getElementById('nip46-qr');
  const nip46UriInput = document.getElementById('nip46-uri');
  const nip46Status = document.getElementById('nip46-status');
  const btnNip46Cancel = document.getElementById('btn-nip46-cancel');
  let nip46Active = false;

  btnNip46.addEventListener('click', async () => {
    if (nip46Active) return;
    nip46Active = true;
    hideError();
    disableAllButtons(true);
    nip46Section.style.display = 'block';
    nip46Status.textContent = 'Initializing...';
    nip46Status.className = 'nip46-status';

    try {
      const result = await loginWithNostrConnect((update) => {
        if (update.status === 'show-qr') {
          // Generate QR code
          if (typeof QRCode !== 'undefined') {
            nip46QrContainer.innerHTML = '';
            new QRCode(nip46QrContainer, {
              text: update.connectUri,
              width: 200,
              height: 200,
              colorDark: '#e8e6f0',
              colorLight: '#151520',
              correctLevel: QRCode.CorrectLevel.M
            });
          } else {
            nip46QrContainer.innerHTML = '<div class="nip46-qr-fallback">QR library loading...</div>';
          }
          nip46UriInput.value = update.connectUri;
          nip46Status.textContent = 'Scan QR code with Amber or paste URI in your signer app';
          startCountdown(update.expiresIn, nip46Status);
        } else if (update.status === 'connected') {
          nip46Status.textContent = '✓ Signer connected — waiting for signature...';
          nip46Status.className = 'nip46-status connected';
        }
      });

      // Success
      window.dispatchEvent(new CustomEvent('auth:success'));
    } catch (e) {
      showError(e.data?.error || e.message || 'Nostr Connect failed');
      nip46Section.style.display = 'none';
    } finally {
      nip46Active = false;
      hideLoading();
      disableAllButtons(false);
    }
  });

  btnNip46Cancel?.addEventListener('click', () => {
    nip46Section.style.display = 'none';
    nip46Active = false;
    disableAllButtons(false);
  });

  // Copy URI button
  document.getElementById('btn-copy-uri')?.addEventListener('click', () => {
    const uri = nip46UriInput?.value;
    if (uri) {
      navigator.clipboard.writeText(uri).then(() => {
        const btn = document.getElementById('btn-copy-uri');
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
      });
    }
  });

  // --- nsec Direct Key ---
  const btnNsec = document.getElementById('btn-nsec');
  const nsecSection = document.getElementById('nsec-section');
  const nsecInput = document.getElementById('nsec-input');
  const btnNsecSubmit = document.getElementById('btn-nsec-submit');
  const btnNsecCancel = document.getElementById('btn-nsec-cancel');

  btnNsec.addEventListener('click', () => {
    hideError();
    nsecSection.style.display = 'block';
    nsecInput.focus();
  });

  btnNsecCancel?.addEventListener('click', () => {
    nsecSection.style.display = 'none';
    nsecInput.value = '';
  });

  btnNsecSubmit?.addEventListener('click', () => submitNsec());
  nsecInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNsec();
  });

  async function submitNsec() {
    const nsec = nsecInput.value.trim();
    if (!nsec) {
      showError('Please enter your nsec or hex secret key.');
      return;
    }
    hideError();
    showLoading('Signing in...');
    disableAllButtons(true);
    try {
      await loginWithNsec(nsec);
      nsecInput.value = '';
      window.dispatchEvent(new CustomEvent('auth:success'));
    } catch (e) {
      showError(e.data?.error || e.message || 'Login failed');
    } finally {
      hideLoading();
      disableAllButtons(false);
    }
  }

  // --- Helpers ---
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function hideError() {
    errorEl.style.display = 'none';
  }

  function showLoading(msg) {
    if (loadingText) loadingText.textContent = msg || 'Signing in...';
    loadingEl.style.display = 'flex';
  }

  function hideLoading() {
    loadingEl.style.display = 'none';
  }

  function disableAllButtons(disabled) {
    [btnNip07, btnNip46, btnNsec, btnNsecSubmit].forEach(btn => {
      if (btn) btn.disabled = disabled;
    });
  }

  function startCountdown(seconds, el) {
    let remaining = seconds;
    const base = el.textContent;
    const timer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(timer);
        return;
      }
      el.textContent = `${base} (${remaining}s)`;
    }, 1000);
  }
}
