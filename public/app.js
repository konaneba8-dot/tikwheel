import { initI18n, translate, translateError } from './i18n/index.js';
import { buildLiveBroadcastSummary } from './live-broadcast.js';

const app = document.querySelector('#app');
const page = document.body.dataset.page;
const roundId = document.body.dataset.roundId || '';

const state = {
  bootstrap: null,
  round: null,
  roundAudit: null,
  historyRound: null,
  historyAudit: null,
  dashboardFilter: 'all',
  liveMode: localStorage.getItem('tikwheel-live-mode') === 'true',
  liveCountdownTimer: null,
};

initI18n({ onChange: () => renderCurrentPage() });
bindLocalizedValidation();
bootstrap().catch((error) => renderError(error));

async function bootstrap() {
  const response = await fetch('/api/bootstrap', { credentials: 'include' });
  state.bootstrap = await response.json();

  if (page === 'live') {
    state.round = await loadRound(roundId || state.bootstrap.rounds?.[0]?.id);
    renderLive();
    return;
  }

  if (page === 'round') {
    state.round = await loadRound(roundId || state.bootstrap.rounds?.[0]?.id);
    state.roundAudit = await loadRoundAudit(state.round?.id);
    renderRoundDetail();
    return;
  }

  if (page === 'history') {
    renderHistory();
    return;
  }

  if (page === 'history-detail') {
    state.historyRound = await loadRound(roundId || state.bootstrap.rounds?.[0]?.id);
    state.historyAudit = await loadHistoryDetail(roundId || state.bootstrap.rounds?.[0]?.id);
    renderHistoryDetail();
    return;
  }

  if (page === 'dashboard') {
    renderDashboard();
    return;
  }

  if (page === 'wallet') {
    renderWallet();
    return;
  }

  if (page === 'admin') {
    renderAdmin();
    return;
  }

  if (page === 'audit') {
    renderAudit();
    return;
  }

  if (page === 'login') {
    renderLogin();
    return;
  }

  if (page === 'terms') {
    renderTerms();
    return;
  }

  if (page === 'game-rules') {
    renderGameRules();
    return;
  }

  renderHome();
}

function renderCurrentPage() {
  if (!state.bootstrap) return;

  if (page === 'live') {
    renderLive();
    return;
  }

  if (page === 'round') {
    renderRoundDetail();
    return;
  }

  if (page === 'history') {
    renderHistory();
    return;
  }

  if (page === 'history-detail') {
    renderHistoryDetail();
    return;
  }

  if (page === 'dashboard') {
    renderDashboard();
    return;
  }

  if (page === 'admin') {
    renderAdmin();
    return;
  }

  if (page === 'audit') {
    renderAudit();
    return;
  }

  if (page === 'wallet') {
    renderWallet();
    return;
  }

  if (page === 'livestream') {
    renderLivestream();
    return;
  }

  if (page === 'login') {
    renderLogin();
    return;
  }

  if (page === 'terms') {
    renderTerms();
    return;
  }

  if (page === 'game-rules') {
    renderGameRules();
    return;
  }

  renderHome();
}

function bindLocalizedValidation() {
  document.addEventListener(
    'invalid',
    (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      if (field.validity.valueMissing) {
        field.setCustomValidity(translate('Please fill out this field.'));
      } else if (field.validity.typeMismatch) {
        field.setCustomValidity(translate('Please enter a valid value.'));
      } else {
        field.setCustomValidity('');
      }
    },
    true,
  );

  document.addEventListener('input', (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
      field.setCustomValidity('');
    }
  });
}

function renderError(error) {
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">TikWheel</div>
      <h1>Something blocked the UI</h1>
      <p class="muted">${escapeHtml(error?.message || String(error))}</p>
    </section>
  `;
}

async function loadRound(id) {
  if (!id) return null;
  const response = await fetch(`/api/rounds/${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!response.ok) return null;
  return response.json();
}

async function loadRoundAudit(id) {
  if (!id) return null;
  const response = await fetch(`/api/rounds/${encodeURIComponent(id)}/audit`, { credentials: 'include' });
  if (!response.ok) return null;
  return response.json();
}

async function loadHistoryDetail(id) {
  if (!id) return null;
  const response = await fetch(`/api/history/${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!response.ok) return null;
  return response.json();
}

function renderHome() {
  const bootstrap = state.bootstrap;
  const user = bootstrap.user;
  const openRounds = bootstrap.rounds || [];
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Demo / Test Mode</div>
      <h1>Dynamic live wheels with backend-selected winners.</h1>
      <p>TikWheel is built so the number of wheel sections always matches the number of eligible verified players. No fixed 100-slice wheel, no frontend winner choice.</p>
      <div class="hero-actions">
        <a class="primary-btn" href="/live">Open Live Screen</a>
        <a class="ghost-btn" href="/history">Winner History</a>
        <a class="ghost-btn" href="/admin">Admin Dashboard</a>
      </div>
      <div class="metrics">
        <div class="metric"><div class="metric-value">${openRounds.length}</div><div class="metric-label">Rounds in snapshot</div></div>
        <div class="metric"><div class="metric-value">${bootstrap.activeGameTypes.length}</div><div class="metric-label">Active game types</div></div>
        <div class="metric"><div class="metric-value">${bootstrap.winnerHistory.length}</div><div class="metric-label">Winner history items</div></div>
        <div class="metric"><div class="metric-value">${escapeHtml(bootstrap.complianceMode)}</div><div class="metric-label">Compliance mode</div></div>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>${user ? 'Signed in player' : 'Quick login'}</strong>
        ${user ? `<div class="stack"><div>${escapeHtml(user.fullName)}</div><div class="muted">${escapeHtml(user.role)}</div></div>` : `
          <form class="form" id="login-form">
            <div class="row">
              <div class="field"><label>Phone or email</label><input name="identifier" placeholder="player@tikwheel.local" required /></div>
              <div class="field"><label>Password</label><input type="password" name="password" placeholder="Player123!" required /></div>
            </div>
            <button class="primary-btn" type="submit">Login</button>
          </form>`}
      </div>
      <div class="card">
        <strong>Register</strong>
        <form class="form" id="register-form">
          <div class="row">
            <div class="field"><label>Full name</label><input name="fullName" required /></div>
            <div class="field"><label>Phone</label><input name="phone" required /></div>
          </div>
          <div class="row">
            <div class="field"><label>Email</label><input name="email" type="email" /></div>
            <div class="field"><label>Password</label><input name="password" type="password" required /></div>
          </div>
          <div class="row">
            <div class="field"><label>Location</label><input name="location" /></div>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" name="acceptTerms" required />
            <span>I agree to the <a href="/terms">General Terms and Conditions</a>.</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="acceptRules" required />
            <span>I agree to the <a href="/game-rules">Official Game Rules</a>.</span>
          </label>
          <button class="primary-btn" type="submit">Create player account</button>
        </form>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Rounds</div>
          <h2 class="section-title">Active snapshot</h2>
        </div>
        <a class="ghost-btn" href="/dashboard">Open dashboard</a>
      </div>
      <div class="grid cols-2">
        ${openRounds.map(roundCard).join('')}
      </div>
    </section>
  `;
  bindAuthForms();
  bindJoinButtons();
}

function roundCard(round) {
  const verified = round.verifiedPlayerCount || 0;
  const winnerText = round.winners?.length
    ? `Winner: ${round.winners.map((winner) => `Player ${String(winner.position).padStart(2, '0')}`).join(', ')}`
    : 'Winner not selected yet';
  return `
    <div class="card">
      <div class="stack">
        <div class="status ${round.status === 'PENDING' ? 'pending' : ''}">${escapeHtml(round.status)}</div>
        <strong>${escapeHtml(round.number)} ${round.gameType?.name ? `- ${escapeHtml(round.gameType.name)}` : ''}</strong>
        <div class="muted">Players: ${verified}/${round.maxPlayers}</div>
        <div class="muted">Prize: ${escapeHtml(round.prize || '')}</div>
        <div class="muted">${escapeHtml(winnerText)}</div>
        <div class="section-actions">
          <a class="ghost-btn" href="/rounds/${encodeURIComponent(round.id)}">Round details</a>
          <a class="action-btn" href="/live?round=${encodeURIComponent(round.id)}">View live round</a>
        </div>
      </div>
    </div>
  `;
}

function bindAuthForms() {
  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(loginForm);
      await postJson('/api/auth/login', Object.fromEntries(form.entries()));
      location.reload();
    });
  }

  const registerForm = document.querySelector('#register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(registerForm);
      const payload = Object.fromEntries(form.entries());
      payload.acceptTerms = form.get('acceptTerms') === 'on';
      payload.acceptRules = form.get('acceptRules') === 'on';
      await postJson('/api/auth/register', payload);
      location.reload();
    });
  }
}

function bindJoinButtons() {
  const buttons = document.querySelectorAll('[data-join-round]');
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const roundId = button.dataset.joinRound;
      const position = Number(button.dataset.position);
      await postJson(`/api/player/rounds/${encodeURIComponent(roundId)}/join`, { position });
      location.reload();
    });
  });
}

function renderLogin() {
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Access</div>
      <h1>Login or register to join rounds.</h1>
      <p class="muted">Demo users: <strong>player@tikwheel.local / Player123!</strong> and <strong>admin@tikwheel.local / Admin123!</strong></p>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Login</strong>
        <form class="form" id="login-form">
          <div class="row">
            <div class="field"><label>Phone or email</label><input name="identifier" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" required /></div>
          </div>
          <button class="primary-btn" type="submit">Login</button>
        </form>
      </div>
      <div class="card">
        <strong>Register</strong>
        <form class="form" id="register-form">
          <div class="row">
            <div class="field"><label>Full name</label><input name="fullName" required /></div>
            <div class="field"><label>Phone</label><input name="phone" required /></div>
          </div>
          <div class="row">
            <div class="field"><label>Email (Optional)</label><input name="email" type="email" /></div>
            <div class="field"><label>Password</label><input name="password" type="password" required /></div>
          </div>
          <div class="notice">
            <small class="muted">Note: Your account will require admin verification before you can log in. This typically takes 24-48 hours.</small>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" name="acceptTerms" required />
            <span>I agree to the <a href="/terms">General Terms and Conditions</a>.</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="acceptRules" required />
            <span>I agree to the <a href="/game-rules">Official Game Rules</a>.</span>
          </label>
          <button class="primary-btn" type="submit">Create account</button>
        </form>
      </div>
    </section>
  `;
  bindAuthForms();
}

function renderTerms() {
  const legal = state.bootstrap?.legal || {};
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">General Terms</div>
      <h1>TikWheel General Terms and Conditions of Use</h1>
      <p class="muted">Version ${escapeHtml(legal.termsVersion || '1.0')} effective ${escapeHtml(legal.termsEffectiveDate || '2026-07-31')}.</p>
      <div class="hero-actions">
        <a class="primary-btn" href="/login">Create account</a>
        <a class="ghost-btn" href="/game-rules">Game rules</a>
      </div>
    </section>
    <section class="card prose">
      <h2>Important notice</h2>
      <p>By registering, accessing, or using TikWheel, you confirm that you have read these General Terms, agree to be legally bound by them, and are legally permitted to use the platform under applicable law.</p>
      <h2>Regulatory status</h2>
      <p>TikWheel operates only to the extent permitted by applicable law and may restrict or suspend services where legal, technical, or compliance requirements demand it.</p>
      <h2>Account and entries</h2>
      <p>You must provide accurate information, keep your credentials secure, and use entries only as authorized. Entries are valid only when successfully recorded by the system.</p>
      <h2>Winner selection</h2>
      <p>The approved TikWheel selection system selects the winner. No player is guaranteed to win, and personnel do not manually choose winners outside the approved process.</p>
      <h2>Compliance</h2>
      <p>Fraud, unauthorized access, account abuse, payment misuse, and attempts to alter platform results may lead to suspension, invalidation, or other corrective action.</p>
    </section>
  `;
}

function renderGameRules() {
  const legal = state.bootstrap?.legal || {};
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Official Game Rules</div>
      <h1>TikWheel Official Game Rules</h1>
      <p class="muted">100 Players - 100 Numbers format.</p>
      <p class="muted">Version ${escapeHtml(legal.gameRulesVersion || '1.0')} effective ${escapeHtml(legal.gameRulesEffectiveDate || '2026-07-31')}.</p>
      <div class="hero-actions">
        <a class="primary-btn" href="/live">Live screen</a>
        <a class="ghost-btn" href="/terms">General terms</a>
      </div>
    </section>
    <section class="card prose">
      <h2>Game format</h2>
      <p>Each game contains up to 100 available numbers. One valid entry equals one game number, and no two valid entries may hold the same number within the same game.</p>
      <h2>Entry and verification</h2>
      <p>A number becomes a valid entry only after the system successfully records it. Unrecorded, duplicated, invalid, or manipulated entries do not qualify.</p>
      <h2>Official selection</h2>
      <p>The TikWheel selection system randomly selects one eligible game number from the recorded valid entries. The visual wheel is a presentation interface only.</p>
      <h2>Result and disputes</h2>
      <p>The official result is the selected game number, subject to winner verification. Questions or disputes should be raised through the official support channel.</p>
    </section>
  `;
}

function renderLive() {
  const round = state.round;
  if (!round) {
    app.innerHTML = `<section class="hero"><h1>No round selected</h1></section>`;
    return;
  }

  if (state.liveMode) {
    renderLiveBroadcast(round);
    return;
  }

  const winnerLabel = round.winners?.length
    ? `WINNER: ${round.winners.map((winner) => `PLAYER ${String(winner.position).padStart(2, '0')}`).join(', ')}`
    : 'Awaiting draw';
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Live screen</div>
      <h1>${escapeHtml(round.number)} ${escapeHtml(round.gameType?.name || '')}</h1>
      <p class="muted">${round.verifiedPlayerCount}/${round.maxPlayers} players | Prize: ${escapeHtml(round.prize || '')}</p>
      <div class="hero-actions">
        <button class="primary-btn" data-live-toggle="on">LIVE Mode</button>
        <a class="ghost-btn" href="/admin">Admin controls</a>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card wheel-wrap">
        <div class="wheel-stage">
          <div class="wheel-pointer"></div>
          <div class="wheel-spin" id="wheel-spin"></div>
          <div class="wheel-rim"></div>
          <div class="wheel-core"></div>
        </div>
        <div class="winner-banner animate-pop">
          <div class="eyebrow">Result</div>
          <div class="winner-name" id="winner-name">${escapeHtml(winnerLabel)}</div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <strong>Round status</strong>
          <div class="status">${escapeHtml(round.status)}</div>
          <p class="muted">${escapeHtml(round.liveLink || 'No live link configured')}</p>
        </div>
        <div class="card">
          <strong>Player positions</strong>
          <div class="metrics">
            ${(round.availablePositions || []).slice(0, 12).map((position) => `<div class="metric"><div class="metric-value">${position}</div><div class="metric-label">Available</div></div>`).join('')}
          </div>
        </div>
      </div>
    </section>
  `;
  bindLiveModeButton();
  renderWheel(round);
}

function renderLiveBroadcast(round) {
  const summary = buildLiveBroadcastSummary(round, { countdownSeconds: 30, defaultPrize: round.prize || 'Prize pending' });
  const winnerNumber = summary.winnerNumber ?? 'Awaiting draw';
  const joinUrl = `${window.location.origin}/login?round=${encodeURIComponent(round.id || '')}`;
  const gameId = String(round.id || round.number || 'LIVE').slice(0, 12);

  app.innerHTML = `
    <div class="live-broadcast-shell">
      <div class="live-broadcast-frame">
        <div class="live-broadcast-header">
          <div>
            <div class="live-tag">TikTok LIVE</div>
            <div class="live-title">${escapeHtml(round.number || 'LIVE DRAW')}</div>
          </div>
          <div class="live-head-actions">
            <div class="live-countdown-card">
              <span>Countdown</span>
              <strong data-countdown>${summary.countdownSeconds}</strong>
            </div>
            <button class="live-mode-exit" data-live-toggle="off">Exit</button>
          </div>
        </div>

        <div class="live-main-grid">
          <div class="live-wheel-panel">
            <div class="live-wheel-wrapper">
              <div class="wheel-stage live-wheel-stage">
                <div class="wheel-pointer live-wheel-pointer"></div>
                <div class="wheel-spin live-wheel-spin" id="live-wheel-spin"></div>
                <div class="wheel-rim live-wheel-rim"></div>
                <div class="wheel-core live-wheel-core"></div>
              </div>
            </div>
          </div>

          <aside class="live-side-panel">
            <div class="live-stat-grid">
              <div class="live-stat-box">
                <span>Players</span>
                <strong>${summary.totalPlayers}</strong>
              </div>
              <div class="live-stat-box">
                <span>Prize</span>
                <strong>${escapeHtml(summary.currentPrize)}</strong>
              </div>
              <div class="live-stat-box">
                <span>Left</span>
                <strong>${summary.availableNumbers.length}</strong>
              </div>
              <div class="live-stat-box accent">
                <span>Winner</span>
                <strong>${escapeHtml(String(winnerNumber) === 'Awaiting draw' ? '—' : winnerNumber)}</strong>
              </div>
            </div>

            <div class="live-player-panel">
              <div class="live-panel-label">Player numbers</div>
              <div class="live-player-grid">
                ${summary.playerNumbers.map((playerNumber) => `<div class="live-player-number ${playerNumber === summary.winnerNumber ? 'winner' : ''}">${playerNumber}</div>`).join('')}
              </div>
            </div>

            <div class="live-remaining-panel">
              <div class="live-panel-label">Remaining numbers</div>
              <div class="live-remaining-grid">
                ${(summary.availableNumbers.length ? summary.availableNumbers.map((value) => `<div class="live-remaining-number">${value}</div>`).join('') : '<div class="muted">No numbers left</div>')}
              </div>
            </div>
          </aside>
        </div>

        <div class="live-lower-bar">
          <div class="live-result-banner">
            <span>Winner</span>
            <strong data-live-winner>${summary.winnerNumber ? `PLAYER ${String(summary.winnerNumber).padStart(2, '0')}` : 'Awaiting draw'}</strong>
          </div>

          <div class="live-join-overlay">
            <div class="live-panel-label">Game ID</div>
            <div class="live-game-id">${escapeHtml(gameId)}</div>
            <div class="live-qr-wrap">
              ${renderQrSvg(joinUrl, gameId)}
            </div>
            <div class="live-join-link">${escapeHtml(joinUrl)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindLiveModeButton();
  renderWheel(round, '#live-wheel-spin');
  startLiveCountdown(summary.countdownSeconds);
}

function bindLiveModeButton() {
  document.querySelectorAll('[data-live-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const enabled = button.dataset.liveToggle === 'on';
      state.liveMode = enabled;
      localStorage.setItem('tikwheel-live-mode', String(enabled));
      renderLive();
    });
  });
}

function startLiveCountdown(seconds) {
  const countdownNode = document.querySelector('[data-countdown]');
  if (!countdownNode) return;

  clearInterval(state.liveCountdownTimer);
  let remaining = Math.max(1, Number(seconds) || 30);

  const tick = () => {
    countdownNode.textContent = String(remaining);
    remaining = Math.max(0, remaining - 1);
    if (remaining <= 0) {
      clearInterval(state.liveCountdownTimer);
    }
  };

  tick();
  state.liveCountdownTimer = setInterval(() => {
    if (remaining <= 0) {
      clearInterval(state.liveCountdownTimer);
      return;
    }
    remaining -= 1;
    countdownNode.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(state.liveCountdownTimer);
    }
  }, 1000);
}

function renderQrSvg(value, seed = 'live') {
  const size = 21;
  const cell = 6;
  const hash = Array.from(String(value || seed)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const lines = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inFinder =
        (x < 7 && y < 7) ||
        (x >= size - 7 && y < 7) ||
        (x < 7 && y >= size - 7);
      const dark = inFinder
        ? ((x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7))
        : ((x * 3 + y * 7 + hash) % 5 === 0) || ((x + y + seed.length) % 4 === 0 && (x + y + hash) % 2 === 0);

      if (dark) {
        lines.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" rx="1" fill="#0b1022"></rect>`);
      }
    }
  }

  return `<svg viewBox="0 0 ${size * cell} ${size * cell}" role="img" aria-label="Join QR code" class="live-qr-svg">${lines.join('')}</svg>`;
}

function renderRoundDetail() {
  const round = state.round;
  if (!round) {
    app.innerHTML = `<section class="hero"><h1>No round selected</h1></section>`;
    return;
  }
  const user = state.bootstrap.user;
  const paymentMethods = (state.bootstrap.paymentMethods || []).filter((method) => method.isActive);
  const positionStates = round.positionState || [];
  const verified = round.positionState?.filter((position) => position.status === 'VERIFIED').length || round.verifiedPlayerCount || 0;
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Round detail</div>
      <h1>${escapeHtml(round.number)} ${escapeHtml(round.gameType?.name || '')}</h1>
      <p class="muted">${verified}/${round.maxPlayers} verified players | Entry: ${escapeHtml(String(round.entryPrice))} | Prize: ${escapeHtml(round.prize || '')}</p>
      <div class="hero-actions">
        <a class="primary-btn" href="/live?round=${encodeURIComponent(round.id)}">Open live screen</a>
        <a class="ghost-btn" href="/dashboard">Back to dashboard</a>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Round summary</strong>
        <div class="stack">
          <div class="muted">Status: ${escapeHtml(round.status)}</div>
          <div class="muted">Capacity: ${verified}/${round.maxPlayers}</div>
          <div class="muted">Live link: ${escapeHtml(round.liveLink || 'Not configured')}</div>
          <div class="muted">Next draw uses ${round.verifiedPlayerCount} wheel sections if drawn now.</div>
        </div>
      </div>
      <div class="card">
        <strong>Payment instructions</strong>
        <div class="notice">
          <div class="small">Demo mode: submit the join form after selecting a free position.</div>
          <div class="small muted">Real deployments should replace this with configured payment methods and country-specific compliance rules.</div>
        </div>
        <div class="stack">
          ${paymentMethods.length ? paymentMethods.map((method) => `
            <div class="notice">
              <strong>${escapeHtml(method.name)}</strong>
              <div class="small">${escapeHtml(method.instructions)}</div>
              <div class="small muted">${escapeHtml(method.accountName)} | ${escapeHtml(method.accountNumber)}</div>
              <div class="small muted">Reference: ${escapeHtml(method.referenceHint || 'Use your round and position')}</div>
            </div>
          `).join('') : '<div class="muted">No active payment methods configured yet.</div>'}
        </div>
        <form class="form" id="round-join-form">
          <div class="row">
            <div class="field">
              <label>Position</label>
              <select name="position" id="round-position-select">
                ${(round.availablePositions || []).length
      ? (round.availablePositions || []).map((position) => `<option value="${position}">${position}</option>`).join('')
      : '<option value="">No positions available</option>'}
              </select>
            </div>
            <div class="field">
              <label>Receipt URL</label>
              <input name="receiptUrl" placeholder="https://..." />
            </div>
          </div>
          <div class="field">
            <label>Payment reference</label>
            <input name="reference" placeholder="Transaction id / bank ref" />
          </div>
          <button class="primary-btn" type="submit">${user ? 'Reserve position' : 'Log in to join'}</button>
        </form>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Position map</strong>
        <div class="position-grid">
          ${positionStates.map(renderPositionCell).join('')}
        </div>
      </div>
      <div class="card">
        <strong>Eligible wheel</strong>
        <div class="wheel-wrap">
          <div class="wheel-stage">
            <div class="wheel-pointer"></div>
            <div class="wheel-spin" id="wheel-spin"></div>
            <div class="wheel-rim"></div>
            <div class="wheel-core"></div>
          </div>
          <div class="muted small">The wheel will always match the verified player count, not a fixed 100-slice template.</div>
        </div>
      </div>
    </section>
    <section class="card">
      <strong>Round audit timeline</strong>
      <div class="stack">
        ${(state.roundAudit?.trail || []).length
      ? state.roundAudit.trail.map((item) => `
            <div class="notice">
              <strong>${escapeHtml(item.action)}</strong>
              <div class="small">${escapeHtml(item.entityType)} ${escapeHtml(item.entityId)}</div>
              <div class="small muted">${escapeHtml(item.createdAt)}</div>
              <div class="small muted">${escapeHtml(item.actor?.fullName || 'System')} ${escapeHtml(item.actor?.role || '')}</div>
            </div>
          `).join('')
      : '<div class="muted">No audit events recorded yet for this round.</div>'}
      </div>
    </section>
  `;
  bindRoundDetailForms();
  renderWheel(round);
}

function renderHistory() {
  const items = state.bootstrap.winnerHistory || [];
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Winner history</div>
      <h1>Public draw history</h1>
      <p class="muted">Completed rounds and their backend-selected winners.</p>
    </section>
    <section class="grid cols-2">
      ${items.map((item) => `
        <div class="card">
          <strong>${escapeHtml(item.number)}</strong>
          <div class="muted">Players: ${item.playerCount}</div>
          <div class="muted">Winner positions: ${item.winnerPositions.join(', ')}</div>
          <div class="muted">Prize: ${escapeHtml(item.prize || '')}</div>
          <div class="status">${escapeHtml(item.status)}</div>
          <div class="section-actions" style="margin-top: 12px;">
            <a class="ghost-btn" href="/history/${encodeURIComponent(item.id)}">View details</a>
          </div>
        </div>
      `).join('')}
    </section>
  `;
}

function renderHistoryDetail() {
  const round = state.historyRound;
  const history = state.historyAudit;
  if (!round || !history) {
    app.innerHTML = `<section class="hero"><h1>History record not found</h1></section>`;
    return;
  }

  const winnerPositions = round.winners?.map((winner) => winner.position) || [];
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">History detail</div>
      <h1>${escapeHtml(round.number)} ${escapeHtml(round.gameType?.name || '')}</h1>
      <p class="muted">${round.verifiedPlayerCount}/${round.maxPlayers} players | Prize: ${escapeHtml(round.prize || '')}</p>
      <div class="hero-actions">
        <a class="primary-btn" href="/live?round=${encodeURIComponent(round.id)}">Open live screen</a>
        <a class="ghost-btn" href="/history">Back to history</a>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Winner result</strong>
        <div class="stack">
          <div class="notice">
            <div class="small muted">Winning positions</div>
            <div class="winner-name">${winnerPositions.length ? winnerPositions.join(', ') : 'No winner recorded yet'}</div>
          </div>
          <div class="muted">Status: ${escapeHtml(round.status)}</div>
          <div class="muted">Selected by backend before animation reveal.</div>
        </div>
      </div>
      <div class="card">
        <strong>Draw timeline</strong>
        <div class="stack">
          ${(history.audit?.trail || []).length
      ? history.audit.trail.map((item) => `
              <div class="notice">
                <strong>${escapeHtml(item.action)}</strong>
                <div class="small">${escapeHtml(item.entityType)} ${escapeHtml(item.entityId)}</div>
                <div class="small muted">${escapeHtml(item.createdAt)}</div>
                <div class="small muted">${escapeHtml(item.actor?.fullName || 'System')} ${escapeHtml(item.actor?.role || '')}</div>
              </div>
            `).join('')
      : '<div class="muted">No draw events captured for this round.</div>'}
        </div>
      </div>
    </section>
    <section class="card">
      <strong>Round summary</strong>
      <div class="grid cols-3">
        <div class="metric"><div class="metric-value">${round.verifiedPlayerCount}</div><div class="metric-label">Verified players</div></div>
        <div class="metric"><div class="metric-value">${round.maxPlayers}</div><div class="metric-label">Capacity</div></div>
        <div class="metric"><div class="metric-value">${round.winnerSelection ? 'YES' : 'NO'}</div><div class="metric-label">Winner saved</div></div>
      </div>
    </section>
  `;
}

function renderWallet() {
  const bootstrap = state.bootstrap;
  const walletData = bootstrap.walletDashboard;
  const user = bootstrap.user;
  if (!user) {
    app.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Wallet</div>
        <h1>Please log in to view your wallet.</h1>
        <p class="muted">Use the seeded demo player or create a new account.</p>
        <div class="hero-actions"><a class="primary-btn" href="/login">Go to login</a></div>
      </section>
    `;
    return;
  }

  if (!walletData) {
    app.innerHTML = `<section class="hero"><h1>No wallet data available.</h1></section>`;
    return;
  }

  const wallet = walletData.wallet;
  const transactions = walletData.transactions || [];

  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Wallet</div>
      <h1>Your balance: ${wallet.balance} ${wallet.currency}</h1>
      <p class="muted">Manage deposits, withdrawals, and view transaction history.</p>
      <div class="hero-actions">
        <button class="primary-btn" id="deposit-btn">Deposit</button>
        <button class="ghost-btn" id="withdraw-btn">Withdraw</button>
      </div>
    </section>
    <section class="card">
      <strong>Transaction History</strong>
      <div class="stack">
        ${transactions.length ? transactions.map((txn) => `
          <div class="notice">
            <strong>${escapeHtml(txn.type)} - ${txn.amount} ${wallet.currency}</strong>
            <div class="small">Status: ${escapeHtml(txn.status)}</div>
            <div class="small muted">Date: ${new Date(txn.createdAt).toLocaleString()}</div>
            ${txn.paymentMethod ? `<div class="small muted">Method: ${escapeHtml(txn.paymentMethod)}</div>` : ''}
          </div>
        `).join('') : `<div class="muted">No transactions yet.</div>`}
      </div>
    </section>
    <section class="card" id="deposit-form-section" style="display: none;">
      <strong>Deposit Funds</strong>
      <form class="form" id="deposit-form">
        <div class="field">
          <label>Amount (ETB)</label>
          <input name="amount" type="number" min="1" required placeholder="Enter amount" />
        </div>
        <div class="field">
          <label>Payment Method</label>
          <select name="paymentMethod" required>
            <option value="">Select method</option>
            ${bootstrap.paymentMethods.filter(pm => pm.isActive).map(pm => `<option value="${pm.id}">${escapeHtml(pm.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Referral Number (Optional)</label>
          <input name="referralNumber" placeholder="Enter referral number if available" />
        </div>
        <div class="field">
          <label>ID Document URL (Required)</label>
          <input name="idDocumentUrl" type="url" required placeholder="Upload Ethiopian National ID or Fayda ID Card" />
          <small class="muted">Clear image of government-issued ID required for verification</small>
        </div>
        <div class="field">
          <label>Payment Receipt URL (Optional)</label>
          <input name="receiptUrl" type="url" placeholder="Upload payment receipt" />
        </div>
        <button class="primary-btn" type="submit">Submit Deposit</button>
        <button class="ghost-btn" type="button" id="cancel-deposit">Cancel</button>
      </form>
    </section>
    <section class="card" id="withdraw-form-section" style="display: none;">
      <strong>Withdraw Funds</strong>
      <form class="form" id="withdraw-form">
        <div class="field">
          <label>Amount (ETB)</label>
          <input name="amount" type="number" min="500" required placeholder="Minimum 500 ETB" />
          <small class="muted">Minimum withdrawal: 500 ETB</small>
        </div>
        <div class="field">
          <label>Payment Method</label>
          <select name="paymentMethod" required>
            <option value="">Select method</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="mobile_wallet">Mobile Wallet</option>
          </select>
        </div>
        <div class="field">
          <label>Account Name</label>
          <input name="accountName" required placeholder="Account holder name" />
        </div>
        <div class="field">
          <label>Account Number</label>
          <input name="accountNumber" required placeholder="Bank account or wallet number" />
        </div>
        <div class="field">
          <label>Bank Name (optional)</label>
          <input name="bankName" placeholder="Bank name" />
        </div>
        <button class="primary-btn" type="submit">Submit Withdrawal</button>
        <button class="ghost-btn" type="button" id="cancel-withdraw">Cancel</button>
      </form>
    </section>
  `;

  document.getElementById('deposit-btn')?.addEventListener('click', () => {
    document.getElementById('deposit-form-section').style.display = 'block';
    document.getElementById('withdraw-form-section').style.display = 'none';
  });

  document.getElementById('withdraw-btn')?.addEventListener('click', () => {
    document.getElementById('withdraw-form-section').style.display = 'block';
    document.getElementById('deposit-form-section').style.display = 'none';
  });

  document.getElementById('cancel-deposit')?.addEventListener('click', () => {
    document.getElementById('deposit-form-section').style.display = 'none';
  });

  document.getElementById('cancel-withdraw')?.addEventListener('click', () => {
    document.getElementById('withdraw-form-section').style.display = 'none';
  });

  document.getElementById('deposit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      amount: Number(formData.get('amount')),
      paymentMethod: formData.get('paymentMethod'),
      paymentDetails: {
        referralNumber: formData.get('referralNumber') || null,
        idDocumentUrl: formData.get('idDocumentUrl'),
        receiptUrl: formData.get('receiptUrl') || null,
      },
    };
    try {
      const response = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (response.ok) {
        alert('Deposit request submitted successfully! Your deposit will be reviewed by admin.');
        document.getElementById('deposit-form-section').style.display = 'none';
        e.target.reset();
        bootstrap().then(() => renderWallet());
      } else {
        alert(result.error || 'Deposit failed');
      }
    } catch (error) {
      alert('Deposit failed: ' + error.message);
    }
  });

  document.getElementById('withdraw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      amount: Number(formData.get('amount')),
      paymentDetails: {
        paymentMethod: formData.get('paymentMethod'),
        accountName: formData.get('accountName'),
        accountNumber: formData.get('accountNumber'),
        bankName: formData.get('bankName'),
      },
    };
    try {
      const response = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (response.ok) {
        alert('Withdrawal request submitted successfully!');
        document.getElementById('withdraw-form-section').style.display = 'none';
        e.target.reset();
        bootstrap().then(() => renderWallet());
      } else {
        alert(result.error || 'Withdrawal failed');
      }
    } catch (error) {
      alert('Withdrawal failed: ' + error.message);
    }
  });
}

function renderDashboard() {
  const bootstrap = state.bootstrap;
  const dashboard = bootstrap.playerDashboard;
  const user = bootstrap.user;
  if (!user) {
    app.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Player dashboard</div>
        <h1>Please log in to view your rounds.</h1>
        <p class="muted">Use the seeded demo player or create a new account.</p>
        <div class="hero-actions"><a class="primary-btn" href="/login">Go to login</a></div>
      </section>
    `;
    return;
  }

  if (!dashboard) {
    app.innerHTML = `<section class="hero"><h1>No dashboard data available.</h1></section>`;
    return;
  }

  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Player dashboard</div>
      <h1>Welcome back, ${escapeHtml(user.fullName)}</h1>
      <p class="muted">Track your entries, payments, and wins from one place.</p>
      <div class="hero-actions">
        <a class="primary-btn" href="/live">Go live</a>
        <a class="ghost-btn" href="/history">Winner history</a>
      </div>
    </section>
    <section class="grid cols-3">
      <div class="card"><strong>My entries</strong><div class="metric-value">${dashboard.myEntries.length}</div><div class="metric-label">Selected positions</div></div>
      <div class="card"><strong>Active rounds</strong><div class="metric-value">${dashboard.activeRounds.length}</div><div class="metric-label">Joinable rounds</div></div>
      <div class="card"><strong>My wins</strong><div class="metric-value">${dashboard.myWinners.length}</div><div class="metric-label">Winner records</div></div>
    </section>
    <section class="card">
      <strong>My rounds</strong>
      <div class="hero-actions">
        <button class="ghost-btn ${state.dashboardFilter === 'all' ? 'active-filter' : ''}" data-dashboard-filter="all">All</button>
        <button class="ghost-btn ${state.dashboardFilter === 'active' ? 'active-filter' : ''}" data-dashboard-filter="active">Active</button>
        <button class="ghost-btn ${state.dashboardFilter === 'pending' ? 'active-filter' : ''}" data-dashboard-filter="pending">Pending</button>
        <button class="ghost-btn ${state.dashboardFilter === 'verified' ? 'active-filter' : ''}" data-dashboard-filter="verified">Verified</button>
        <button class="ghost-btn ${state.dashboardFilter === 'completed' ? 'active-filter' : ''}" data-dashboard-filter="completed">Completed</button>
      </div>
      <div class="grid cols-2" id="my-rounds-grid">
        ${renderMyRounds(dashboard.myRounds, state.dashboardFilter)}
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Join a round</strong>
        <form class="form" id="join-round-form">
          <div class="row">
            <div class="field">
              <label>Round</label>
              <select name="roundId" id="join-round-select">
                ${dashboard.activeRounds.map((round) => `<option value="${round.id}">${escapeHtml(round.number)} - ${escapeHtml(round.gameType?.name || '')}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Position</label>
              <select name="position" id="join-position-select"></select>
            </div>
          </div>
          <div class="row">
            <div class="field"><label>Payment reference</label><input name="reference" placeholder="Bank ref / transaction id" /></div>
            <div class="field"><label>Receipt URL</label><input name="receiptUrl" placeholder="https://..." /></div>
          </div>
          <button class="primary-btn" type="submit">Reserve position</button>
        </form>
      </div>
      <div class="card">
        <strong>My payment status</strong>
        <div class="stack">
          ${dashboard.myEntries.length ? dashboard.myEntries.map((entry) => `
            <div class="notice">
              <strong>${escapeHtml(entry.roundNumber)} - Player ${String(entry.position).padStart(2, '0')}</strong>
              <div class="small">Status: ${escapeHtml(entry.paymentStatus)}</div>
              <div class="small muted">${escapeHtml(entry.gameTypeName)} | Prize: ${escapeHtml(entry.prize || '')}</div>
              <form class="form" data-receipt-form="${escapeHtml(entry.id)}">
                <div class="row">
                  <div class="field"><label>Reference</label><input name="reference" value="${escapeHtml(entry.reference || '')}" /></div>
                  <div class="field"><label>Receipt URL</label><input name="receiptUrl" value="${escapeHtml(entry.receiptUrl || '')}" /></div>
                </div>
                <button class="action-btn" type="submit">Update receipt</button>
              </form>
            </div>
          `).join('') : `<div class="muted">You have not joined any rounds yet.</div>`}
        </div>
      </div>
    </section>
    <section class="card">
      <strong>My wins</strong>
      <div class="grid cols-2">
        ${dashboard.myWinners.length ? dashboard.myWinners.map((win) => `
          <div class="notice">
            <strong>${escapeHtml(win.roundNumber)}</strong>
            <div class="small">Winner positions: ${win.winningPositions.join(', ')}</div>
            <div class="small muted">${escapeHtml(win.gameTypeName)} | ${escapeHtml(win.status)}</div>
          </div>
        `).join('') : `<div class="muted">No winning entries yet.</div>`}
      </div>
    </section>
  `;
  bindDashboardForms();
  bindDashboardFilters();
}

function renderAdmin() {
  const bootstrap = state.bootstrap;
  const user = bootstrap.user;
  const promotionSummary = bootstrap.promotionDashboard?.summary || {
    totalScheduledShares: 0,
    completedShares: 0,
    failedShares: 0,
    activeCampaigns: 0,
    totalClicks: 0,
    totalJoins: 0,
    totalConversions: 0,
  };
  const promotionCampaigns = bootstrap.promotionDashboard?.campaigns || [];
  const liveBroadcast = bootstrap.liveBroadcast || { summary: { total: 0, live: 0, scheduled: 0, errors: 0 }, supportedPlatforms: [], broadcasts: [] };
  const failedShareLogs = (bootstrap.promotionDashboard?.logs || []).filter((log) => log.status === 'failed').slice(0, 10);
  const withdrawalQueue = bootstrap.withdrawalQueue || [];
  const depositQueue = bootstrap.depositQueue || [];
  const pendingVerifications = bootstrap.pendingVerifications || [];
  const financialSettings = bootstrap.financialSettings || null;

  if (!user || !['ADMIN', 'SUPER_ADMIN', 'MONEY_ADMIN'].includes(user.role)) {
    app.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Admin access required</div>
        <h1>Login as an admin to manage rounds.</h1>
        <p class="muted">Seeded admin: <strong>admin@tikwheel.local / Admin123!</strong></p>
      </section>
    `;
    return;
  }

  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Admin dashboard</div>
      <h1>Manage game types, rounds, payments, draws, and promotional campaigns.</h1>
      <p class="muted">Every important action writes to the audit log.</p>
    </section>
    <section class="grid cols-3">
      <div class="card"><strong>Total rounds</strong><div class="metric-value">${bootstrap.adminSummary?.totalRounds ?? bootstrap.rounds.length}</div><div class="metric-label">Tracked rounds</div></div>
      <div class="card"><strong>Ready to draw</strong><div class="metric-value">${bootstrap.adminSummary?.readyRounds ?? 0}</div><div class="metric-label">Rounds ready</div></div>
      <div class="card"><strong>Pending payments</strong><div class="metric-value">${bootstrap.adminSummary?.pendingPayments ?? 0}</div><div class="metric-label">Waiting review</div></div>
    </section>
    
    ${['ADMIN', 'SUPER_ADMIN'].includes(user.role) ? `
    <section class="card">
      <strong>Pending User Verifications (${pendingVerifications.length})</strong>
      <div class="stack">
        ${pendingVerifications.length ? pendingVerifications.map((verificationUser) => `
          <div class="notice">
            <strong>${escapeHtml(verificationUser.fullName)} (${escapeHtml(verificationUser.phone)})</strong>
            <div class="small">Email: ${escapeHtml(verificationUser.email || 'Not provided')}</div>
            <div class="small muted">Location: ${escapeHtml(verificationUser.location || 'Not provided')}</div>
            <div class="small muted">Registered: ${escapeHtml(verificationUser.createdAt || '')}</div>
            <div class="section-actions">
              <button class="action-btn" data-verification-approve="${verificationUser.id}">Approve</button>
              <button class="ghost-btn" data-verification-reject="${verificationUser.id}">Reject</button>
            </div>
          </div>
        `).join('') : '<div class="muted">No pending user verifications.</div>'}
      </div>
    </section>
    ` : ''}
    
    <section class="card">
      <strong>Pending Deposits (${depositQueue.length})</strong>
      <div class="stack">
        ${depositQueue.length ? depositQueue.map((deposit) => `
          <div class="notice">
            <strong>${escapeHtml(deposit.userName)} (${escapeHtml(deposit.userPhone)})</strong>
            <div class="small">Amount: ${deposit.amount} ETB | Status: ${escapeHtml(deposit.status)}</div>
            <div class="small muted">Payment Method: ${escapeHtml(deposit.paymentMethod || 'N/A')}</div>
            <div class="small muted">Referral: ${escapeHtml(deposit.referralNumber || 'None')}</div>
            ${deposit.idDocumentUrl ? `<div class="small"><a href="${escapeHtml(deposit.idDocumentUrl)}" target="_blank">View ID Document</a></div>` : ''}
            ${deposit.receiptUrl ? `<div class="small"><a href="${escapeHtml(deposit.receiptUrl)}" target="_blank">View Receipt</a></div>` : ''}
            <div class="section-actions">
              <button class="action-btn" data-deposit-approve="${deposit.id}">Approve</button>
              <button class="ghost-btn" data-deposit-reject="${deposit.id}">Reject</button>
            </div>
          </div>
        `).join('') : '<div class="muted">No pending deposits.</div>'}
      </div>
    </section>
    
    <section class="card">
      <strong>Pending Withdrawals (${withdrawalQueue.length})</strong>
      <div class="stack">
        ${withdrawalQueue.length ? withdrawalQueue.map((withdrawal) => `
          <div class="notice">
            <strong>${escapeHtml(withdrawal.userName)} (${escapeHtml(withdrawal.userPhone)})</strong>
            <div class="small">Amount: ${withdrawal.amount} ETB | Status: ${escapeHtml(withdrawal.status)}</div>
            <div class="small muted">Account: ${escapeHtml(withdrawal.paymentDetails?.accountName || '')} - ${escapeHtml(withdrawal.paymentDetails?.accountNumber || '')}</div>
            <div class="small muted">Method: ${escapeHtml(withdrawal.paymentMethod || 'N/A')}</div>
            <div class="section-actions">
              <button class="action-btn" data-withdrawal-approve="${withdrawal.id}">Approve</button>
              <button class="ghost-btn" data-withdrawal-reject="${withdrawal.id}">Reject</button>
            </div>
          </div>
        `).join('') : '<div class="muted">No pending withdrawals.</div>'}
      </div>
    </section>
    
    ${user.role === 'SUPER_ADMIN' && financialSettings ? `
    <section class="card">
      <strong>Financial Settings</strong>
      <form class="form" id="financial-settings-form">
        <div class="grid cols-2">
          <div class="field"><label>Platform Fee (%)</label><input name="platformFee" type="number" step="0.1" value="${financialSettings.platformFee}" required /></div>
          <div class="field"><label>Game Entry Price (ETB)</label><input name="gameEntryPrice" type="number" value="${financialSettings.gameEntryPrice}" required /></div>
          <div class="field"><label>Government Tax (%)</label><input name="governmentTax" type="number" step="0.1" value="${financialSettings.governmentTax}" required /></div>
          <div class="field"><label>Minimum Deposit (ETB)</label><input name="minimumDeposit" type="number" value="${financialSettings.minimumDeposit}" required /></div>
          <div class="field"><label>Minimum Withdrawal (ETB)</label><input name="minimumWithdrawal" type="number" value="${financialSettings.minimumWithdrawal}" required /></div>
          <div class="field"><label>Currency</label><input name="currency" value="${escapeHtml(financialSettings.currency)}" required /></div>
        </div>
        <button class="primary-btn" type="submit">Update Financial Settings</button>
      </form>
    </section>
    ` : ''}
    
    <section class="grid cols-4">
      <div class="card"><strong>Total scheduled shares</strong><div class="metric-value">${promotionSummary.totalScheduledShares}</div><div class="metric-label">Share jobs</div></div>
      <div class="card"><strong>Completed shares</strong><div class="metric-value">${promotionSummary.completedShares}</div><div class="metric-label">Approved sends</div></div>
      <div class="card"><strong>Failed shares</strong><div class="metric-value">${promotionSummary.failedShares}</div><div class="metric-label">Blocked / failed</div></div>
      <div class="card"><strong>Active campaigns</strong><div class="metric-value">${promotionSummary.activeCampaigns}</div><div class="metric-label">Live pushes</div></div>
    </section>
    <section class="card">
      <strong>Live Broadcast Control</strong>
      <div class="grid cols-2">
        <div>
          <div class="stack">
            <div class="notice">
              <strong>Stream status</strong>
              <div class="small muted">Live now: ${liveBroadcast.summary.live} | Scheduled: ${liveBroadcast.summary.scheduled} | Errors: ${liveBroadcast.summary.errors}</div>
            </div>
            <form class="form" id="live-broadcast-form">
              <div class="row">
                <div class="field"><label>Broadcast title</label><input name="title" placeholder="TikWheel Live Jackpot" required /></div>
                <div class="field">
                  <label>Round</label>
                  <select name="roundId" required>
                    ${bootstrap.rounds.map((round) => `<option value="${round.id}">${escapeHtml(round.number)} - ${escapeHtml(round.gameType?.name || '')}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="field"><label>Description</label><textarea name="description" rows="3" placeholder="Show your live wheel, countdown, and winner reveal." required></textarea></div>
              <div class="row">
                <div class="field"><label>Schedule date & time</label><input name="scheduledFor" type="datetime-local" required /></div>
              </div>
              <div class="field">
                <label>Platforms</label>
                <div class="stack">
                  ${(liveBroadcast.supportedPlatforms || []).map((platform) => `
                    <label class="checkbox-row">
                      <input type="checkbox" name="platforms" value="${platform.id}" checked />
                      <span>${escapeHtml(platform.label)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <button class="primary-btn" type="submit">Schedule broadcast</button>
            </form>
          </div>
        </div>
        <div>
          <div class="stack">
            ${(liveBroadcast.broadcasts || []).length ? (liveBroadcast.broadcasts || []).map((broadcast) => `
              <div class="notice">
                <strong>${escapeHtml(broadcast.title)}</strong>
                <div class="small muted">${escapeHtml(broadcast.description)}</div>
                <div class="small">Status: <span class="status">${escapeHtml(broadcast.status)}</span> | Platforms: ${broadcast.platforms.map((platform) => escapeHtml(platform)).join(', ') || 'none'}</div>
                <div class="small muted">Scheduled: ${escapeHtml(new Date(broadcast.scheduledFor).toLocaleString())}</div>
                <div class="small muted">Viewers: ${broadcast.viewerCount} | Reconnection: ${escapeHtml(broadcast.reconnectionStatus || 'stable')}</div>
                <div class="section-actions">
                  <button class="action-btn" data-live-broadcast-action="start" data-live-broadcast-id="${broadcast.id}">Start</button>
                  <button class="ghost-btn" data-live-broadcast-action="stop" data-live-broadcast-id="${broadcast.id}">Stop</button>
                  <button class="ghost-btn" data-live-broadcast-action="error" data-live-broadcast-id="${broadcast.id}">Simulate error</button>
                </div>
              </div>
            `).join('') : '<div class="muted">No broadcast scheduled yet.</div>'}
          </div>
        </div>
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Create promotion campaign</strong>
        <form class="form" id="promotion-form">
          <div class="row">
            <div class="field">
              <label>Game type</label>
              <select name="gameTypeId" required>
                ${bootstrap.gameTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Campaign name</label><input name="name" placeholder="VIP Jackpot Push" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Start date & time</label><input name="startAt" type="datetime-local" required /></div>
            <div class="field"><label>End date & time</label><input name="endAt" type="datetime-local" required /></div>
          </div>
          <div class="row">
            <div class="field">
              <label>Sharing interval</label>
              <select name="shareIntervalMinutes" required>
                <option value="5">5 minutes</option>
                <option value="10" selected>10 minutes</option>
                <option value="15">15 minutes</option>
              </select>
            </div>
            <div class="field"><label>Target live streams / campaigns</label><input name="targetLiveStreams" type="number" min="1" value="3" required /></div>
          </div>
          <div class="row">
            <div class="field">
              <label>Workflow</label>
              <select name="workflow" required>
                <option value="manual-review">Manual review queue</option>
                <option value="approved-internal">Approved internal broadcast</option>
                <option value="partner-managed">Partner managed review</option>
              </select>
            </div>
            <div class="field">
              <label>Authorized channel</label>
              <select name="channel" required>
                <option value="manual-approval-queue">Manual approval queue</option>
                <option value="approved-email-queue">Approved email queue</option>
                <option value="approved-internal-broadcast">Approved internal broadcast</option>
                <option value="partner-managed-review">Partner managed review</option>
              </select>
            </div>
          </div>
          <button class="primary-btn" type="submit">Create campaign</button>
        </form>
      </div>
      <div class="card">
        <strong>Campaign analytics</strong>
        <div class="stack">
          <div class="notice"><strong>Clicks</strong><div class="metric-value small">${promotionSummary.totalClicks}</div></div>
          <div class="notice"><strong>Joins</strong><div class="metric-value small">${promotionSummary.totalJoins}</div></div>
          <div class="notice"><strong>Conversions</strong><div class="metric-value small">${promotionSummary.totalConversions}</div></div>
        </div>
      </div>
    </section>
    <section class="card">
      <strong>Multi-live sharing dashboard</strong>
      <div class="stack">
        ${(promotionCampaigns || []).length ? (promotionCampaigns || []).map((campaign) => {
    const shareStats = (campaign.shares || []).reduce((acc, share) => {
      acc.total += 1;
      if (share.status === 'completed') acc.completed += 1;
      if (share.status === 'failed') acc.failed += 1;
      return acc;
    }, { total: 0, completed: 0, failed: 0 });
    return `
            <div class="notice">
              <strong>${escapeHtml(campaign.name)}</strong>
              <div class="small">${escapeHtml(campaign.gameTypeName)} | ${escapeHtml(campaign.status)} | ${escapeHtml(campaign.workflow)} | ${escapeHtml(campaign.channel)}</div>
              <div class="small muted">${escapeHtml(new Date(campaign.startAt).toLocaleString())} → ${escapeHtml(new Date(campaign.endAt).toLocaleString())} | interval ${campaign.shareIntervalMinutes} min | target ${campaign.targetLiveStreams}</div>
              <div class="small">Clicks: ${campaign.analytics.clicks} | Joins: ${campaign.analytics.joins} | Conversions: ${campaign.analytics.conversions} | Rate: ${(campaign.analytics.conversionRate || 0).toFixed(2)}</div>
              <div class="small muted">Scheduled shares: ${shareStats.total} | Completed: ${shareStats.completed} | Failed: ${shareStats.failed}</div>
              <div class="section-actions">
                <button class="action-btn" data-track-promotion-click="${campaign.id}">Record click</button>
                <button class="ghost-btn" data-track-promotion-join="${campaign.id}">Record join</button>
              </div>
            </div>
          `;
  }).join('') : '<div class="muted">No campaigns scheduled yet.</div>'}
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Create game type</strong>
        <form class="form" id="game-type-form">
          <div class="row">
            <div class="field"><label>Name</label><input name="name" placeholder="Premium Equipment" required /></div>
            <div class="field"><label>Code</label><input name="code" placeholder="PREMIUM_EQUIPMENT" required /></div>
          </div>
          <div class="row">
            <div class="field"><label>Winner count</label><input name="winnerCount" type="number" min="1" value="1" /></div>
            <div class="field"><label>Default players</label><input name="defaultMaxPlayers" type="number" min="1" value="16" /></div>
          </div>
          <div class="field"><label>Description</label><textarea name="description"></textarea></div>
          <div class="row">
            <div class="field"><label>Entry price</label><input name="defaultEntryPrice" type="number" min="0" value="0" /></div>
            <div class="field"><label>Prize</label><input name="defaultPrize" /></div>
          </div>
          <button class="primary-btn" type="submit">Save game type</button>
        </form>
      </div>
      <div class="card">
        <strong>Create round</strong>
        <form class="form" id="round-form">
          <div class="row">
            <div class="field">
              <label>Game type</label>
              <select name="gameTypeId" required>
                ${bootstrap.gameTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Round number</label><input name="number" placeholder="ROUND 017" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Max players</label><input name="maxPlayers" type="number" min="1" value="16" /></div>
            <div class="field"><label>Entry price</label><input name="entryPrice" type="number" min="0" value="5" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Prize</label><input name="prize" placeholder="Configured prize" /></div>
            <div class="field"><label>Live link</label><input name="liveLink" placeholder="https://..." /></div>
          </div>
          <button class="primary-btn" type="submit">Create round</button>
        </form>
      </div>
    </section>
    <section class="card">
      <strong>Recent rounds</strong>
      <table class="table">
        <thead><tr><th>Round</th><th>Status</th><th>Players</th><th>Actions</th></tr></thead>
        <tbody>
          ${bootstrap.rounds.map((round) => `
            <tr>
              <td>${escapeHtml(round.number)}</td>
              <td>${escapeHtml(round.status)}</td>
              <td>${round.verifiedPlayerCount}/${round.maxPlayers}</td>
              <td class="section-actions">
                <button class="action-btn" data-admin-draw="${round.id}">Draw</button>
                <button class="ghost-btn" data-round-status="${round.id}" data-status-value="OPEN">Open</button>
                <button class="ghost-btn" data-round-status="${round.id}" data-status-value="READY">Ready</button>
                <button class="ghost-btn" data-round-status="${round.id}" data-status-value="DRAWING">Drawing</button>
                <button class="ghost-btn" data-round-status="${round.id}" data-status-value="COMPLETED">Complete</button>
                <a class="ghost-btn" href="/live?round=${encodeURIComponent(round.id)}">Live</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
    <section class="card">
      <strong>Audit log</strong>
      <div class="stack">
        ${(bootstrap.auditLog || []).slice(0, 12).map((log) => `
          <div class="notice">
            <strong>${escapeHtml(log.action)}</strong>
            <div class="small">${escapeHtml(log.entityType)} ${escapeHtml(log.entityId)}</div>
            <div class="small muted">${escapeHtml(log.createdAt)}</div>
          </div>
        `).join('')}
      </div>
      <div class="section-actions">
        <a class="ghost-btn" href="/audit">Open audit viewer</a>
      </div>
    </section>
    <section class="card">
      <strong>Payment review queue</strong>
      <div class="stack">
        ${(bootstrap.adminPayments || []).map((entry) => `
          <div class="notice">
            <strong>${escapeHtml(entry.roundNumber)} - ${escapeHtml(entry.playerName)}</strong>
            <div class="small">${escapeHtml(entry.gameTypeName)} | Position ${String(entry.position).padStart(2, '0')}</div>
            <div class="small muted">Status: ${escapeHtml(entry.paymentStatus)} | Ref: ${escapeHtml(entry.reference || '')}</div>
            <div class="section-actions">
              <button class="action-btn" data-verify-payment="${escapeHtml(entry.id)}">Verify</button>
              <button class="ghost-btn" data-reject-payment="${escapeHtml(entry.id)}">Reject</button>
            </div>
          </div>
        `).join('') || '<div class="muted">No pending payments.</div>'}
      </div>
    </section>
    <section class="card">
      <strong>Failed shares with error logs</strong>
      <div class="stack">
        ${(failedShareLogs || []).length ? failedShareLogs.map((log) => `
          <div class="notice">
            <strong>${escapeHtml(log.message || 'Share failure')}</strong>
            <div class="small muted">${escapeHtml(log.errorLog || 'No error details')}</div>
          </div>
        `).join('') : '<div class="muted">No failed shares.</div>'}
      </div>
    </section>
    <section class="grid cols-2">
      <div class="card">
        <strong>Create payment method</strong>
        <form class="form" id="payment-method-form">
          <div class="row">
            <div class="field"><label>Name</label><input name="name" placeholder="Bank Transfer" required /></div>
            <div class="field"><label>Account name</label><input name="accountName" placeholder="TikWheel Demo Account" required /></div>
          </div>
          <div class="row">
            <div class="field"><label>Account number</label><input name="accountNumber" placeholder="000-000-0000" required /></div>
            <div class="field"><label>Reference hint</label><input name="referenceHint" placeholder="ROUND 001 - PLAYER 01" /></div>
          </div>
          <div class="field"><label>Instructions</label><textarea name="instructions" placeholder="Explain how players should pay" required></textarea></div>
          <button class="primary-btn" type="submit">Save payment method</button>
        </form>
      </div>
      <div class="card">
        <strong>Configured payment methods</strong>
        <div class="stack">
          ${(bootstrap.paymentMethods || []).length ? (bootstrap.paymentMethods || []).map((method) => `
            <div class="notice">
              <strong>${escapeHtml(method.name)}</strong>
              <div class="small">${escapeHtml(method.instructions)}</div>
              <div class="small muted">${escapeHtml(method.accountName)} | ${escapeHtml(method.accountNumber)}</div>
              <div class="section-actions">
                <span class="status ${method.isActive ? '' : 'rejected'}">${method.isActive ? 'Active' : 'Inactive'}</span>
                <button class="ghost-btn" data-toggle-payment-method="${escapeHtml(method.id)}">${method.isActive ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          `).join('') : '<div class="muted">No payment methods configured.</div>'}
        </div>
      </div>
    </section>
  `;
  bindAdminForms();
}

function bindAdminForms() {
  const promotionForm = document.querySelector('#promotion-form');
  if (promotionForm) {
    promotionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(promotionForm).entries());
      data.shareIntervalMinutes = Number(data.shareIntervalMinutes);
      data.targetLiveStreams = Number(data.targetLiveStreams);
      await postJson('/api/admin/promotions', data);
      location.reload();
    });
  }

  document.querySelectorAll('[data-track-promotion-click]').forEach((button) => {
    button.addEventListener('click', async () => {
      await postJson(`/api/admin/promotions/${encodeURIComponent(button.dataset.trackPromotionClick)}/track`, { eventType: 'click' });
      location.reload();
    });
  });

  document.querySelectorAll('[data-track-promotion-join]').forEach((button) => {
    button.addEventListener('click', async () => {
      await postJson(`/api/admin/promotions/${encodeURIComponent(button.dataset.trackPromotionJoin)}/track`, { eventType: 'join' });
      location.reload();
    });
  });

  const gameTypeForm = document.querySelector('#game-type-form');
  if (gameTypeForm) {
    gameTypeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(gameTypeForm).entries());
      data.winnerCount = Number(data.winnerCount);
      data.defaultMaxPlayers = Number(data.defaultMaxPlayers);
      data.defaultEntryPrice = Number(data.defaultEntryPrice);
      await postJson('/api/admin/game-types', data);
      location.reload();
    });
  }

  const roundForm = document.querySelector('#round-form');
  if (roundForm) {
    roundForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(roundForm).entries());
      data.maxPlayers = Number(data.maxPlayers);
      data.entryPrice = Number(data.entryPrice);
      await postJson('/api/admin/rounds', data);
      location.reload();
    });
  }

  document.querySelectorAll('[data-admin-draw]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.adminDraw;
      await postJson(`/api/admin/rounds/${encodeURIComponent(id)}/draw`, {});
      location.href = `/live?round=${encodeURIComponent(id)}`;
    });
  });

  document.querySelectorAll('[data-round-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.roundStatus;
      const status = button.dataset.statusValue;
      await postJson(`/api/admin/rounds/${encodeURIComponent(id)}/status`, { status });
      location.reload();
    });
  });

  document.querySelectorAll('[data-verify-payment]').forEach((button) => {
    button.addEventListener('click', async () => {
      await postJson(`/api/admin/payments/${encodeURIComponent(button.dataset.verifyPayment)}/verify`, {});
      location.reload();
    });
  });

  document.querySelectorAll('[data-reject-payment]').forEach((button) => {
    button.addEventListener('click', async () => {
      const reason = prompt('Reason for rejection?', 'Invalid receipt');
      if (!reason) return;
      await postJson(`/api/admin/payments/${encodeURIComponent(button.dataset.rejectPayment)}/reject`, { reason });
      location.reload();
    });
  });

  document.querySelectorAll('[data-toggle-payment-method]').forEach((button) => {
    button.addEventListener('click', async () => {
      await postJson(`/api/admin/payment-methods/${encodeURIComponent(button.dataset.togglePaymentMethod)}/toggle`, {});
      location.reload();
    });
  });

  const paymentMethodForm = document.querySelector('#payment-method-form');
  if (paymentMethodForm) {
    paymentMethodForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(paymentMethodForm).entries());
      await postJson('/api/admin/payment-methods', data);
      location.reload();
    });
  }

  const liveBroadcastForm = document.querySelector('#live-broadcast-form');
  if (liveBroadcastForm) {
    liveBroadcastForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(liveBroadcastForm).entries());
      const platforms = Array.from(liveBroadcastForm.querySelectorAll('input[name="platforms"]:checked')).map((input) => input.value);
      data.platforms = platforms;
      await postJson('/api/admin/live-broadcast', data);
      location.reload();
    });
  }

  document.querySelectorAll('[data-live-broadcast-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.liveBroadcastId;
      const action = button.dataset.liveBroadcastAction;
      await postJson(`/api/admin/live-broadcast/${encodeURIComponent(id)}/${action}`, {});
      location.reload();
    });
  });

  document.querySelectorAll('[data-withdrawal-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.withdrawalApprove;
      if (!confirm('Approve this withdrawal? This will deduct the amount from the user wallet.')) return;
      await postJson(`/api/admin/withdrawals/${encodeURIComponent(id)}/approve`, {});
      location.reload();
    });
  });

  document.querySelectorAll('[data-withdrawal-reject]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.withdrawalReject;
      const reason = prompt('Enter rejection reason:');
      if (!reason) return;
      await postJson(`/api/admin/withdrawals/${encodeURIComponent(id)}/reject`, { reason });
      location.reload();
    });
  });

  document.querySelectorAll('[data-verification-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.verificationApprove;
      if (!confirm('Approve this user verification? This will activate their account.')) return;
      await postJson(`/api/admin/verifications/${encodeURIComponent(id)}/approve`, {});
      location.reload();
    });
  });

  document.querySelectorAll('[data-verification-reject]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.verificationReject;
      const reason = prompt('Enter rejection reason:');
      if (!reason) return;
      await postJson(`/api/admin/verifications/${encodeURIComponent(id)}/reject`, { reason });
      location.reload();
    });
  });

  document.querySelectorAll('[data-deposit-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.depositApprove;
      if (!confirm('Approve this deposit? This will credit the amount to the user wallet.')) return;
      await postJson(`/api/admin/deposits/${encodeURIComponent(id)}/complete`, {});
      location.reload();
    });
  });

  document.querySelectorAll('[data-deposit-reject]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.depositReject;
      const reason = prompt('Enter rejection reason:');
      if (!reason) return;
      await postJson(`/api/admin/deposits/${encodeURIComponent(id)}/reject`, { reason });
      location.reload();
    });
  });

  const financialSettingsForm = document.querySelector('#financial-settings-form');
  if (financialSettingsForm) {
    financialSettingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(financialSettingsForm).entries());
      data.platformFee = Number(data.platformFee);
      data.gameEntryPrice = Number(data.gameEntryPrice);
      data.governmentTax = Number(data.governmentTax);
      data.minimumDeposit = Number(data.minimumDeposit);
      data.minimumWithdrawal = Number(data.minimumWithdrawal);
      await putJson('/api/admin/financial-settings', data);
      location.reload();
    });
  }
}

function renderLivestream() {
  const broadcastId = document.body.dataset.broadcastId || '';
  if (!broadcastId) {
    app.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Livestream</div>
        <h1>No broadcast specified</h1>
        <p class="muted">Please provide a broadcast ID to view the livestream.</p>
      </section>
    `;
    return;
  }

  fetch(`/api/broadcasts/${encodeURIComponent(broadcastId)}/config`, { credentials: 'include' })
    .then((res) => res.json())
    .then((config) => {
      const isPortrait = config.aspectRatio === '9:16';
      app.innerHTML = `
        <section class="hero">
          <div class="eyebrow">Livestream</div>
          <h1>${escapeHtml(config.title)}</h1>
          <p class="muted">Streaming to: ${config.platforms.map((p) => escapeHtml(p.label)).join(', ')}</p>
          <div class="hero-actions">
            <span class="status ${config.status === 'live' ? 'status-live' : 'status-offline'}">${config.status.toUpperCase()}</span>
          </div>
        </section>
        <section class="card ${isPortrait ? 'portrait-layout' : ''}">
          <div class="livestream-container ${isPortrait ? 'portrait' : 'landscape'}">
            <div class="livestream-viewport">
              <div class="wheel-display">
                <div class="wheel-placeholder">
                  <div class="wheel-spinner"></div>
                  <div class="wheel-center">
                    <div class="prize-display">Prize Pool</div>
                    <div class="prize-amount">Loading...</div>
                  </div>
                </div>
              </div>
              <div class="game-overlay">
                <div class="player-count">Players: <span id="player-count">--</span></div>
                <div class="countdown-timer">
                  <div class="timer-display" id="countdown">00:00</div>
                </div>
                <div class="winner-display" id="winner-display" style="display: none;">
                  <div class="winner-announcement">WINNER!</div>
                  <div class="winner-number" id="winner-number">--</div>
                </div>
              </div>
            </div>
            <div class="stream-info">
              <div class="info-row">
                <strong>Stream Key:</strong>
                <code>${escapeHtml(config.streamKey)}</code>
              </div>
              ${config.rtmpUrl ? `
                <div class="info-row">
                  <strong>RTMP URL:</strong>
                  <code>${escapeHtml(config.rtmpUrl)}</code>
                </div>
              ` : ''}
              <div class="info-row">
                <strong>Aspect Ratio:</strong>
                <span>${escapeHtml(config.aspectRatio)}</span>
              </div>
              <div class="info-row">
                <strong>Platforms:</strong>
                ${config.platforms.map((p) => `
                  <span class="platform-badge">${escapeHtml(p.label)} (${escapeHtml(p.aspectRatio)})</span>
                `).join('')}
              </div>
            </div>
          </div>
        </section>
        <section class="card">
          <strong>Join QR Code</strong>
          <div class="qr-placeholder">
            <div class="qr-code">
              <div class="qr-pattern"></div>
            </div>
            <div class="qr-text">Scan to join the game</div>
          </div>
        </section>
      `;

      if (config.status === 'live') {
        startLivestreamSimulation();
      }
    })
    .catch((error) => {
      app.innerHTML = `
        <section class="hero">
          <div class="eyebrow">Livestream</div>
          <h1>Failed to load broadcast</h1>
          <p class="muted">${escapeHtml(error?.message || 'Unknown error')}</p>
        </section>
      `;
    });
}

function startLivestreamSimulation() {
  let playerCount = 50 + Math.floor(Math.random() * 50);
  let countdownSeconds = 300;

  const playerCountEl = document.getElementById('player-count');
  const countdownEl = document.getElementById('countdown');

  if (playerCountEl) {
    playerCountEl.textContent = playerCount;
  }

  if (countdownEl) {
    countdownEl.textContent = formatTime(countdownSeconds);
  }

  const interval = setInterval(() => {
    countdownSeconds--;
    if (countdownEl) {
      countdownEl.textContent = formatTime(countdownSeconds);
    }

    if (countdownSeconds <= 0) {
      clearInterval(interval);
      showWinner();
    }
  }, 1000);

  setInterval(() => {
    playerCount += Math.floor(Math.random() * 5) - 2;
    playerCount = Math.max(10, playerCount);
    if (playerCountEl) {
      playerCountEl.textContent = playerCount;
    }
  }, 5000);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showWinner() {
  const winnerNumber = Math.floor(Math.random() * 100) + 1;
  const winnerDisplay = document.getElementById('winner-display');
  const winnerNumberEl = document.getElementById('winner-number');

  if (winnerDisplay) {
    winnerDisplay.style.display = 'block';
  }
  if (winnerNumberEl) {
    winnerNumberEl.textContent = `Player ${winnerNumber}`;
  }
}

function renderAudit() {
  const bootstrap = state.bootstrap;
  const logs = bootstrap.auditLog || [];
  const actions = [...new Set(logs.map((log) => log.action))];
  const actors = [...new Set(logs.map((log) => log.actorUserId || 'system'))];
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Audit viewer</div>
      <h1>Filter actions by actor and event.</h1>
      <p class="muted">This page surfaces the backend audit trail for round, payment, and draw events.</p>
    </section>
    <section class="card">
      <div class="grid cols-3">
        <div class="field">
          <label>Action</label>
          <select id="audit-action-filter">
            <option value="">All actions</option>
            ${actions.map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Actor</label>
          <select id="audit-actor-filter">
            <option value="">All actors</option>
            ${actors.map((actorId) => `<option value="${escapeHtml(actorId)}">${escapeHtml(actorId)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Search</label>
          <input id="audit-search" placeholder="round, payment, winner..." />
        </div>
      </div>
      <div class="section-actions" style="margin-top:12px;">
        <a class="ghost-btn" href="/admin">Back to admin</a>
      </div>
    </section>
    <section class="stack" id="audit-list">
      ${renderAuditEntries(logs)}
    </section>
  `;
  bindAuditFilters();
}

function bindDashboardForms() {
  const joinRoundForm = document.querySelector('#join-round-form');
  const roundSelect = document.querySelector('#join-round-select');
  const positionSelect = document.querySelector('#join-position-select');

  const updatePositions = () => {
    const selectedRound = state.bootstrap.playerDashboard.activeRounds.find((round) => round.id === roundSelect?.value);
    const available = selectedRound?.availablePositions || [];
    positionSelect.innerHTML = available.map((position) => `<option value="${position}">${position}</option>`).join('');
  };

  if (roundSelect && positionSelect) {
    roundSelect.addEventListener('change', updatePositions);
    updatePositions();
  }

  if (joinRoundForm) {
    joinRoundForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(joinRoundForm).entries());
      data.position = Number(data.position);
      await postJson(`/api/player/rounds/${encodeURIComponent(data.roundId)}/join`, data);
      location.reload();
    });
  }

  document.querySelectorAll('[data-receipt-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const entryId = form.dataset.receiptForm;
      const payload = Object.fromEntries(new FormData(form).entries());
      await postJson(`/api/player/entries/${encodeURIComponent(entryId)}/receipt`, payload);
      location.reload();
    });
  });
}

function bindDashboardFilters() {
  document.querySelectorAll('[data-dashboard-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dashboardFilter = button.dataset.dashboardFilter || 'all';
      const grid = document.querySelector('#my-rounds-grid');
      if (grid) {
        grid.innerHTML = renderMyRounds(state.bootstrap.playerDashboard?.myRounds || [], state.dashboardFilter);
      }
      document.querySelectorAll('[data-dashboard-filter]').forEach((candidate) => {
        candidate.classList.toggle('active-filter', candidate === button);
      });
    });
  });
}

function bindAuditFilters() {
  const actionFilter = document.querySelector('#audit-action-filter');
  const actorFilter = document.querySelector('#audit-actor-filter');
  const searchFilter = document.querySelector('#audit-search');
  const list = document.querySelector('#audit-list');
  if (!actionFilter || !actorFilter || !searchFilter || !list) return;

  const update = () => {
    const actionValue = actionFilter.value;
    const actorValue = actorFilter.value;
    const searchValue = searchFilter.value.trim().toLowerCase();
    const filtered = (state.bootstrap.auditLog || []).filter((log) => {
      if (actionValue && log.action !== actionValue) return false;
      if (actorValue && String(log.actorUserId || 'system') !== actorValue) return false;
      if (!searchValue) return true;
      const haystack = [
        log.action,
        log.entityType,
        log.entityId,
        log.actor?.fullName,
        log.actor?.role,
        log.createdAt,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchValue);
    });
    list.innerHTML = renderAuditEntries(filtered);
  };

  actionFilter.addEventListener('change', update);
  actorFilter.addEventListener('change', update);
  searchFilter.addEventListener('input', update);
}

function bindRoundDetailForms() {
  const form = document.querySelector('#round-join-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.bootstrap.user) {
      location.href = '/login';
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    data.position = Number(data.position);
    await postJson(`/api/player/rounds/${encodeURIComponent(state.round.id)}/join`, data);
    state.round = await loadRound(state.round.id);
    renderRoundDetail();
  });
}

function renderWheel(round, targetSelector = '#wheel-spin') {
  const wheelSpin = document.querySelector(targetSelector);
  if (!wheelSpin) return;
  const segments = round.wheel || [];
  if (!segments.length) {
    wheelSpin.innerHTML = `<div class="card">No verified players yet.</div>`;
    return;
  }

  const size = targetSelector === '#live-wheel-spin' ? 440 : 520;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const textRadius = radius * 0.72;
  const paths = segments.map((segment) => {
    const start = toPoint(cx, cy, radius, segment.angleStart - 90);
    const end = toPoint(cx, cy, radius, segment.angleEnd - 90);
    const largeArc = segment.angleEnd - segment.angleStart > 180 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
    const midpoint = segment.angleStart + (segment.angleEnd - segment.angleStart) / 2 - 90;
    const textPos = toPoint(cx, cy, textRadius, midpoint);
    return `
      <path d="${path}" fill="${segment.color}" stroke="rgba(255,255,255,0.18)" stroke-width="2"></path>
      <text x="${textPos.x}" y="${textPos.y}" fill="${segment.textColor}" font-size="${Math.max(10, 20 - segments.length / 7)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${segment.label}</text>
    `;
  }).join('');
  wheelSpin.innerHTML = `
    <svg class="wheel-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Dynamic wheel">
      ${paths}
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="4"></circle>
    </svg>
  `;

  const winnerPosition = round.winners?.[0]?.position;
  if (!winnerPosition) return;
  const winnerIndex = segments.findIndex((segment) => Number(segment.position) === Number(winnerPosition));
  if (winnerIndex < 0) return;
  const segmentAngle = 360 / segments.length;
  const targetRotation = 7 * 360 + (360 - (winnerIndex * segmentAngle + segmentAngle / 2));
  wheelSpin.style.transition = 'transform 6.8s cubic-bezier(0.12, 0.72, 0.12, 1)';
  requestAnimationFrame(() => {
    wheelSpin.style.transform = `rotate(${targetRotation}deg)`;
  });
}

function renderPositionCell(positionState) {
  const status = positionState.status || 'AVAILABLE';
  return `
    <div class="position-cell ${status.toLowerCase()}">
      <div class="position-number">${positionState.position}</div>
      <div class="position-status">${escapeHtml(status)}</div>
    </div>
  `;
}

function renderMyRounds(rounds, filter) {
  const items = (rounds || []).filter((round) => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['OPEN', 'FILLING', 'FULL', 'READY'].includes(round.status);
    if (filter === 'pending') return round.myPendingCount > 0;
    if (filter === 'verified') return round.myVerifiedCount > 0;
    if (filter === 'completed') return round.status === 'COMPLETED';
    return true;
  });

  if (!items.length) {
    return '<div class="muted">No rounds match this filter.</div>';
  }

  return items.map((round) => `
    <div class="notice">
      <strong>${escapeHtml(round.roundNumber)}</strong>
      <div class="small">${escapeHtml(round.gameTypeName)} | ${escapeHtml(round.status)}</div>
      <div class="small muted">Entries: ${round.myEntryCount} | Verified: ${round.myVerifiedCount} | Pending: ${round.myPendingCount}</div>
      <div class="small muted">Prize: ${escapeHtml(round.prize || '')}</div>
      <div class="section-actions">
        <a class="ghost-btn" href="/rounds/${encodeURIComponent(round.roundId)}">Open round</a>
        <a class="action-btn" href="/live?round=${encodeURIComponent(round.roundId)}">Open live</a>
      </div>
    </div>
  `).join('');
}

function renderAuditEntries(logs) {
  if (!logs.length) {
    return '<div class="card"><div class="muted">No audit entries match the current filters.</div></div>';
  }

  return logs.map((log) => `
    <div class="card">
      <div class="stack">
        <div class="status">${escapeHtml(log.action)}</div>
        <strong>${escapeHtml(log.entityType)} ${escapeHtml(log.entityId)}</strong>
        <div class="muted">${escapeHtml(log.createdAt)}</div>
        <div class="muted">Actor: ${escapeHtml(log.actor?.fullName || 'System')} ${escapeHtml(log.actor?.role || '')}</div>
        <div class="small muted">Before: ${escapeHtml(JSON.stringify(log.before || {}))}</div>
        <div class="small muted">After: ${escapeHtml(JSON.stringify(log.after || {}))}</div>
      </div>
    </div>
  `).join('');
}

function toPoint(cx, cy, radius, angleDegrees) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(translateError(data.error || 'Request failed'));
  }
  return data;
}

async function putJson(url, body) {
  const response = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(translateError(data.error || 'Request failed'));
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
