import crypto from 'node:crypto';
import { readState, writeState } from '../lib/store.js';
import { hashPassword, verifyPassword, createSignedToken, verifySignedToken } from '../lib/security.js';
import { ROLES, PAYMENT_STATUSES, ROUND_STATUSES, AUDIT_ACTIONS, USER_VERIFICATION_STATUSES, TRANSACTION_TYPES, TRANSACTION_STATUSES, NOTIFICATION_TYPES } from '../domain/statuses.js';
import { createGameType, createRoundFromGameType, getGameType, listActiveGameTypes } from '../domain/game-types.js';
import {
  attachReceipt,
  completeRound,
  expireStaleEntries,
  getAvailablePositions,
  getRoundEntries,
  getVerifiedEntries,
  lockPosition,
  refreshRoundStatus,
  selectRoundWinners,
  summarizeRound,
} from '../domain/rounds.js';
import { assertRoundStatusTransition } from '../domain/round-policy.js';
import { appendAudit, createAuditEntry } from '../domain/audit.js';
import { rejectEntry, verifyEntry } from '../domain/payments.js';
import {
  buildCampaignSummary,
  createCampaignSharePlan,
  isSupportedPromotionChannel,
  normalizeCampaignAnalytics,
  recordCampaignEvent,
} from '../domain/promotions.js';
import {
  approveWithdrawalTransaction,
  completeDepositTransaction,
  completeWithdrawalTransaction,
  createDepositTransaction,
  createWithdrawalTransaction,
  createPrizeTransaction,
  creditPrizeToWallet,
  failDepositTransaction,
  getAllPendingWithdrawals,
  getUserTransactions,
  getUserWallet,
  markWithdrawalPaid,
  markWithdrawalProcessing,
  markWithdrawalReadyForPayment,
  rejectWithdrawalTransaction,
  validateWithdrawalRequest,
} from '../domain/wallet.js';
import {
  createBroadcast,
  getBroadcastStreamConfig as getBroadcastStreamConfigInternal,
  getSupportedPlatforms,
  simulateBroadcastError,
  startBroadcast,
  stopBroadcast,
  updateBroadcastViewers,
  validateBroadcastPlatforms,
} from '../domain/live-broadcast.js';

const SUPER_ADMIN_EMAIL = 'konaneba8@gmail.com';

function now() {
  return new Date().toISOString();
}

function canAssignSuperAdminRole(email) {
  return String(email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

function requireRole(user, roles) {
  if (!user) throw new Error('Authentication required');
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) throw new Error('Forbidden');
}

function requireSuperAdmin(user) {
  requireRole(user, ROLES.SUPER_ADMIN);
}

function requireAdminOrSuperAdmin(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
}

function requireMoneyAdminOrSuperAdmin(user) {
  requireRole(user, [ROLES.MONEY_ADMIN, ROLES.SUPER_ADMIN]);
}

function requireGameAdminOrSuperAdmin(user) {
  requireRole(user, [ROLES.GAME_ADMIN, ROLES.SUPER_ADMIN]);
}

function requireWithdrawalAdminOrSuperAdmin(user) {
  requireRole(user, [ROLES.WITHDRAWAL_ADMIN, ROLES.SUPER_ADMIN]);
}

function canManageUsers(user) {
  return [ROLES.SUPER_ADMIN].includes(user.role);
}

function canManageFinances(user) {
  return [ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role);
}

function canManageGames(user) {
  return [ROLES.SUPER_ADMIN, ROLES.GAME_ADMIN].includes(user.role);
}

function canCreateRounds(user) {
  return [ROLES.SUPER_ADMIN, ROLES.GAME_ADMIN].includes(user.role);
}

function canDrawRounds(user) {
  return [ROLES.SUPER_ADMIN, ROLES.GAME_ADMIN].includes(user.role);
}

function canChangeRoundStatus(user) {
  return [ROLES.SUPER_ADMIN, ROLES.GAME_ADMIN].includes(user.role);
}

function canManagePaymentMethods(user) {
  return [ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(user.role);
}

function canProcessWithdrawals(user) {
  return [ROLES.SUPER_ADMIN, ROLES.WITHDRAWAL_ADMIN].includes(user.role);
}

function canApproveWithdrawals(user) {
  return [ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role);
}

async function mutateState(mutator) {
  const state = await readState();
  const result = await mutator(state);
  await writeState(state);
  return result;
}

export async function bootstrapState(user) {
  const state = await readState();
  if (!Array.isArray(state.paymentMethods)) {
    state.paymentMethods = [];
  }
  if (!Array.isArray(state.promotionCampaigns)) {
    state.promotionCampaigns = [];
  }
  if (!Array.isArray(state.promotionLogs)) {
    state.promotionLogs = [];
  }
  if (!Array.isArray(state.wallets)) {
    state.wallets = [];
  }
  if (!Array.isArray(state.transactions)) {
    state.transactions = [];
  }

  if (!Array.isArray(state.notifications)) {
    state.notifications = [];
  }

  if (!state.financialSettings) {
    state.financialSettings = buildFinancialSettings(state);
  }
  await processScheduledPromotions();
  const refreshedRounds = state.rounds.map((round) => summarizeRound(state, expireStaleEntries(refreshRoundStatus(round))));
  const playerDashboard = user && user.role === ROLES.PLAYER ? buildPlayerDashboard(state, user, refreshedRounds) : null;
  const adminPayments = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role) ? buildAdminPaymentQueue(state, refreshedRounds) : [];
  const promotionDashboard = buildPromotionDashboard(state);
  const walletDashboard = user ? buildWalletDashboard(state, user) : null;
  const withdrawalQueue = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN, ROLES.WITHDRAWAL_ADMIN].includes(user.role) ? buildWithdrawalQueue(state) : null;
  const depositQueue = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role) ? buildDepositQueue(state) : [];
  const pendingVerifications = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role) ? getPendingVerificationsInternal(state) : [];
  const financialSettings = user && [ROLES.SUPER_ADMIN].includes(user.role) ? buildFinancialSettings(state) : null;
  const adminUsers = user && [ROLES.SUPER_ADMIN].includes(user.role) ? state.users.filter((u) => [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN, ROLES.GAME_ADMIN, ROLES.WITHDRAWAL_ADMIN].includes(u.role)).map(publicUser) : [];
  return {
    appName: state.meta.appName,
    complianceMode: state.meta.complianceMode,
    legal: {
      termsVersion: state.meta.termsVersion || '1.0',
      gameRulesVersion: state.meta.gameRulesVersion || '1.0',
      termsEffectiveDate: state.meta.termsEffectiveDate || null,
      gameRulesEffectiveDate: state.meta.gameRulesEffectiveDate || null,
    },
    user: publicUser(user),
    gameTypes: state.gameTypes,
    paymentMethods: state.paymentMethods,
    rounds: refreshedRounds,
    activeGameTypes: listActiveGameTypes(state.gameTypes),
    auditLog: (state.auditLog || []).slice(0, 50),
    playerDashboard,
    adminPayments,
    adminSummary: buildAdminSummary(state, refreshedRounds),
    liveBroadcast: buildLiveBroadcastDashboard(state),
    promotionDashboard,
    promotionCampaigns: promotionDashboard.campaigns,
    walletDashboard,
    withdrawalQueue,
    depositQueue,
    pendingVerifications,
    financialSettings,
    adminUsers,
    users: state.users.map(publicUser),
    notifications: user ? (state.notifications || []).filter(n => !n.targetUserId || n.targetUserId === user.id).slice(0, 20) : [],
    winnerHistory: refreshedRounds
      .filter((round) => round.status === ROUND_STATUSES.COMPLETED || round.winners.length)
      .map((round) => ({
        id: round.id,
        number: round.number,
        gameTypeName: round.gameType?.name || '',
        winnerPositions: round.winners.map((winner) => winner.position),
        prize: round.prize,
        playerCount: getVerifiedEntries(round).length,
        status: round.status,
        updatedAt: round.updatedAt,
      })),
  };
}

function buildAdminSummary(state, rounds) {
  const counts = rounds.reduce(
    (acc, round) => {
      acc.totalRounds += 1;
      acc.totalPlayers += round.verifiedPlayerCount || 0;
      acc.readyRounds += round.status === ROUND_STATUSES.READY ? 1 : 0;
      acc.drawingRounds += round.status === ROUND_STATUSES.DRAWING ? 1 : 0;
      acc.completedRounds += round.status === ROUND_STATUSES.COMPLETED ? 1 : 0;
      return acc;
    },
    {
      totalRounds: 0,
      totalPlayers: 0,
      readyRounds: 0,
      drawingRounds: 0,
      completedRounds: 0,
    },
  );

  const pendingPayments = rounds.reduce(
    (count, round) => count + (round.entries || []).filter((entry) => entry.paymentStatus === PAYMENT_STATUSES.PENDING).length,
    0,
  );

  // Financial summary
  const transactions = state.transactions || [];
  const totalDeposits = transactions
    .filter(t => t.type === TRANSACTION_TYPES.DEPOSIT && t.status === TRANSACTION_STATUSES.COMPLETED)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalWithdrawals = transactions
    .filter(t => t.type === TRANSACTION_TYPES.WITHDRAW && t.status === TRANSACTION_STATUSES.COMPLETED)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const pendingDeposits = transactions
    .filter(t => t.type === TRANSACTION_TYPES.DEPOSIT && t.status === TRANSACTION_STATUSES.PENDING)
    .length;
  
  const pendingWithdrawals = transactions
    .filter(t => t.type === TRANSACTION_TYPES.WITHDRAW && t.status === TRANSACTION_STATUSES.PENDING)
    .length;
  
  const approvedWithdrawals = transactions
    .filter(t => t.type === TRANSACTION_TYPES.WITHDRAW && t.status === TRANSACTION_STATUSES.APPROVED)
    .length;
  
  const readyForPaymentWithdrawals = transactions
    .filter(t => t.type === TRANSACTION_TYPES.WITHDRAW && t.status === TRANSACTION_STATUSES.READY_FOR_PAYMENT)
    .length;
  
  const processingWithdrawals = transactions
    .filter(t => t.type === TRANSACTION_TYPES.WITHDRAW && t.status === TRANSACTION_STATUSES.PROCESSING)
    .length;
  
  const totalWalletBalance = (state.wallets || []).reduce((sum, w) => sum + w.balance, 0);
  
  const pendingVerifications = (state.users || []).filter(u => u.verificationStatus === USER_VERIFICATION_STATUSES.PENDING_VERIFICATION).length;
  
  const totalPrizesPaid = transactions
    .filter(t => t.type === 'PRIZE' && t.status === TRANSACTION_STATUSES.COMPLETED)
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    ...counts,
    pendingPayments,
    activePaymentMethods: (state.paymentMethods || []).filter((method) => method.isActive).length,
    financial: {
      totalDeposits,
      totalWithdrawals,
      pendingDeposits,
      pendingWithdrawals,
      approvedWithdrawals,
      readyForPaymentWithdrawals,
      processingWithdrawals,
      totalWalletBalance,
      totalPrizesPaid,
      netBalance: totalDeposits - totalWithdrawals - totalPrizesPaid,
    },
    pendingVerifications,
  };
}

function buildPlayerDashboard(state, user, rounds) {
  const entries = [];
  const roundsById = new Map();
  for (const round of rounds) {
    if (!roundsById.has(round.id)) {
      roundsById.set(round.id, {
        roundId: round.id,
        roundNumber: round.number,
        gameTypeName: round.gameType?.name || '',
        prize: round.prize,
        status: round.status,
        playerCount: round.verifiedPlayerCount,
        maxPlayers: round.maxPlayers,
        availablePositions: round.availablePositions,
        myEntryCount: 0,
        myVerifiedCount: 0,
        myPendingCount: 0,
        myRejectedCount: 0,
        myExpiredCount: 0,
      });
    }
    for (const entry of round.entries || []) {
      if (entry.userId !== user.id) continue;
      entries.push({
        ...entry,
        roundNumber: round.number,
        roundStatus: round.status,
        gameTypeName: round.gameType?.name || '',
        prize: round.prize,
        maxPlayers: round.maxPlayers,
        availablePositions: round.availablePositions,
      });
      const bucket = roundsById.get(round.id);
      bucket.myEntryCount += 1;
      if (entry.paymentStatus === PAYMENT_STATUSES.VERIFIED) bucket.myVerifiedCount += 1;
      if (entry.paymentStatus === PAYMENT_STATUSES.PENDING) bucket.myPendingCount += 1;
      if (entry.paymentStatus === PAYMENT_STATUSES.REJECTED) bucket.myRejectedCount += 1;
      if (entry.paymentStatus === PAYMENT_STATUSES.EXPIRED) bucket.myExpiredCount += 1;
    }
  }

  return {
    user: publicUser(user),
    activeRounds: rounds.filter((round) => ['OPEN', 'FILLING', 'FULL', 'READY'].includes(round.status)),
    myEntries: entries,
    myRounds: [...roundsById.values()].filter((round) => round.myEntryCount > 0).sort((a, b) => String(b.roundNumber).localeCompare(String(a.roundNumber))),
    myWinners: rounds
      .filter((round) => round.winners?.some((winner) => winner.userId === user.id))
      .map((round) => ({
        roundNumber: round.number,
        gameTypeName: round.gameType?.name || '',
        prize: round.prize,
        winningPositions: round.winners.filter((winner) => winner.userId === user.id).map((winner) => winner.position),
        status: round.status,
      })),
  };
}

function buildAdminPaymentQueue(state, rounds) {
  const entries = [];
  for (const round of rounds) {
    for (const entry of round.entries || []) {
      const player = state.users.find((user) => user.id === entry.userId) || null;
      entries.push({
        ...entry,
        roundId: round.id,
        roundNumber: round.number,
        gameTypeName: round.gameType?.name || '',
        playerName: player?.fullName || 'Unknown player',
        playerPhone: player?.phone || '',
        playerEmail: player?.email || '',
        prize: round.prize,
      });
    }
  }
  return entries
    .filter((entry) => entry.paymentStatus === PAYMENT_STATUSES.PENDING)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function buildPromotionDashboard(state) {
  const campaigns = (state.promotionCampaigns || []).map((campaign) => ({
    ...campaign,
    analytics: normalizeCampaignAnalytics(campaign.analytics),
    shares: Array.isArray(campaign.shares) ? campaign.shares : [],
  }));
  return {
    summary: buildCampaignSummary(state),
    campaigns: campaigns.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    logs: (state.promotionLogs || []).slice(0, 25),
  };
}


function buildLiveBroadcastDashboard(state) {
  const broadcasts = (state.liveBroadcasts || []).map((broadcast) => ({
    ...broadcast,
    platforms: Array.isArray(broadcast.platforms) ? broadcast.platforms : [],
    connectedPlatforms: Array.isArray(broadcast.connectedPlatforms) ? broadcast.connectedPlatforms : [],
    logEntries: Array.isArray(broadcast.logEntries) ? broadcast.logEntries : [],
    viewerCount: Number(broadcast.viewerCount || 0),
    durationSeconds: Number(broadcast.durationSeconds || 0),
  })).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));

  const active = broadcasts.find((broadcast) => broadcast.status === 'live') || null;
  return {
    supportedPlatforms: getSupportedPlatforms(),
    summary: {
      total: broadcasts.length,
      live: broadcasts.filter((broadcast) => broadcast.status === 'live').length,
      scheduled: broadcasts.filter((broadcast) => broadcast.status === 'scheduled').length,
      errors: broadcasts.filter((broadcast) => broadcast.status === 'error').length,
    },
    active,
    broadcasts,
  };
}

function buildWalletDashboard(state, user) {
  const wallet = getUserWallet(state, user.id);
  const transactions = getUserTransactions(state, user.id);
  return {
    wallet: {
      id: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
    },
    transactions: transactions.slice(0, 20),
  };
}

function buildWithdrawalQueue(state) {
  if (!Array.isArray(state.transactions)) {
    state.transactions = [];
  }

  const withdrawals = state.transactions.filter((txn) => txn.type === TRANSACTION_TYPES.WITHDRAW);
  
  const pending = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.PENDING);
  const approved = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.APPROVED);
  const readyForPayment = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.READY_FOR_PAYMENT);
  const processing = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.PROCESSING);
  const paid = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.PAID);
  const completed = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.COMPLETED);
  const rejected = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.REJECTED);
  const failed = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.FAILED);
  const cancelled = withdrawals.filter((w) => w.status === TRANSACTION_STATUSES.CANCELLED);

  const enrichWithdrawal = (withdrawal) => {
    const user = state.users.find((u) => u.id === withdrawal.userId);
    return {
      ...withdrawal,
      userName: user?.fullName || 'Unknown',
      userPhone: user?.phone || '',
      userEmail: user?.email || '',
    };
  };

  return {
    pending: pending.map(enrichWithdrawal),
    approved: approved.map(enrichWithdrawal),
    readyForPayment: readyForPayment.map(enrichWithdrawal),
    processing: processing.map(enrichWithdrawal),
    paid: paid.map(enrichWithdrawal),
    completed: completed.map(enrichWithdrawal),
    rejected: rejected.map(enrichWithdrawal),
    failed: failed.map(enrichWithdrawal),
    cancelled: cancelled.map(enrichWithdrawal),
    all: withdrawals.map(enrichWithdrawal).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
}

function createNotification(type, message, targetUserId = null, metadata = {}) {
  return {
    id: `notif_${crypto.randomUUID()}`,
    type,
    message,
    targetUserId,
    isRead: false,
    metadata,
    createdAt: now(),
  };
}

function addNotification(state, notification) {
  if (!Array.isArray(state.notifications)) {
    state.notifications = [];
  }
  state.notifications.unshift(notification);
  // Keep only last 100 notifications
  if (state.notifications.length > 100) {
    state.notifications = state.notifications.slice(0, 100);
  }
}

function buildDepositQueue(state) {
  if (!Array.isArray(state.transactions)) {
    state.transactions = [];
  }

  const pendingDeposits = state.transactions
    .filter((txn) => txn.type === TRANSACTION_TYPES.DEPOSIT && txn.status === TRANSACTION_STATUSES.PENDING)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  return pendingDeposits.map((deposit) => {
    const user = state.users.find((u) => u.id === deposit.userId);
    return {
      ...deposit,
      userName: user?.fullName || 'Unknown',
      userPhone: user?.phone || '',
      userEmail: user?.email || '',
    };
  });
}

function getPendingVerificationsInternal(state) {
  if (!Array.isArray(state.users)) {
    state.users = [];
  }

  return state.users
    .filter((u) => u.verificationStatus === USER_VERIFICATION_STATUSES.PENDING_VERIFICATION)
    .map((u) => publicUser(u))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function buildPaymentMethods(state) {
  if (!Array.isArray(state.paymentMethods)) {
    state.paymentMethods = [];
  }
  return state.paymentMethods;
}

function buildFinancialSettings(state) {
  if (!state.financialSettings) {
    state.financialSettings = {
      platformFee: 10,
      gameEntryPrice: 5,
      governmentTax: 15,
      minimumDeposit: 100,
      minimumWithdrawal: 500,
      currency: 'ETB',
      updatedAt: now(),
    };
  }
  return state.financialSettings;
}

export async function getFinancialSettings(user) {
  requireSuperAdmin(user);
  const state = await readState();
  return buildFinancialSettings(state);
}

export async function updateFinancialSettings(input, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const settings = buildFinancialSettings(state);

    const previousSettings = { ...settings };

    settings.platformFee = Number(input.platformFee !== undefined ? input.platformFee : settings.platformFee);
    settings.gameEntryPrice = Number(input.gameEntryPrice !== undefined ? input.gameEntryPrice : settings.gameEntryPrice);
    settings.governmentTax = Number(input.governmentTax !== undefined ? input.governmentTax : settings.governmentTax);
    settings.minimumDeposit = Number(input.minimumDeposit !== undefined ? input.minimumDeposit : settings.minimumDeposit);
    settings.minimumWithdrawal = Number(input.minimumWithdrawal !== undefined ? input.minimumWithdrawal : settings.minimumWithdrawal);
    settings.currency = String(input.currency || settings.currency).trim();
    settings.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.FINANCIAL_SETTINGS_UPDATED,
        entityType: 'FINANCIAL_SETTINGS',
        entityId: 'global',
        before: previousSettings,
        after: settings,
      }),
    );

    return settings;
  });
}

export async function createPromotionCampaign(input, actor) {
  requireAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const gameType = state.gameTypes.find((item) => item.id === input.gameTypeId);
    if (!gameType) throw new Error('Game type not found');

    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      throw new Error('Campaign start and end dates are required and must be valid');
    }

    const shareIntervalMinutes = Number(input.shareIntervalMinutes || 10);
    const targetLiveStreams = Number(input.targetLiveStreams || 1);
    const campaign = {
      id: `cmp_${crypto.randomUUID()}`,
      name: String(input.name || `${gameType.name} promotion`).trim() || `${gameType.name} promotion`,
      gameTypeId: gameType.id,
      gameTypeName: gameType.name,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      shareIntervalMinutes,
      targetLiveStreams,
      workflow: String(input.workflow || 'manual-review'),
      channel: String(input.channel || 'manual-approval-queue'),
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
      analytics: { clicks: 0, joins: 0, conversions: 0, conversionRate: 0 },
      shares: [],
    };

    const initialShares = createCampaignSharePlan(campaign, new Date(campaign.startAt), {
      intervalMinutes: campaign.shareIntervalMinutes,
      maxPlans: campaign.targetLiveStreams,
    });
    campaign.shares = initialShares;
    state.promotionCampaigns = state.promotionCampaigns || [];
    state.promotionCampaigns.unshift(campaign);

    state.promotionLogs = state.promotionLogs || [];
    state.promotionLogs.unshift({
      id: `log_${crypto.randomUUID()}`,
      campaignId: campaign.id,
      status: 'created',
      message: 'Campaign created and scheduled for approval',
      channel: campaign.channel,
      workflow: campaign.workflow,
      createdAt: now(),
    });

    return campaign;
  });
}

export async function getPromotionDashboard(user) {
  requireAdminOrSuperAdmin(user);
  const state = await readState();
  return buildPromotionDashboard(state);
}

export async function getLiveBroadcastDashboard(user) {
  requireAdminOrSuperAdmin(user);
  const state = await readState();
  return buildLiveBroadcastDashboard(state);
}

export async function createLiveBroadcast(input, actor) {
  requireAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    validateBroadcastPlatforms(Array.isArray(input.platforms) ? input.platforms : input.platforms?.split(',').map(p => p.trim()));
    const broadcast = createBroadcast(input);
    state.liveBroadcasts = Array.isArray(state.liveBroadcasts) ? state.liveBroadcasts : [];
    state.liveBroadcasts.unshift(broadcast);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.LIVE_BROADCAST_CREATED,
        entityType: 'LIVE_BROADCAST',
        entityId: broadcast.id,
        after: broadcast,
      }),
    );
    return broadcast;
  });
}

export async function toggleLiveBroadcast(broadcastId, action, actor) {
  requireAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const broadcast = (state.liveBroadcasts || []).find((item) => item.id === broadcastId);
    if (!broadcast) throw new Error('Broadcast not found');

    const auditAction = action === 'start' ? AUDIT_ACTIONS.LIVE_BROADCAST_STARTED :
      action === 'stop' ? AUDIT_ACTIONS.LIVE_BROADCAST_STOPPED : null;

    if (action === 'start') {
      startBroadcast(broadcast);
    } else if (action === 'stop') {
      stopBroadcast(broadcast);
    } else if (action === 'error') {
      simulateBroadcastError(broadcast);
    }

    if (auditAction) {
      appendAudit(
        state,
        createAuditEntry({
          actorUserId: actor.id,
          actorRole: actor.role,
          action: auditAction,
          entityType: 'LIVE_BROADCAST',
          entityId: broadcast.id,
          after: broadcast,
        }),
      );
    }

    return broadcast;
  });
}

export async function trackPromotionEvent(campaignId, eventType, actor) {
  requireAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const campaign = (state.promotionCampaigns || []).find((item) => item.id === campaignId);
    if (!campaign) throw new Error('Campaign not found');
    campaign.analytics = recordCampaignEvent(campaign.analytics, eventType);
    campaign.updatedAt = now();
    state.promotionLogs = state.promotionLogs || [];
    state.promotionLogs.unshift({
      id: `log_${crypto.randomUUID()}`,
      campaignId: campaign.id,
      status: 'tracked',
      message: `${eventType} recorded for campaign`,
      eventType,
      createdAt: now(),
    });
    return { campaign, summary: buildCampaignSummary(state) };
  });
}

export async function processScheduledPromotions() {
  const state = await readState();
  const campaigns = state.promotionCampaigns || [];
  let processed = 0;

  for (const campaign of campaigns) {
    if (!campaign || !campaign.id) continue;
    if (!Array.isArray(campaign.shares)) campaign.shares = [];

    const startAt = new Date(campaign.startAt);
    const endAt = new Date(campaign.endAt);
    const currentTime = Date.now();

    if (!Number.isNaN(startAt.getTime()) && currentTime >= startAt.getTime() && currentTime <= endAt.getTime()) {
      campaign.status = 'active';
    }
    if (!Number.isNaN(endAt.getTime()) && currentTime > endAt.getTime()) {
      campaign.status = 'completed';
    }

    const scheduled = createCampaignSharePlan(campaign, new Date(), {
      intervalMinutes: Number(campaign.shareIntervalMinutes || 10),
      maxPlans: Number(campaign.targetLiveStreams || 1),
    });

    for (const share of scheduled) {
      const exists = campaign.shares.some((entry) => entry.scheduledFor === share.scheduledFor);
      if (!exists) {
        campaign.shares.push(share);
      }
    }

    const dueShares = (campaign.shares || []).filter((share) => share.status === 'queued' && new Date(share.scheduledFor).getTime() <= currentTime);
    for (const share of dueShares) {
      try {
        if (!isSupportedPromotionChannel(share.channel, share.workflow)) {
          throw new Error('Unsupported or unauthorized promotion channel');
        }
        share.status = 'completed';
        share.completedAt = new Date().toISOString();
        share.updatedAt = new Date().toISOString();
        share.message = 'Scheduled share delivered through an approved workflow';
        state.promotionLogs = state.promotionLogs || [];
        state.promotionLogs.unshift({
          id: `log_${crypto.randomUUID()}`,
          campaignId: campaign.id,
          shareId: share.id,
          status: 'completed',
          message: share.message,
          channel: share.channel,
          workflow: share.workflow,
          createdAt: new Date().toISOString(),
        });
        processed += 1;
      } catch (error) {
        share.status = 'failed';
        share.errorLog = error?.message || 'Unknown scheduling failure';
        share.updatedAt = new Date().toISOString();
        state.promotionLogs = state.promotionLogs || [];
        state.promotionLogs.unshift({
          id: `log_${crypto.randomUUID()}`,
          campaignId: campaign.id,
          shareId: share.id,
          status: 'failed',
          message: 'Scheduled share blocked by policy-safe workflow validation',
          errorLog: share.errorLog,
          channel: share.channel,
          workflow: share.workflow,
          createdAt: new Date().toISOString(),
        });
      }
    }
    campaign.updatedAt = now();
  }

  await writeState(state);
  return { processed, summary: buildCampaignSummary(state) };
}

export async function registerPlayer(input) {
  return mutateState((state) => {
    const fullName = String(input.fullName || '').trim();
    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim().toLowerCase() || null;
    const password = String(input.password || '');
    const acceptTerms = String(input.acceptTerms || '').toLowerCase() === 'true' || input.acceptTerms === true;
    const acceptRules = String(input.acceptRules || '').toLowerCase() === 'true' || input.acceptRules === true;
    if (!fullName || !phone || !password) throw new Error('Name, phone, and password are required');
    if (!acceptTerms || !acceptRules) throw new Error('You must accept the terms and game rules');
    if (state.users.some((user) => user.phone === phone)) throw new Error('Phone already exists');
    if (email && state.users.some((user) => user.email === email)) throw new Error('Email already exists');

    // Automatically assign SUPER_ADMIN role to konaneba8@gmail.com
    const role = (email && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) ? ROLES.SUPER_ADMIN : ROLES.PLAYER;

    const { hash, salt } = hashPassword(password);
    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role,
      fullName,
      phone,
      email,
      passwordHash: hash,
      salt,
      location: String(input.location || '').trim() || null,
      verificationStatus: USER_VERIFICATION_STATUSES.PENDING_VERIFICATION,
      idDocumentUrl: input.idDocumentUrl || null,
      idDocumentType: input.idDocumentType || null,
      acceptedTermsVersion: state.meta.termsVersion || '1.0',
      acceptedGameRulesVersion: state.meta.gameRulesVersion || '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      // Social account information
      socialAccounts: input.socialAccounts || {},
      socialProvider: input.socialProvider || null,
      socialId: input.socialId || null,
      createdAt: now(),
      updatedAt: now(),
    };
    state.users.push(user);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: user.id,
        actorRole: user.role,
        action: AUDIT_ACTIONS.USER_REGISTERED,
        entityType: 'USER',
        entityId: user.id,
        after: publicUser(user),
        metadata: { message: 'Standard player registration' },
      }),
    );
    return { user: publicUser(user), token: createSignedToken({ userId: user.id, role: user.role }) };
  });
}

export async function login(input) {
  const state = await readState();
  const identifier = String(input.identifier || '').trim().toLowerCase();
  const password = String(input.password || '');
  const user = state.users.find((item) => item.email?.toLowerCase() === identifier || item.phone === identifier);
  if (!user) throw new Error('Invalid credentials');
  if (!verifyPassword(password, user.salt, user.passwordHash)) throw new Error('Invalid credentials');

  // Automatically upgrade konaneba8@gmail.com to SUPER_ADMIN if not already
  let roleUpgradeNeeded = false;
  if (user.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() && user.role !== ROLES.SUPER_ADMIN) {
    roleUpgradeNeeded = true;
  }

  const result = await mutateState((draft) => {
    const loginUser = draft.users.find((u) => u.id === user.id);
    
    if (roleUpgradeNeeded && loginUser) {
      loginUser.role = ROLES.SUPER_ADMIN;
      loginUser.verificationStatus = USER_VERIFICATION_STATUSES.VERIFIED;
      loginUser.updatedAt = now();
      
      appendAudit(
        draft,
        createAuditEntry({
          actorUserId: user.id,
          actorRole: ROLES.SUPER_ADMIN,
          action: AUDIT_ACTIONS.ADMIN_ROLE_CHANGED,
          entityType: 'USER',
          entityId: user.id,
          before: { role: user.role },
          after: { role: ROLES.SUPER_ADMIN },
          metadata: { reason: 'Automatic SUPER_ADMIN assignment' },
        }),
      );
    }

    // Allow users with pending verification to log in - verification happens later via admin
    // No verification check at login - account is created immediately with Pending Verification status

    appendAudit(
      draft,
      createAuditEntry({
        actorUserId: user.id,
        actorRole: roleUpgradeNeeded ? ROLES.SUPER_ADMIN : user.role,
        action: AUDIT_ACTIONS.USER_LOGGED_IN,
        entityType: 'USER',
        entityId: user.id,
        metadata: { loginMethod: 'credentials' },
      }),
    );
    
    return { role: roleUpgradeNeeded ? ROLES.SUPER_ADMIN : user.role };
  });
  
  // Update user role if it was upgraded
  if (roleUpgradeNeeded) {
    user.role = ROLES.SUPER_ADMIN;
    user.verificationStatus = USER_VERIFICATION_STATUSES.VERIFIED;
  }
  
  return { user: publicUser(user), token: createSignedToken({ userId: user.id, role: user.role }) };
}

export async function completeSocialSignup(input) {
  return mutateState((state) => {
    const fullName = String(input.fullName || '').trim();
    const phone = String(input.phone || '').trim();
    const location = String(input.location || '').trim() || null;
    const provider = String(input.provider || '').trim();
    const socialId = String(input.socialId || '').trim();

    if (!fullName || !phone) throw new Error('Name and phone are required');
    if (!provider) throw new Error('Social provider is required');

    // Check if user already exists with this social account
    const existingUser = state.users.find((user) =>
      user.socialProvider === provider && user.socialId === socialId
    );

    if (existingUser) {
      // User already exists, log them in
      return { user: publicUser(existingUser), token: createSignedToken({ userId: existingUser.id, role: existingUser.role }) };
    }

    // Check if phone already exists
    if (state.users.some((user) => user.phone === phone)) throw new Error('Phone already exists');

    // All new users start as PLAYER
    const role = ROLES.PLAYER;

    // Generate a random password for social sign-up users
    const { hash, salt } = hashPassword(crypto.randomUUID());

    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role,
      fullName,
      phone,
      email: null,
      passwordHash: hash,
      salt,
      location,
      verificationStatus: USER_VERIFICATION_STATUSES.PENDING_VERIFICATION,
      idDocumentUrl: input.idDocumentUrl || null,
      idDocumentType: input.idDocumentType || null,
      acceptedTermsVersion: state.meta.termsVersion || '1.0',
      acceptedGameRulesVersion: state.meta.gameRulesVersion || '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      socialAccounts: { [provider]: { id: socialId, connectedAt: now() } },
      socialProvider: provider,
      socialId: socialId,
      createdAt: now(),
      updatedAt: now(),
    };

    state.users.push(user);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: user.id,
        actorRole: user.role,
        action: AUDIT_ACTIONS.USER_REGISTERED,
        entityType: 'USER',
        entityId: user.id,
        after: publicUser(user),
        metadata: { socialProvider: provider, socialSignup: true },
      }),
    );

    return { user: publicUser(user), token: createSignedToken({ userId: user.id, role: user.role }) };
  });
}

export async function resolveUserFromCookie(cookieValue) {
  if (!cookieValue) return null;
  const payload = verifySignedToken(cookieValue);
  if (!payload?.userId) return null;
  const state = await readState();
  return publicUser(state.users.find((user) => user.id === payload.userId) || null);
}

export async function approveUserVerification(userId, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    user.verificationStatus = USER_VERIFICATION_STATUSES.VERIFIED;
    user.updatedAt = now();

    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.USER_VERIFICATION_APPROVED,
      'Your account has been verified',
      user.id,
      { userId: user.id }
    ));

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.USER_VERIFICATION_APPROVED,
        entityType: 'USER',
        entityId: user.id,
        before: { verificationStatus: USER_VERIFICATION_STATUSES.PENDING_VERIFICATION },
        after: { verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED },
      }),
    );

    return publicUser(user);
  });
}

export async function rejectUserVerification(userId, reason, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    user.verificationStatus = USER_VERIFICATION_STATUSES.REJECTED;
    user.verificationRejectionReason = String(reason || 'Verification rejected by admin');
    user.updatedAt = now();

    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.USER_VERIFICATION_REJECTED,
      `Your account verification has been rejected: ${reason}`,
      user.id,
      { userId: user.id, reason }
    ));

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.USER_VERIFICATION_REJECTED,
        entityType: 'USER',
        entityId: user.id,
        before: { verificationStatus: USER_VERIFICATION_STATUSES.PENDING_VERIFICATION },
        after: { verificationStatus: USER_VERIFICATION_STATUSES.REJECTED },
        metadata: { reason },
      }),
    );

    return publicUser(user);
  });
}

export async function createAdmin(input, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const fullName = String(input.fullName || '').trim();
    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const role = String(input.role || '').toUpperCase();

    if (!fullName || !phone || !email || !password) {
      throw new Error('Name, phone, email, and password are required');
    }

    if (state.users.some((user) => user.phone === phone)) {
      throw new Error('Phone already exists');
    }

    if (state.users.some((user) => user.email === email)) {
      throw new Error('Email already exists');
    }

    if (!Object.values(ROLES).includes(role)) {
      throw new Error('Invalid role');
    }

    if (role === ROLES.SUPER_ADMIN && !canAssignSuperAdminRole(email)) {
      throw new Error('Super Admin role can only be assigned to konaneba8@gmail.com');
    }

    const { hash, salt } = hashPassword(password);
    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role,
      fullName,
      phone,
      email,
      passwordHash: hash,
      salt,
      location: String(input.location || '').trim() || null,
      verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED,
      acceptedTermsVersion: state.meta.termsVersion || '1.0',
      acceptedGameRulesVersion: state.meta.gameRulesVersion || '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };

    state.users.push(user);

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ADMIN_CREATED,
        entityType: 'USER',
        entityId: user.id,
        after: publicUser(user),
        metadata: { role },
      }),
    );

    return publicUser(user);
  });
}

export async function updateAdmin(userId, input, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    const previousRole = user.role;
    const previousData = { ...publicUser(user) };

    if (input.fullName) user.fullName = String(input.fullName).trim();
    if (input.phone) {
      const newPhone = String(input.phone).trim();
      if (newPhone !== user.phone && state.users.some((u) => u.phone === newPhone && u.id !== userId)) {
        throw new Error('Phone already exists');
      }
      user.phone = newPhone;
    }
    if (input.email) {
      const newEmail = String(input.email).trim().toLowerCase();
      if (newEmail !== user.email && state.users.some((u) => u.email === newEmail && u.id !== userId)) {
        throw new Error('Email already exists');
      }
      user.email = newEmail;
    }
    if (input.location !== undefined) user.location = String(input.location).trim() || null;
    if (input.role) {
      const newRole = String(input.role).toUpperCase();
      if (!Object.values(ROLES).includes(newRole)) {
        throw new Error('Invalid role');
      }
      if (newRole === ROLES.SUPER_ADMIN && !canAssignSuperAdminRole(user.email)) {
        throw new Error('Super Admin role can only be assigned to konaneba8@gmail.com');
      }
      user.role = newRole;
    }
    if (input.password) {
      const { hash, salt } = hashPassword(input.password);
      user.passwordHash = hash;
      user.salt = salt;
    }

    user.updatedAt = now();

    const actionType = previousRole !== user.role ? AUDIT_ACTIONS.ADMIN_ROLE_CHANGED : AUDIT_ACTIONS.ADMIN_UPDATED;
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: actionType,
        entityType: 'USER',
        entityId: user.id,
        before: previousData,
        after: publicUser(user),
        metadata: { roleChanged: previousRole !== user.role, previousRole, newRole: user.role },
      }),
    );

    return publicUser(user);
  });
}

export async function deleteAdmin(userId, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const userIndex = state.users.findIndex((item) => item.id === userId);
    if (userIndex === -1) throw new Error('User not found');

    const user = state.users[userIndex];
    if (user.id === actor.id) throw new Error('Cannot delete yourself');

    const previousData = publicUser(user);
    state.users.splice(userIndex, 1);

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ADMIN_DELETED,
        entityType: 'USER',
        entityId: user.id,
        before: previousData,
      }),
    );

    return { success: true };
  });
}

export async function listAdmins(actor) {
  requireSuperAdmin(actor);
  const state = await readState();
  return state.users
    .filter((user) => [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN, ROLES.GAME_ADMIN].includes(user.role))
    .map(publicUser)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function suspendUser(userId, input, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');
    if (user.id === actor.id) throw new Error('Cannot suspend yourself');

    const previousStatus = user.isActive;
    user.isActive = false;
    user.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.USER_SUSPENDED,
        entityType: 'USER',
        entityId: user.id,
        before: { isActive: previousStatus },
        after: { isActive: false },
        metadata: { suspendedBy: actor.fullName, reason: input?.reason || 'Administrative action' },
      }),
    );

    return publicUser(user);
  });
}

export async function activateUser(userId, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    const previousStatus = user.isActive;
    user.isActive = true;
    user.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.USER_ACTIVATED,
        entityType: 'USER',
        entityId: user.id,
        before: { isActive: previousStatus },
        after: { isActive: true },
      }),
    );

    return publicUser(user);
  });
}

export async function getPendingVerifications(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  const state = await readState();
  return state.users
    .filter((u) => u.verificationStatus === USER_VERIFICATION_STATUSES.PENDING_VERIFICATION)
    .map((u) => publicUser(u))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function updateUserProfile(userId, input, actor) {
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    // Users can only update their own profile
    if (user.id !== actor.id) {
      throw new Error('Forbidden: Can only update your own profile');
    }

    // Allow updating ID document for verification
    if (input.idDocumentUrl !== undefined) {
      user.idDocumentUrl = input.idDocumentUrl;
    }
    if (input.idDocumentType !== undefined) {
      user.idDocumentType = input.idDocumentType;
    }

    user.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.USER_PROFILE_UPDATED,
        entityType: 'USER',
        entityId: user.id,
        after: { idDocumentUrl: user.idDocumentUrl, idDocumentType: user.idDocumentType },
      }),
    );

    return publicUser(user);
  });
}

export async function listRoundSummaries() {
  return bootstrapState(null).then((data) => data.rounds);
}

export async function getPlayerDashboard(user) {
  if (!user) throw new Error('Authentication required');
  const state = await readState();
  const refreshedRounds = state.rounds.map((round) => summarizeRound(state, expireStaleEntries(refreshRoundStatus(round))));
  return buildPlayerDashboard(state, user, refreshedRounds);
}

export async function getAdminPaymentQueue(user) {
  requireAdminOrSuperAdmin(user);
  const state = await readState();
  const refreshedRounds = state.rounds.map((round) => summarizeRound(state, expireStaleEntries(refreshRoundStatus(round))));
  return buildAdminPaymentQueue(state, refreshedRounds);
}

export async function getPaymentMethods() {
  const state = await readState();
  const methods = buildPaymentMethods(state);
  // Only return active payment methods for users
  return methods.filter(method => method.isActive).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

export async function getAdminPaymentMethods(user) {
  requireAdminOrSuperAdmin(user);
  const state = await readState();
  const methods = buildPaymentMethods(state);
  // Return all payment methods for admin (including inactive)
  return methods.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

export async function getRoundAuditTrail(roundId, user = null) {
  const state = await readState();
  const round = state.rounds.find((item) => item.id === roundId || item.number === roundId);
  if (!round) return null;
  const entryIds = new Set((round.entries || []).map((entry) => entry.id));
  const trail = (state.auditLog || [])
    .filter((log) => log.entityId === round.id || entryIds.has(log.entityId))
    .map((log) => ({
      ...log,
      actor: state.users.find((candidate) => candidate.id === log.actorUserId)
        ? publicUser(state.users.find((candidate) => candidate.id === log.actorUserId))
        : null,
    }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  return {
    round: summarizeRound(state, expireStaleEntries(refreshRoundStatus(round))),
    user: publicUser(user),
    trail,
  };
}

export async function getAuditLog() {
  const state = await readState();
  const audit = (state.auditLog || []).map((log) => ({
    ...log,
    actor: state.users.find((candidate) => candidate.id === log.actorUserId)
      ? publicUser(state.users.find((candidate) => candidate.id === log.actorUserId))
      : null,
  }));
  return audit.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function changeRoundStatus(roundId, nextStatus, actor) {
  requireGameAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const round = state.rounds.find((item) => item.id === roundId || item.number === roundId);
    if (!round) throw new Error('Round not found');
    const allowedStatuses = Object.values(ROUND_STATUSES);
    if (!allowedStatuses.includes(nextStatus)) throw new Error('Invalid round status');
    const previousStatus = round.status;
    assertRoundStatusTransition(previousStatus, nextStatus);
    round.status = nextStatus;
    round.updatedAt = now();
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ROUND_STATUS_CHANGED,
        entityType: 'ROUND',
        entityId: round.id,
        before: { status: previousStatus },
        after: { status: nextStatus },
        metadata: { previousStatus, nextStatus },
      }),
    );
    return summarizeRound(state, round);
  });
}

export async function createRound(input, actor) {
  requireGameAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const gameType = getGameType(state.gameTypes, input.gameTypeId);
    if (!gameType) throw new Error('Game type not found');
    const round = createRoundFromGameType(gameType, input);
    round.number = input.number || `ROUND ${String(state.rounds.length + 1).padStart(3, '0')}`;
    state.rounds.unshift(round);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ROUND_CREATED,
        entityType: 'ROUND',
        entityId: round.id,
        after: round,
      }),
    );
    return summarizeRound(state, round);
  });
}

export async function createGameTypeAction(input, actor) {
  requireGameAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const gameType = createGameType(input);
    state.gameTypes.unshift(gameType);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.GAME_TYPE_CREATED,
        entityType: 'GAME_TYPE',
        entityId: gameType.id,
        after: gameType,
      }),
    );
    return gameType;
  });
}

export async function createPaymentMethodAction(input, actor) {
  if (!canManagePaymentMethods(actor)) throw new Error('Forbidden');
  return mutateState((state) => {
    const paymentMethods = buildPaymentMethods(state);
    const paymentMethod = {
      id: `pay_${crypto.randomUUID()}`,
      name: String(input.name || '').trim(),
      bankName: String(input.bankName || '').trim(),
      accountName: String(input.accountName || '').trim(),
      accountNumber: String(input.accountNumber || '').trim(),
      walletName: String(input.walletName || '').trim(),
      walletNumber: String(input.walletNumber || '').trim(),
      paymentType: String(input.paymentType || 'bank').trim().toLowerCase(),
      displayOrder: Number(input.displayOrder || 0),
      isActive: input.isActive !== false,
      createdBy: actor.id,
      createdAt: now(),
      updatedAt: now(),
    };
    
    if (!paymentMethod.name) throw new Error('Payment method name is required');
    if (!paymentMethod.paymentType || !['bank', 'wallet'].includes(paymentMethod.paymentType)) {
      throw new Error('Payment type must be either "bank" or "wallet"');
    }
    if (paymentMethod.paymentType === 'bank' && (!paymentMethod.bankName || !paymentMethod.accountNumber)) {
      throw new Error('Bank name and account number are required for bank payment type');
    }
    if (paymentMethod.paymentType === 'wallet' && (!paymentMethod.walletName || !paymentMethod.walletNumber)) {
      throw new Error('Wallet name and wallet number are required for wallet payment type');
    }
    
    paymentMethods.unshift(paymentMethod);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.PAYMENT_METHOD_CREATED,
        entityType: 'PAYMENT_METHOD',
        entityId: paymentMethod.id,
        after: paymentMethod,
      }),
    );
    return paymentMethod;
  });
}

export async function togglePaymentMethodAction(paymentMethodId, actor) {
  if (!canManagePaymentMethods(actor)) throw new Error('Forbidden');
  return mutateState((state) => {
    const paymentMethods = buildPaymentMethods(state);
    const paymentMethod = paymentMethods.find((item) => item.id === paymentMethodId);
    if (!paymentMethod) throw new Error('Payment method not found');
    paymentMethod.isActive = !paymentMethod.isActive;
    paymentMethod.updatedAt = now();
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.PAYMENT_METHOD_TOGGLED,
        entityType: 'PAYMENT_METHOD',
        entityId: paymentMethod.id,
        after: paymentMethod,
      }),
    );
    return paymentMethod;
  });
}

export async function editPaymentMethodAction(paymentMethodId, input, actor) {
  if (!canManagePaymentMethods(actor)) throw new Error('Forbidden');
  return mutateState((state) => {
    const paymentMethods = buildPaymentMethods(state);
    const paymentMethod = paymentMethods.find((item) => item.id === paymentMethodId);
    if (!paymentMethod) throw new Error('Payment method not found');

    const previousData = { ...paymentMethod };

    paymentMethod.name = String(input.name || paymentMethod.name).trim();
    paymentMethod.bankName = String(input.bankName || paymentMethod.bankName).trim();
    paymentMethod.accountName = String(input.accountName || paymentMethod.accountName).trim();
    paymentMethod.accountNumber = String(input.accountNumber || paymentMethod.accountNumber).trim();
    paymentMethod.walletName = String(input.walletName || paymentMethod.walletName).trim();
    paymentMethod.walletNumber = String(input.walletNumber || paymentMethod.walletNumber).trim();
    paymentMethod.paymentType = String(input.paymentType || paymentMethod.paymentType).trim().toLowerCase();
    paymentMethod.displayOrder = Number(input.displayOrder !== undefined ? input.displayOrder : paymentMethod.displayOrder);
    paymentMethod.isActive = input.isActive !== undefined ? input.isActive : paymentMethod.isActive;
    paymentMethod.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.PAYMENT_METHOD_UPDATED,
        entityType: 'PAYMENT_METHOD',
        entityId: paymentMethod.id,
        before: previousData,
        after: paymentMethod,
      }),
    );
    return paymentMethod;
  });
}

export async function deletePaymentMethodAction(paymentMethodId, actor) {
  if (!canManagePaymentMethods(actor)) throw new Error('Forbidden');
  return mutateState((state) => {
    const paymentMethods = buildPaymentMethods(state);
    const index = paymentMethods.findIndex((item) => item.id === paymentMethodId);
    if (index === -1) throw new Error('Payment method not found');

    const deleted = paymentMethods.splice(index, 1)[0];

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.PAYMENT_METHOD_DELETED,
        entityType: 'PAYMENT_METHOD',
        entityId: deleted.id,
        before: deleted,
      }),
    );

    return deleted;
  });
}

export async function joinRound(roundId, input, actor) {
  requireRole(actor, ROLES.PLAYER);
  return mutateState((state) => {
    const round = state.rounds.find((item) => item.id === roundId || item.number === roundId);
    if (!round) throw new Error('Round not found');
    const refreshed = expireStaleEntries(round);
    Object.assign(round, refreshed);
    const availablePositions = getAvailablePositions(round);
    const position = Number(input.position);
    if (!availablePositions.includes(position)) throw new Error('Position unavailable');
    const entry = lockPosition(round, actor.id, position, state.meta.entryLockMinutes);
    if (input.receiptUrl || input.reference) {
      Object.assign(entry, attachReceipt(entry, input));
    }
    Object.assign(round, refreshRoundStatus(round));
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ENTRY_LOCKED,
        entityType: 'ROUND_ENTRY',
        entityId: entry.id,
        after: entry,
      }),
    );
    return { round: summarizeRound(state, round), entry };
  });
}

export async function attachPaymentReceipt(entryId, input, actor) {
  requireRole(actor, ROLES.PLAYER);
  return mutateState((state) => {
    for (const round of state.rounds) {
      const entry = getRoundEntries(round).find((item) => item.id === entryId && item.userId === actor.id);
      if (!entry) continue;
      Object.assign(entry, attachReceipt(entry, input));
      appendAudit(
        state,
        createAuditEntry({
          actorUserId: actor.id,
          actorRole: actor.role,
          action: AUDIT_ACTIONS.PAYMENT_RECEIPT_UPLOADED,
          entityType: 'ROUND_ENTRY',
          entityId: entry.id,
          after: entry,
        }),
      );
      return entry;
    }
    throw new Error('Entry not found');
  });
}

export async function verifyPayment(entryId, actor) {
  requireAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    for (const round of state.rounds) {
      const entry = getRoundEntries(round).find((item) => item.id === entryId);
      if (!entry) continue;
      Object.assign(entry, verifyEntry(entry));
      Object.assign(round, refreshRoundStatus(round));
      appendAudit(
        state,
        createAuditEntry({
          actorUserId: actor.id,
          actorRole: actor.role,
          action: AUDIT_ACTIONS.PAYMENT_VERIFIED,
          entityType: 'ROUND_ENTRY',
          entityId: entry.id,
          after: entry,
        }),
      );
      return summarizeRound(state, round);
    }
    throw new Error('Entry not found');
  });
}

export async function rejectPayment(entryId, reason, actor) {
  requireAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    for (const round of state.rounds) {
      const entry = getRoundEntries(round).find((item) => item.id === entryId);
      if (!entry) continue;
      Object.assign(entry, rejectEntry(entry, reason));
      Object.assign(round, refreshRoundStatus(round));
      appendAudit(
        state,
        createAuditEntry({
          actorUserId: actor.id,
          actorRole: actor.role,
          action: AUDIT_ACTIONS.PAYMENT_REJECTED,
          entityType: 'ROUND_ENTRY',
          entityId: entry.id,
          after: entry,
        }),
      );
      return summarizeRound(state, round);
    }
    throw new Error('Entry not found');
  });
}
export async function getBroadcastStreamConfig(broadcastId) {
  const state = await readState();
  const broadcast = (state.liveBroadcasts || []).find((item) => item.id === broadcastId);

  if (!broadcast) {
    throw new Error('Broadcast not found');
  }

  return getBroadcastStreamConfigInternal(broadcast);
}
export async function drawRound(roundId, actor) {
  requireGameAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const round = state.rounds.find((item) => item.id === roundId || item.number === roundId);
    if (!round) throw new Error('Round not found');
    const prepared = expireStaleEntries(round);
    Object.assign(round, prepared);
    const gameType = getGameType(state.gameTypes, round.gameTypeId);
    const winnerCount = gameType?.winnerCount || 1;
    const result = selectRoundWinners(round, winnerCount);
    Object.assign(round, result.round);

    // Automatically credit prizes to winners
    for (const winner of result.winners) {
      const user = state.users.find((u) => u.id === winner.userId);
      if (user) {
        const wallet = getUserWallet(state, user.id);
        const prizeTransaction = createPrizeTransaction(user.id, round.prize, round.id, winner.position);
        state.transactions = state.transactions || [];
        state.transactions.unshift(prizeTransaction);

        const prizeResult = creditPrizeToWallet(prizeTransaction, wallet);

        // Create notification for user
        addNotification(state, createNotification(
          NOTIFICATION_TYPES.PRIZE_CREDITED,
          `Congratulations! You won ${round.prize} ETB as prize for position ${winner.position}`,
          user.id,
          { amount: round.prize, roundId: round.id, position: winner.position, transactionId: prizeTransaction.id }
        ));

        appendAudit(
          state,
          createAuditEntry({
            actorUserId: actor.id,
            actorRole: actor.role,
            action: AUDIT_ACTIONS.PRIZE_PAYMENT_CREDITED,
            entityType: 'WALLET_TRANSACTION',
            entityId: prizeTransaction.id,
            after: prizeResult,
            metadata: { userId: user.id, roundId: round.id, position: winner.position, amount: round.prize },
          }),
        );
      }
    }

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ROUND_WINNERS_SELECTED,
        entityType: 'ROUND',
        entityId: round.id,
        after: round.winnerSelection,
      }),
    );
    return {
      round: summarizeRound(state, round),
      selection: round.winnerSelection,
      wheel: result.wheel,
      winners: result.winners,
    };
  });
}

export async function completeDraw(roundId, actor) {
  requireGameAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const round = state.rounds.find((item) => item.id === roundId || item.number === roundId);
    if (!round) throw new Error('Round not found');
    Object.assign(round, completeRound(round));
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ROUND_COMPLETED,
        entityType: 'ROUND',
        entityId: round.id,
        after: round,
      }),
    );
    return summarizeRound(state, round);
  });
}

export async function getRound(roundId) {
  const state = await readState();
  const round = state.rounds.find((item) => item.id === roundId || item.number === roundId);
  if (!round) return null;
  Object.assign(round, expireStaleEntries(round));
  Object.assign(round, refreshRoundStatus(round));
  return summarizeRound(state, round);
}

export async function getHistory() {
  const state = await readState();
  return state.rounds
    .filter((round) => round.winners?.length || round.status === ROUND_STATUSES.COMPLETED)
    .map((round) => summarizeRound(state, round));
}

export async function getWalletDashboard(user) {
  if (!user) throw new Error('Authentication required');
  const state = await readState();
  return buildWalletDashboard(state, user);
}

export async function createDeposit(input, actor) {
  requireRole(actor, ROLES.PLAYER);
  return mutateState((state) => {
    const user = state.users.find((u) => u.id === actor.id);
    if (!user) throw new Error('User not found');

    // Check if user is verified before allowing deposit
    if (user.verificationStatus !== USER_VERIFICATION_STATUSES.VERIFIED) {
      throw new Error('Account must be verified before making deposits. Please wait for admin approval.');
    }

    const wallet = getUserWallet(state, actor.id);

    // Make referral number optional
    const paymentDetails = {
      ...input.paymentDetails,
      referralNumber: input.paymentDetails?.referralNumber || null,
    };

    // Require payment receipt
    if (!input.paymentDetails?.receiptUrl) {
      throw new Error('Payment receipt upload is required');
    }

    // Validate receipt file type (PDF, JPG, JPEG, PNG only)
    const receiptUrl = String(input.paymentDetails.receiptUrl).toLowerCase();
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const hasValidExtension = validExtensions.some(ext => receiptUrl.endsWith(ext));
    if (!hasValidExtension) {
      throw new Error('Payment receipt must be PDF, JPG, JPEG, or PNG format only');
    }

    paymentDetails.idDocumentUrl = input.paymentDetails.idDocumentUrl;
    paymentDetails.receiptUrl = input.paymentDetails.receiptUrl;

    const transaction = createDepositTransaction(actor.id, input.amount, input.paymentMethod, paymentDetails);
    state.transactions = state.transactions || [];
    state.transactions.unshift(transaction);
    
    // Create notification for admins
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.NEW_DEPOSIT,
      `New deposit request: ${input.amount} ETB from ${actor.fullName}`,
      null,
      { userId: actor.id, amount: input.amount, transactionId: transaction.id }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_DEPOSIT_CREATED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: transaction,
      }),
    );
    return { transaction, wallet };
  });
}

export async function completeDeposit(transactionId, actor) {
  requireMoneyAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = getUserWallet(state, transaction.userId);
    const result = completeDepositTransaction(transaction, wallet);
    
    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.DEPOSIT_APPROVED,
      `Your deposit of ${transaction.amount} ETB has been approved and credited to your wallet`,
      transaction.userId,
      { amount: transaction.amount, transactionId: transaction.id }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_DEPOSIT_COMPLETED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result.transaction,
      }),
    );
    return result;
  });
}

export async function rejectDeposit(transactionId, reason, actor) {
  requireMoneyAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const result = failDepositTransaction(transaction, reason);
    
    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.DEPOSIT_REJECTED,
      `Your deposit of ${transaction.amount} ETB has been rejected: ${reason}`,
      transaction.userId,
      { amount: transaction.amount, transactionId: transaction.id, reason }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_DEPOSIT_REJECTED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result,
        metadata: { reason },
      }),
    );
    return result;
  });
}

export async function createWithdrawal(input, actor) {
  requireRole(actor, ROLES.PLAYER);
  return mutateState((state) => {
    const user = state.users.find((u) => u.id === actor.id);
    if (!user) throw new Error('User not found');

    // Check if user is verified before allowing withdrawal
    if (user.verificationStatus !== USER_VERIFICATION_STATUSES.VERIFIED) {
      throw new Error('Account must be verified before making withdrawals. Please wait for admin approval.');
    }

    const wallet = getUserWallet(state, actor.id);
    validateWithdrawalRequest(input.amount, wallet.balance);
    const transaction = createWithdrawalTransaction(actor.id, input.amount, input.paymentDetails);
    state.transactions = state.transactions || [];
    state.transactions.unshift(transaction);
    
    // Create notification for admins
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.NEW_WITHDRAWAL,
      `New withdrawal request: ${input.amount} ETB from ${actor.fullName}`,
      null,
      { userId: actor.id, amount: input.amount, transactionId: transaction.id }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_CREATED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: transaction,
      }),
    );
    return { transaction, wallet };
  });
}

export async function approveWithdrawal(transactionId, actor) {
  requireMoneyAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = getUserWallet(state, transaction.userId);
    const result = approveWithdrawalTransaction(transaction, wallet);
    
    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.WITHDRAWAL_APPROVED,
      `Your withdrawal request of ${transaction.amount} ETB has been approved`,
      transaction.userId,
      { amount: transaction.amount, transactionId: transaction.id }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_APPROVED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result.transaction,
      }),
    );
    return result;
  });
}

export async function setWithdrawalReadyForPayment(transactionId, actor) {
  requireMoneyAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const result = markWithdrawalReadyForPayment(transaction);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_READY_FOR_PAYMENT,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result,
      }),
    );
    return result;
  });
}

export async function setWithdrawalProcessing(transactionId, actor) {
  requireWithdrawalAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    
    // Prevent withdrawal admin from processing their own withdrawal
    if (actor.role === ROLES.WITHDRAWAL_ADMIN && transaction.userId === actor.id) {
      throw new Error('Withdrawal Admin cannot process their own withdrawal request');
    }
    
    const result = markWithdrawalProcessing(transaction);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_PROCESSING,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result,
      }),
    );
    return result;
  });
}

export async function setWithdrawalPaid(transactionId, transferProof, actor) {
  requireWithdrawalAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    
    // Prevent withdrawal admin from paying their own withdrawal
    if (actor.role === ROLES.WITHDRAWAL_ADMIN && transaction.userId === actor.id) {
      throw new Error('Withdrawal Admin cannot pay their own withdrawal request');
    }
    
    const result = markWithdrawalPaid(transaction, transferProof);
    
    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.WITHDRAWAL_PAID,
      `Your withdrawal of ${transaction.amount} ETB has been paid`,
      transaction.userId,
      { amount: transaction.amount, transactionId: transaction.id }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_PAID,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result,
        metadata: { transferProof },
      }),
    );
    return result;
  });
}

export async function completeWithdrawal(transactionId, actor) {
  requireWithdrawalAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = getUserWallet(state, transaction.userId);
    const result = completeWithdrawalTransaction(transaction, wallet);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_COMPLETED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result.transaction,
      }),
    );
    return result;
  });
}

export async function getNotifications(user) {
  if (!user) return [];
  const state = await readState();
  return (state.notifications || [])
    .filter(n => !n.targetUserId || n.targetUserId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 50);
}

export async function markNotificationRead(notificationId, actor) {
  if (!actor) throw new Error('Authentication required');
  return mutateState((state) => {
    const notification = (state.notifications || []).find(n => n.id === notificationId);
    if (!notification) throw new Error('Notification not found');
    if (notification.targetUserId && notification.targetUserId !== actor.id) {
      throw new Error('Forbidden');
    }
    notification.isRead = true;
    notification.updatedAt = now();
    return notification;
  });
}

export async function rejectWithdrawal(transactionId, reason, actor) {
  requireMoneyAdminOrSuperAdmin(actor);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const result = rejectWithdrawalTransaction(transaction, reason);
    
    // Create notification for user
    addNotification(state, createNotification(
      NOTIFICATION_TYPES.WITHDRAWAL_REJECTED,
      `Your withdrawal request of ${transaction.amount} ETB has been rejected: ${reason}`,
      transaction.userId,
      { amount: transaction.amount, transactionId: transaction.id, reason }
    ));
    
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.WALLET_WITHDRAWAL_REJECTED,
        entityType: 'WALLET_TRANSACTION',
        entityId: transaction.id,
        after: result,
        metadata: { reason },
      }),
    );
    return result;
  });
}

export async function getWithdrawalQueue(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN, ROLES.WITHDRAWAL_ADMIN]);
  const state = await readState();
  return buildWithdrawalQueue(state);
}

export async function getDepositQueue(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  const state = await readState();
  return buildDepositQueue(state);
}

export async function createSuperAdmin(input, actor) {
  requireSuperAdmin(actor);
  return mutateState((state) => {
    const fullName = String(input.fullName || '').trim();
    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');

    if (!fullName || !phone || !email || !password) {
      throw new Error('Name, phone, email, and password are required');
    }

    // Check if email matches the designated Super Admin email
    if (email !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error(`Only ${SUPER_ADMIN_EMAIL} can be created as Super Admin`);
    }

    // Check if user already exists
    if (state.users.some((user) => user.phone === phone)) throw new Error('Phone already exists');
    if (state.users.some((user) => user.email === email)) throw new Error('Email already exists');

    const { hash, salt } = hashPassword(password);
    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role: ROLES.SUPER_ADMIN,
      fullName,
      phone,
      email,
      passwordHash: hash,
      salt,
      location: null,
      verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED,
      acceptedTermsVersion: state.meta.termsVersion || '1.0',
      acceptedGameRulesVersion: state.meta.gameRulesVersion || '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    state.users.push(user);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: AUDIT_ACTIONS.ADMIN_CREATED,
        entityType: 'USER',
        entityId: user.id,
        after: publicUser(user),
        metadata: { message: 'Super Admin created manually', createdBy: actor.id },
      }),
    );
    return { user: publicUser(user), token: createSignedToken({ userId: user.id, role: user.role }) };
  });
}

export async function setupSuperAdmin(input) {
  return mutateState((state) => {
    const fullName = String(input.fullName || '').trim();
    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');

    if (!fullName || !phone || !email || !password) {
      throw new Error('Name, phone, email, and password are required');
    }

    // Check if email matches the designated Super Admin email
    if (email !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      throw new Error(`Only ${SUPER_ADMIN_EMAIL} can be set up as Super Admin`);
    }

    // Check if Super Admin already exists
    if (state.users.some((user) => user.role === ROLES.SUPER_ADMIN)) {
      throw new Error('Super Admin already exists');
    }

    // Check if user already exists
    if (state.users.some((user) => user.phone === phone)) throw new Error('Phone already exists');
    if (state.users.some((user) => user.email === email)) throw new Error('Email already exists');

    const { hash, salt } = hashPassword(password);
    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role: ROLES.SUPER_ADMIN,
      fullName,
      phone,
      email,
      passwordHash: hash,
      salt,
      location: null,
      verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED,
      acceptedTermsVersion: state.meta.termsVersion || '1.0',
      acceptedGameRulesVersion: state.meta.gameRulesVersion || '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    state.users.push(user);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: user.id,
        actorRole: user.role,
        action: AUDIT_ACTIONS.ADMIN_CREATED,
        entityType: 'USER',
        entityId: user.id,
        after: publicUser(user),
        metadata: { message: 'Super Admin initial setup' },
      }),
    );
    return { user: publicUser(user), token: createSignedToken({ userId: user.id, role: user.role }) };
  });
}
