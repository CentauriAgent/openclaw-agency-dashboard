// Settings view — team management, audit log, division access

import { api } from '../api.js';
import { store } from '../state.js';
import { logout, clearStoredNsec, getStoredNsec } from '../auth.js';

const DIVISIONS = [
  { id: 'engineering', name: 'Engineering', emoji: '🏗️' },
  { id: 'design', name: 'Design', emoji: '🎨' },
  { id: 'marketing', name: 'Marketing', emoji: '📣' },
  { id: 'product', name: 'Product', emoji: '📦' },
  { id: 'project-management', name: 'PM', emoji: '🎬' },
  { id: 'testing', name: 'Testing', emoji: '🧪' },
  { id: 'operations', name: 'Operations', emoji: '🛟' }
];

export function renderSettings(container) {
  const user = store.get('user');
  const team = store.get('team');

  if (!user || !['owner', 'admin'].includes(user.role)) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <div class="empty-state-text">Access Restricted</div>
        <div class="empty-state-sub">Only owners and admins can access settings</div>
      </div>
    `;
    return;
  }

  const members = team?.members || [];
  const isOwner = user.role === 'owner';

  container.innerHTML = `
    <div class="view-header"><h2 class="view-title">⚙️ Settings</h2></div>

    <div class="settings-section">
      <h3 class="settings-section-title">👥 Team Members</h3>
      <div id="member-list">
        ${members.map(m => renderMember(m, user)).join('')}
      </div>
      <div class="add-member-form" style="margin-top: var(--space-md);">
        <span style="font-size: 16px; padding: 8px;">+</span>
        <input type="text" id="add-npub" placeholder="npub1... or NIP-05 address" />
        <select id="add-role">
          <option value="viewer">👁️ Viewer</option>
          ${isOwner ? '<option value="admin">🛡️ Admin</option>' : ''}
        </select>
        <button class="btn btn-primary btn-sm" id="btn-add-member">Add ✓</button>
      </div>
      <div id="member-error" style="display:none; margin-top: var(--space-sm); color: var(--status-blocked); font-size: 13px;"></div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section-title">🔗 Session Info</h3>
      <div class="session-info">
        <div><strong>Logged in as:</strong> ${user.profile?.name || user.profile?.display_name || user.npub}</div>
        <div><strong>NPub:</strong> <span class="mono">${user.npub}</span></div>
        <div><strong>Role:</strong> ${getRoleBadgeHTML(user.role)}</div>
        <div><strong>Auth method:</strong> ${user.authMethod === 'nsec' ? '🔐 nsec' : user.authMethod === 'nip46' ? '📱 Nostr Connect' : '🔑 Extension'}</div>
        ${getStoredNsec() ? `
        <div style="margin-top: var(--space-sm);">
          <button class="btn btn-ghost btn-sm" id="btn-clear-nsec">🗑️ Clear Stored Key</button>
          <span style="font-size: 12px; color: var(--text-muted); margin-left: var(--space-xs);">nsec is in sessionStorage</span>
        </div>
        ` : ''}
        <div style="margin-top: var(--space-md);">
          <button class="btn btn-danger btn-sm" id="btn-settings-logout">🔓 Logout</button>
        </div>
      </div>
    </div>

    ${isOwner ? `
    <div class="settings-section">
      <h3 class="settings-section-title">📋 Audit Log</h3>
      <div id="audit-log-container">
        <button class="btn btn-secondary btn-sm" id="btn-load-audit">Load Audit Log</button>
      </div>
    </div>
    ` : ''}
  `;

  // Event handlers
  container.querySelector('#btn-add-member')?.addEventListener('click', handleAddMember);
  container.querySelector('#btn-settings-logout')?.addEventListener('click', handleLogout);
  container.querySelector('#btn-clear-nsec')?.addEventListener('click', () => {
    clearStoredNsec();
    renderSettings(container);
  });

  container.querySelector('#btn-load-audit')?.addEventListener('click', loadAuditLog);

  // Remove and role change handlers
  container.querySelectorAll('.btn-remove-member').forEach(btn => {
    btn.addEventListener('click', () => handleRemoveMember(btn.dataset.npub));
  });

  container.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', (e) => handleRoleChange(sel.dataset.npub, e.target.value));
  });
}

function renderMember(member, currentUser) {
  const isOwner = currentUser.role === 'owner';
  const isSelf = member.npub === currentUser.npub;
  const canModify = !isSelf && member.role !== 'owner' && (isOwner || (currentUser.role === 'admin' && member.role === 'viewer'));

  return `
    <div class="member-card">
      <div class="member-avatar" style="display: flex; align-items: center; justify-content: center; font-size: 18px; background: var(--accent-glow); color: var(--accent-bright);">
        ${member.npub.slice(5, 7).toUpperCase()}
      </div>
      <div class="member-info">
        <div class="member-name">${member.displayName || member.npub.slice(0, 20) + '...'}</div>
        <div class="member-npub">${member.npub}</div>
      </div>
      <div class="member-actions">
        ${getRoleBadgeHTML(member.role)}
        ${canModify && isOwner ? `
          <select class="role-select" data-npub="${member.npub}" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-primary); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 12px;">
            <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        ` : ''}
        ${canModify ? `<button class="btn btn-ghost btn-sm btn-remove-member" data-npub="${member.npub}" title="Remove member">×</button>` : ''}
      </div>
    </div>
  `;
}

function getRoleBadgeHTML(role) {
  const icons = { owner: '👑', admin: '🛡️', viewer: '👁️' };
  return `<span class="role-badge role-badge--${role}">${icons[role] || ''} ${role}</span>`;
}

async function handleAddMember() {
  const npubInput = document.getElementById('add-npub');
  const roleInput = document.getElementById('add-role');
  const errorEl = document.getElementById('member-error');
  const npub = npubInput.value.trim();
  const role = roleInput.value;

  if (!npub) return;

  errorEl.style.display = 'none';
  try {
    const result = await api.post('/api/team/members', { npub, role });
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
      return;
    }
    npubInput.value = '';
    await refreshTeam();
  } catch (e) {
    errorEl.textContent = e.data?.error || e.message;
    errorEl.style.display = 'block';
  }
}

async function handleRemoveMember(npub) {
  if (!confirm(`Remove team member ${npub.slice(0, 20)}...?`)) return;
  try {
    await api.delete(`/api/team/members/${encodeURIComponent(npub)}`);
    await refreshTeam();
  } catch (e) {
    alert(e.data?.error || e.message);
  }
}

async function handleRoleChange(npub, role) {
  try {
    await api.patch(`/api/team/members/${encodeURIComponent(npub)}`, { role });
    await refreshTeam();
  } catch (e) {
    alert(e.data?.error || e.message);
  }
}

async function handleLogout() {
  await logout();
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

async function refreshTeam() {
  try {
    const team = await api.get('/api/team');
    store.set('team', team);
    const container = document.getElementById('view-settings');
    renderSettings(container);
  } catch {}
}

async function loadAuditLog() {
  const container = document.getElementById('audit-log-container');
  if (!container) return;

  container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Loading...</div>';

  try {
    const result = await api.get('/api/audit?limit=50');
    const entries = result.entries || [];

    if (entries.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No audit entries yet.</div>';
      return;
    }

    container.innerHTML = `
      <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        ${entries.map(e => `
          <div style="padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); font-size: 12px; display: flex; gap: var(--space-md);">
            <span class="mono" style="color: var(--text-muted); flex-shrink: 0; width: 130px;">${new Date(e.timestamp).toLocaleString()}</span>
            <span style="width: 50px; color: ${e.category === 'auth' ? 'var(--accent-bright)' : 'var(--status-deferred)'}; font-weight: 500;">${e.category}</span>
            <span style="flex: 1; color: var(--text-primary);">${e.action}</span>
            <span style="color: var(--text-muted);">${e.npub ? e.npub.slice(0, 16) + '...' : e.by ? e.by.slice(0, 16) + '...' : ''}</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--status-blocked); font-size: 13px;">Failed to load audit log: ${e.message}</div>`;
  }
}

export function initSettings() {
  const container = document.getElementById('view-settings');
  store.on('team', () => {
    if (store.get('currentView') === 'settings') {
      renderSettings(container);
    }
  });
}
