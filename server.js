import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PORT, SESSION_COOKIE, OAUTH_CONFIG } from './src/config.js';
import { parseCookies, serializeCookie, verifySignedToken } from './src/lib/security.js';
import formidable from 'formidable';
import {
  approveUserVerification,
  approveWithdrawal,
  bootstrapState,
  changeRoundStatus,
  completeDraw,
  completeDeposit,
  completeSocialSignup,
  createDeposit,
  createGameTypeAction,
  createLiveBroadcast,
  createPaymentMethodAction,
  createPromotionCampaign,
  createRound,
  createWithdrawal,
  deletePaymentMethodAction,
  drawRound,
  editPaymentMethodAction,
  getAuditLog,
  getBroadcastStreamConfig,
  getDepositQueue,
  getFinancialSettings,
  getHistory,
  getLiveBroadcastDashboard,
  getPaymentMethods,
  getPendingVerifications,
  getPromotionDashboard,
  getRoundAuditTrail,
  getRound,
  getAdminPaymentQueue,
  getPlayerDashboard,
  getWalletDashboard,
  getWithdrawalQueue,
  joinRound,
  login,
  rejectDeposit,
  rejectPayment,
  rejectUserVerification,
  rejectWithdrawal,
  registerPlayer,
  resolveUserFromCookie,
  toggleLiveBroadcast,
  togglePaymentMethodAction,
  trackPromotionEvent,
  updateFinancialSettings,
  verifyPayment,
} from './src/services/app-service.js';
import { renderAdminPage, renderAuditPage, renderDashboardPage, renderGameRulesPage, renderHistoryDetailPage, renderHistoryPage, renderHomePage, renderLivePage, renderLivestreamPage, renderLoginPage, renderRoundPage, renderTermsPage, renderWalletPage } from './src/views/pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function startServer(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }

      if (
        url.pathname === '/styles.css' ||
        url.pathname === '/app.js' ||
        url.pathname === '/live-broadcast.js' ||
        url.pathname.startsWith('/i18n/') ||
        url.pathname.startsWith('/uploads/')
      ) {
        await serveStatic(url.pathname.slice(1), res);
        return;
      }

      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      await handlePage(req, res, url);
    } catch (error) {
      const message = error?.message || 'Internal server error';
      const status = message === 'Authentication required' ? 401 : message === 'Forbidden' ? 403 : 500;
      sendJson(res, status, { error: message });
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Retrying on ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    console.log(`TikWheel running on http://localhost:${port}`);
  });
}

startServer(PORT);

async function handlePage(req, res, url) {
  const user = await currentUser(req);
  let html;
  if (url.pathname === '/login') {
    html = renderLoginPage({
      user,
      content: `<section class="hero"><div class="eyebrow">Login</div><h1>Access your TikWheel account.</h1><p class="muted">Register a new account to get started. The first registered user will become the system administrator.</p></section>`,
    });
  } else if (url.pathname === '/terms') {
    html = renderTermsPage({
      user,
      content: `
        <section class="hero">
          <div class="eyebrow">General Terms</div>
          <h1>TikWheel General Terms and Conditions of Use</h1>
          <p class="muted">Version 1.0 effective 2026-07-31.</p>
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
        </section>`,
    });
  } else if (url.pathname === '/game-rules') {
    html = renderGameRulesPage({
      user,
      content: `
        <section class="hero">
          <div class="eyebrow">Official Game Rules</div>
          <h1>TikWheel Official Game Rules</h1>
          <p class="muted">100 Players - 100 Numbers format.</p>
          <p class="muted">Version 1.0 effective 2026-07-31.</p>
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
        </section>`,
    });
  } else if (url.pathname === '/dashboard') {
    html = renderDashboardPage({
      user,
      content: `<section class="hero"><div class="eyebrow">Dashboard</div><h1>Your player workspace is loading...</h1></section>`,
    });
  } else if (url.pathname === '/live') {
    html = renderLivePage({
      user,
      roundId: url.searchParams.get('round') || '',
      content: `<section class="hero"><div class="eyebrow">Live</div><h1>Loading round data...</h1></section>`,
    });
  } else if (url.pathname.startsWith('/rounds/')) {
    html = renderRoundPage({
      user,
      roundId: url.pathname.split('/').filter(Boolean)[1] || '',
      content: `<section class="hero"><div class="eyebrow">Round</div><h1>Loading round details...</h1></section>`,
    });
  } else if (url.pathname === '/history') {
    html = renderHistoryPage({
      user,
      content: `<section class="hero"><div class="eyebrow">History</div><h1>Loading winner history...</h1></section>`,
    });
  } else if (url.pathname.startsWith('/history/')) {
    html = renderHistoryDetailPage({
      user,
      roundId: url.pathname.split('/').filter(Boolean)[1] || '',
      content: `<section class="hero"><div class="eyebrow">History detail</div><h1>Loading completed round...</h1></section>`,
    });
  } else if (url.pathname === '/admin') {
    html = renderAdminPage({
      user,
      content: `<section class="hero"><div class="eyebrow">Admin</div><h1>Loading admin tools...</h1></section>`,
    });
  } else if (url.pathname === '/audit') {
    html = renderAuditPage({
      user,
      content: `<section class="hero"><div class="eyebrow">Audit</div><h1>Loading audit trail...</h1></section>`,
    });
  } else if (url.pathname === '/wallet') {
    html = renderWalletPage({
      user,
      content: `<section class="hero"><div class="eyebrow">Wallet</div><h1>Loading wallet...</h1></section>`,
    });
  } else if (url.pathname.startsWith('/livestream/')) {
    html = renderLivestreamPage({
      user,
      broadcastId: url.pathname.split('/').filter(Boolean)[1] || '',
      content: `<section class="hero"><div class="eyebrow">Livestream</div><h1>Loading broadcast...</h1></section>`,
    });
  } else {
    html = renderHomePage({
      user,
      content: `<section class="hero"><div class="eyebrow">TikWheel</div><h1>Loading platform snapshot...</h1></section>`,
    });
  }

  sendHtml(res, 200, html);
}

async function handleApi(req, res, url) {
  const user = await currentUser(req);
  const body = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? await readJsonBody(req) : null;

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    return sendJson(res, 200, await bootstrapState(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/legal') {
    const state = await bootstrapState(user);
    return sendJson(res, 200, { legal: state.legal, appName: state.appName, complianceMode: state.complianceMode });
  }

  if (req.method === 'GET' && url.pathname === '/api/me/dashboard') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getPlayerDashboard(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/payments') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getAdminPaymentQueue(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    return sendJson(res, 200, await getHistory());
  }

  const historyRoundMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
  if (req.method === 'GET' && historyRoundMatch) {
    const round = await getRound(decodeURIComponent(historyRoundMatch[1]));
    if (!round) return sendJson(res, 404, { error: 'Round not found' });
    const audit = await getRoundAuditTrail(round.id, user);
    return sendJson(res, 200, { round, audit });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getAuditLog());
  }

  if (req.method === 'GET' && url.pathname === '/api/payment-methods') {
    return sendJson(res, 200, await getPaymentMethods());
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/promotions') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getPromotionDashboard(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/live-broadcast') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getLiveBroadcastDashboard(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/wallet') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getWalletDashboard(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/withdrawals') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getWithdrawalQueue(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/deposits') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getDepositQueue(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/verifications') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getPendingVerifications(user));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/financial-settings') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await getFinancialSettings(user));
  }

  const broadcastConfigMatch = url.pathname.match(/^\/api\/broadcasts\/([^/]+)\/config$/);
  if (req.method === 'GET' && broadcastConfigMatch) {
    const broadcastId = decodeURIComponent(broadcastConfigMatch[1]);
    return sendJson(res, 200, await getBroadcastConfig(broadcastId));
  }

  const roundMatch = url.pathname.match(/^\/api\/rounds\/([^/]+)$/);
  if (req.method === 'GET' && roundMatch) {
    const round = await getRound(decodeURIComponent(roundMatch[1]));
    if (!round) return sendJson(res, 404, { error: 'Round not found' });
    return sendJson(res, 200, round);
  }

  const roundAuditMatch = url.pathname.match(/^\/api\/rounds\/([^/]+)\/audit$/);
  if (req.method === 'GET' && roundAuditMatch) {
    const roundId = decodeURIComponent(roundAuditMatch[1]);
    const audit = await getRoundAuditTrail(roundId, user);
    if (!audit) return sendJson(res, 404, { error: 'Round not found' });
    return sendJson(res, 200, audit);
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const result = await registerPlayer(body || {});
    setAuthCookie(res, result.token);
    return sendJson(res, 200, { user: result.user });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const result = await login(body || {});
    setAuthCookie(res, result.token);
    return sendJson(res, 200, { user: result.user });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/social-signup') {
    const result = await completeSocialSignup(body || {});
    setAuthCookie(res, result.token);
    return sendJson(res, 200, { user: result.user });
  }

  // File upload endpoint for receipts
  if (req.method === 'POST' && url.pathname === '/api/upload/receipt') {
    return handleFileUpload(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/game-types') {
    return sendJson(res, 200, await createGameTypeAction(body || {}, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/payment-methods') {
    return sendJson(res, 200, await createPaymentMethodAction(body || {}, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/rounds') {
    return sendJson(res, 200, await createRound(body || {}, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/promotions') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await createPromotionCampaign(body || {}, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/live-broadcast') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await createLiveBroadcast(body || {}, user));
  }

  const liveBroadcastActionMatch = url.pathname.match(/^\/api\/admin\/live-broadcast\/([^/]+)\/(start|stop|error)$/);
  if (req.method === 'POST' && liveBroadcastActionMatch) {
    const broadcastId = decodeURIComponent(liveBroadcastActionMatch[1]);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await toggleLiveBroadcast(broadcastId, liveBroadcastActionMatch[2], user));
  }

  if (req.method === 'POST' && url.pathname === '/api/wallet/deposit') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await createDeposit(body || {}, user));
  }

  if (req.method === 'POST' && url.pathname === '/api/wallet/withdraw') {
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await createWithdrawal(body || {}, user));
  }

  const depositCompleteMatch = url.pathname.match(/^\/api\/admin\/deposits\/([^/]+)\/complete$/);
  if (req.method === 'POST' && depositCompleteMatch) {
    const transactionId = decodeURIComponent(depositCompleteMatch[1]);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await completeDeposit(transactionId, user));
  }

  const depositRejectMatch = url.pathname.match(/^\/api\/admin\/deposits\/([^/]+)\/reject$/);
  if (req.method === 'POST' && depositRejectMatch) {
    const transactionId = decodeURIComponent(depositRejectMatch[1]);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await rejectDeposit(transactionId, body?.reason || 'Rejected by admin', user));
  }

  const withdrawalApproveMatch = url.pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/approve$/);
  if (req.method === 'POST' && withdrawalApproveMatch) {
    const transactionId = decodeURIComponent(withdrawalApproveMatch[1]);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await approveWithdrawal(transactionId, user));
  }

  const withdrawalRejectMatch = url.pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/reject$/);
  if (req.method === 'POST' && withdrawalRejectMatch) {
    const transactionId = decodeURIComponent(withdrawalRejectMatch[1]);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await rejectWithdrawal(transactionId, body?.reason || 'Rejected by admin', user));
  }

  const promotionTrackMatch = url.pathname.match(/^\/api\/admin\/promotions\/([^/]+)\/track$/);
  if (req.method === 'POST' && promotionTrackMatch) {
    const campaignId = decodeURIComponent(promotionTrackMatch[1]);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    return sendJson(res, 200, await trackPromotionEvent(campaignId, body?.eventType || 'click', user));
  }

  const paymentMethodToggleMatch = url.pathname.match(/^\/api\/admin\/payment-methods\/([^/]+)\/toggle$/);
  if (req.method === 'POST' && paymentMethodToggleMatch) {
    const paymentMethodId = decodeURIComponent(paymentMethodToggleMatch[1]);
    return sendJson(res, 200, await togglePaymentMethodAction(paymentMethodId, user));
  }

  const paymentMethodEditMatch = url.pathname.match(/^\/api\/admin\/payment-methods\/([^/]+)$/);
  if (req.method === 'PUT' && paymentMethodEditMatch) {
    const paymentMethodId = decodeURIComponent(paymentMethodEditMatch[1]);
    return sendJson(res, 200, await editPaymentMethodAction(paymentMethodId, body || {}, user));
  }

  const paymentMethodDeleteMatch = url.pathname.match(/^\/api\/admin\/payment-methods\/([^/]+)$/);
  if (req.method === 'DELETE' && paymentMethodDeleteMatch) {
    const paymentMethodId = decodeURIComponent(paymentMethodDeleteMatch[1]);
    return sendJson(res, 200, await deletePaymentMethodAction(paymentMethodId, user));
  }

  const userVerificationApproveMatch = url.pathname.match(/^\/api\/admin\/verifications\/([^/]+)\/approve$/);
  if (req.method === 'POST' && userVerificationApproveMatch) {
    const userId = decodeURIComponent(userVerificationApproveMatch[1]);
    return sendJson(res, 200, await approveUserVerification(userId, user));
  }

  const userVerificationRejectMatch = url.pathname.match(/^\/api\/admin\/verifications\/([^/]+)\/reject$/);
  if (req.method === 'POST' && userVerificationRejectMatch) {
    const userId = decodeURIComponent(userVerificationRejectMatch[1]);
    return sendJson(res, 200, await rejectUserVerification(userId, body?.reason || 'Verification rejected', user));
  }

  // OAuth callback handlers
  const oauthCallbackMatch = url.pathname.match(/^\/auth\/callback\/([^/]+)$/);
  if (oauthCallbackMatch) {
    const provider = decodeURIComponent(oauthCallbackMatch[1]);
    return handleOAuthCallback(req, res, url, provider);
  }

  // OAuth initiation endpoints
  if (req.method === 'GET' && url.pathname === '/auth/google') {
    return initiateOAuth(req, res, 'google');
  }
  if (req.method === 'GET' && url.pathname === '/auth/facebook') {
    return initiateOAuth(req, res, 'facebook');
  }
  if (req.method === 'GET' && url.pathname === '/auth/instagram') {
    return initiateOAuth(req, res, 'instagram');
  }
  if (req.method === 'GET' && url.pathname === '/auth/tiktok') {
    return initiateOAuth(req, res, 'tiktok');
  }
  if (req.method === 'GET' && url.pathname === '/auth/twitter') {
    return initiateOAuth(req, res, 'twitter');
  }
  if (req.method === 'GET' && url.pathname === '/auth/telegram') {
    return initiateOAuth(req, res, 'telegram');
  }

  if (req.method === 'PUT' && url.pathname === '/api/admin/financial-settings') {
    return sendJson(res, 200, await updateFinancialSettings(body || {}, user));
  }

  const joinMatch = url.pathname.match(/^\/api\/player\/rounds\/([^/]+)\/join$/);
  if (req.method === 'POST' && joinMatch) {
    const roundId = decodeURIComponent(joinMatch[1]);
    return sendJson(res, 200, await joinRound(roundId, body || {}, user));
  }

  const receiptMatch = url.pathname.match(/^\/api\/player\/entries\/([^/]+)\/receipt$/);
  if (req.method === 'POST' && receiptMatch) {
    const entryId = decodeURIComponent(receiptMatch[1]);
    return sendJson(res, 200, await attachPaymentReceipt(entryId, body || {}, user));
  }

  const verifyMatch = url.pathname.match(/^\/api\/admin\/payments\/([^/]+)\/verify$/);
  if (req.method === 'POST' && verifyMatch) {
    const entryId = decodeURIComponent(verifyMatch[1]);
    return sendJson(res, 200, await verifyPayment(entryId, user));
  }

  const rejectMatch = url.pathname.match(/^\/api\/admin\/payments\/([^/]+)\/reject$/);
  if (req.method === 'POST' && rejectMatch) {
    const entryId = decodeURIComponent(rejectMatch[1]);
    return sendJson(res, 200, await rejectPayment(entryId, body?.reason || 'Rejected by admin', user));
  }

  const drawMatch = url.pathname.match(/^\/api\/admin\/rounds\/([^/]+)\/draw$/);
  if (req.method === 'POST' && drawMatch) {
    const roundId = decodeURIComponent(drawMatch[1]);
    return sendJson(res, 200, await drawRound(roundId, user));
  }

  const completeMatch = url.pathname.match(/^\/api\/admin\/rounds\/([^/]+)\/complete$/);
  if (req.method === 'POST' && completeMatch) {
    const roundId = decodeURIComponent(completeMatch[1]);
    return sendJson(res, 200, await completeDraw(roundId, user));
  }

  const statusMatch = url.pathname.match(/^\/api\/admin\/rounds\/([^/]+)\/status$/);
  if (req.method === 'POST' && statusMatch) {
    const roundId = decodeURIComponent(statusMatch[1]);
    return sendJson(res, 200, await changeRoundStatus(roundId, body?.status, user));
  }

  sendJson(res, 404, { error: 'Route not found' });
}

async function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const payload = verifySignedToken(token);
  if (!payload?.userId) return null;
  return resolveUserFromCookie(token);
}

async function serveStatic(fileName, res) {
  const filePath = path.join(publicDir, fileName);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Asset not found' });
  }
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax' }));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

// OAuth Functions
function initiateOAuth(req, res, provider) {
  const config = OAUTH_CONFIG[provider];
  if (!config || !config.clientId) {
    return sendJson(res, 500, { error: `${provider} OAuth not configured` });
  }

  const authUrls = {
    google: 'https://accounts.google.com/o/oauth2/v2/auth',
    facebook: 'https://www.facebook.com/v18.0/dialog/oauth',
    instagram: 'https://api.instagram.com/oauth/authorize',
    tiktok: 'https://www.tiktok.com/v2/auth/authorize',
    twitter: 'https://twitter.com/i/oauth2/authorize',
    telegram: 'https://oauth.telegram.org/auth'
  };

  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = new URL(authUrls[provider]);

  authUrl.searchParams.append('client_id', config.clientId);
  authUrl.searchParams.append('redirect_uri', config.redirectUri);
  authUrl.searchParams.append('scope', config.scope);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('state', state);

  if (provider === 'telegram') {
    // Telegram uses a different flow
    authUrl.searchParams.append('bot_id', config.botToken);
  }

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}

async function handleOAuthCallback(req, res, url, provider) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return sendHtml(res, 400, `<h1>OAuth Error</h1><p>${escapeHtml(error)}</p>`);
  }

  if (!code) {
    return sendHtml(res, 400, '<h1>OAuth Error</h1><p>No authorization code provided</p>');
  }

  try {
    // This would exchange the code for an access token and get user info
    // For now, redirect to registration with social info
    const html = `
      <html>
        <head>
          <title>Social Sign-up</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; }
            input { width: 100%; padding: 8px; box-sizing: border-box; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; cursor: pointer; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <h1>Social Sign-up Successful</h1>
          <p>Connected with ${provider}</p>
          <p>Please complete your registration with additional information.</p>
          <form action="/api/auth/social-signup" method="POST">
            <input type="hidden" name="provider" value="${provider}">
            <input type="hidden" name="socialId" value="${code}">
            <div class="form-group">
              <label>Full Name:</label>
              <input type="text" name="fullName" required>
            </div>
            <div class="form-group">
              <label>Phone:</label>
              <input type="tel" name="phone" required>
            </div>
            <div class="form-group">
              <label>Location:</label>
              <input type="text" name="location">
            </div>
            <button type="submit">Complete Registration</button>
          </form>
        </body>
      </html>
    `;
    sendHtml(res, 200, html);
  } catch (error) {
    sendHtml(res, 500, `<h1>OAuth Error</h1><p>${escapeHtml(error.message)}</p>`);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function handleFileUpload(req, res) {
  const user = await currentUser(req);
  if (!user) {
    return sendJson(res, 401, { error: 'Authentication required' });
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
      uploadDir: path.join(__dirname, 'public', 'uploads'),
    });

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return sendJson(res, 400, { error: 'No file uploaded' });
    }

    // Validate file type
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const fileExtension = path.extname(file.originalFilename || '').toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      // Delete the uploaded file
      await fs.unlink(file.filepath).catch(() => { });
      return sendJson(res, 400, { error: 'Invalid file type. Only PDF, JPG, JPEG, PNG allowed' });
    }

    // Generate a unique filename
    const uniqueFilename = `${Date.now()}-${crypto.randomUUID()}${fileExtension}`;
    const finalPath = path.join(__dirname, 'public', 'uploads', uniqueFilename);

    // Move/rename the file
    await fs.rename(file.filepath, finalPath);

    // Return the URL
    const fileUrl = `/uploads/${uniqueFilename}`;
    return sendJson(res, 200, { url: fileUrl, filename: uniqueFilename });
  } catch (error) {
    console.error('File upload error:', error);
    return sendJson(res, 500, { error: 'File upload failed: ' + error.message });
  }
}
