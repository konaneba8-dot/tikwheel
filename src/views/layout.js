import { APP_NAME } from '../config.js';

export function renderLayout({ title, page, roundId = '', user = null, content = '' }) {
  const userLabel = user ? `${user.fullName} (${user.role})` : 'Guest';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${escapeHtml(title || APP_NAME)}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body data-page="${escapeHtml(page)}" data-round-id="${escapeHtml(roundId || '')}" data-user-role="${escapeHtml(user?.role || '')}">
    <div class="app-shell">
      <header class="topbar">
        <div>
          <div class="brand">${APP_NAME}</div>
          <div class="brand-subtitle">Live rounds, verified winners, dynamic wheel</div>
        </div>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/wallet">Wallet</a>
          <a href="/live">Live</a>
          <a href="/history">History</a>
          <a href="/audit">Audit</a>
          <a href="/terms">Terms</a>
          <a href="/game-rules">Game Rules</a>
          <a href="/admin">Admin</a>
          <a href="/login">Login</a>
        </nav>
        <div class="topbar-tools">
          <label class="language-select">
            <span>Language</span>
            <select id="language-select" aria-label="Language">
              <option value="en">English</option>
              <option value="am">አማርኛ</option>
              <option value="om">Afaan Oromoo</option>
              <option value="so">Af-Soomaali</option>
              <option value="ti">ትግርኛ</option>
            </select>
          </label>
          <div class="user-pill">${escapeHtml(userLabel)}</div>
        </div>
      </header>
      <main class="page-shell">
        <div id="app" class="app-root">${content}</div>
      </main>
    </div>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
