// ICML — Shared GitHub API helpers

const icmlGh = (function () {
  'use strict';

  const gh = JSON.parse(sessionStorage.getItem('icml_gh') || '{}');
  const base = `https://api.github.com/repos/${gh.owner}/${gh.repo}`;

  function api(path, options = {}) {
    return fetch(`${base}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${gh.token}`,
        Accept: 'application/vnd.github.v3+json',
        ...options.headers
      }
    });
  }

  function decodeBase64UTF8(base64) {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function loadCafes() {
    try {
      const res = await api('/contents/data/cafes.json');
      if (res.ok) return JSON.parse(decodeBase64UTF8((await res.json()).content));
    } catch {}
    return [];
  }

  async function commitFile(path, content, message, isBase64 = false) {
    const shaRes = await api(`/contents/${path}`);
    const sha = shaRes.ok ? (await shaRes.json()).sha : null;
    const body = {
      message,
      content: isBase64 ? content : btoa(unescape(encodeURIComponent(content)))
    };
    if (sha) body.sha = sha;
    const res = await api(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Failed to commit ${path}`);
    return res.json();
  }

  function imageUrl(path) {
    if (!path || path.startsWith('http')) return path;
    return `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/main/${path}`;
  }

  return { api, loadCafes, commitFile, imageUrl };
})();
