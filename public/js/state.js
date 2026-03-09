// Simple reactive state store

class Store {
  constructor() {
    this.state = {
      user: null,        // { npub, pubkey, role, profile }
      overview: null,    // { divisions, totalIssues, openIssues, closedIssues }
      activity: [],
      agents: [],
      epics: [],
      team: null,
      currentView: 'overview',
      connected: false,
      lastUpdate: null
    };
    this.listeners = new Map();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
    this.notify(key, value);
  }

  update(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.state[key] = value;
    }
    for (const key of Object.keys(updates)) {
      this.notify(key, this.state[key]);
    }
  }

  on(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  }

  notify(key, value) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(value); } catch (e) { console.error('Store listener error:', e); }
      }
    }
  }
}

export const store = new Store();
