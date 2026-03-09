// API wrapper with auth handling

class API {
  constructor() {
    this.baseUrl = '';
  }

  async request(path, options = {}) {
    const res = await fetch(this.baseUrl + path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (res.status === 401) {
      // Session expired — trigger re-login
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return res.json();
  }

  get(path) {
    return this.request(path);
  }

  post(path, body) {
    const opts = { method: 'POST' };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    return this.request(path, opts);
  }

  patch(path, body) {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  delete(path) {
    return this.request(path, { method: 'DELETE' });
  }
}

export const api = new API();
