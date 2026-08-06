import { renderLayout } from './layout.js';

export function renderHomePage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Home', page: 'home', user, content });
}

export function renderDashboardPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Dashboard', page: 'dashboard', user, content });
}

export function renderRoundPage({ user, roundId = '', content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Round', page: 'round', roundId, user, content });
}

export function renderLoginPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Login', page: 'login', user, content });
}

export function renderTermsPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Terms', page: 'terms', user, content });
}

export function renderGameRulesPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Game Rules', page: 'game-rules', user, content });
}

export function renderLivePage({ user, roundId = '', content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Live', page: 'live', roundId, user, content });
}

export function renderHistoryPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Winner History', page: 'history', user, content });
}

export function renderHistoryDetailPage({ user, roundId = '', content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | History Detail', page: 'history-detail', roundId, user, content });
}

export function renderAdminPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Admin', page: 'admin', user, content });
}

export function renderAuditPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Audit', page: 'audit', user, content });
}

export function renderWalletPage({ user, content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Wallet', page: 'wallet', user, content });
}

export function renderLivestreamPage({ user, broadcastId = '', content = '' } = {}) {
  return renderLayout({ title: 'TikWheel | Livestream', page: 'livestream', broadcastId, user, content });
}
