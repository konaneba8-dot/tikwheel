import crypto from 'node:crypto';
import { readState, writeState } from '../lib/store.js';
import { hashPassword, verifyPassword, createSignedToken, verifySignedToken } from '../lib/security.js';
import { ROLES, PAYMENT_STATUSES, ROUND_STATUSES, AUDIT_ACTIONS, USER_VERIFICATION_STATUSES, TRANSACTION_TYPES, TRANSACTION_STATUSES } from '../domain/statuses.js';
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
  createDepositTransaction,
  createWithdrawalTransaction,
  createPrizeTransaction,
  creditPrizeToWallet,
  failDepositTransaction,
  getAllPendingWithdrawals,
  getUserTransactions,
  getUserWallet,
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
function now() {
  return new Date().toISOString();
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
  if (!state.financialSettings) {
    state.financialSettings = buildFinancialSettings(state);
  }
  await processScheduledPromotions();
  const refreshedRounds = state.rounds.map((round) => summarizeRound(state, expireStaleEntries(refreshRoundStatus(round))));
  const playerDashboard = user && user.role === ROLES.PLAYER ? buildPlayerDashboard(state, user, refreshedRounds) : null;
  const adminPayments = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role) ? buildAdminPaymentQueue(state, refreshedRounds) : [];
  const promotionDashboard = buildPromotionDashboard(state);
  const walletDashboard = user ? buildWalletDashboard(state, user) : null;
  const withdrawalQueue = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role) ? buildWithdrawalQueue(state) : [];
  const depositQueue = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN].includes(user.role) ? buildDepositQueue(state) : [];
  const pendingVerifications = user && [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role) ? getPendingVerificationsInternal(state) : [];
  const financialSettings = user && [ROLES.SUPER_ADMIN].includes(user.role) ? buildFinancialSettings(state) : null;
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

  return {
    ...counts,
    pendingPayments,
    activePaymentMethods: (state.paymentMethods || []).filter((method) => method.isActive).length,
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
  const pendingWithdrawals = getAllPendingWithdrawals(state);
  return pendingWithdrawals.map((withdrawal) => {
    const user = state.users.find((u) => u.id === withdrawal.userId);
    return {
      ...withdrawal,
      userName: user?.fullName || 'Unknown',
      userPhone: user?.phone || '',
    };
  });
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
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const state = await readState();
  return buildFinancialSettings(state);
}

export async function updateFinancialSettings(input, actor) {
  requireRole(actor, [ROLES.SUPER_ADMIN]);
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
        action: 'FINANCIAL_SETTINGS_UPDATED',
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const state = await readState();
  return buildPromotionDashboard(state);
}

export async function getLiveBroadcastDashboard(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const state = await readState();
  return buildLiveBroadcastDashboard(state);
}

export async function createLiveBroadcast(input, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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

    const { hash, salt } = hashPassword(password);
    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role: ROLES.PLAYER,
      fullName,
      phone,
      email,
      passwordHash: hash,
      salt,
      location: String(input.location || '').trim() || null,
      verificationStatus: USER_VERIFICATION_STATUSES.PENDING_VERIFICATION,
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

  // Allow users with pending verification to log in - verification happens later via admin
  // No verification check at login - account is created immediately with Pending Verification status

  await mutateState((draft) => {
    appendAudit(
      draft,
      createAuditEntry({
        actorUserId: user.id,
        actorRole: user.role,
        action: AUDIT_ACTIONS.USER_LOGGED_IN,
        entityType: 'USER',
        entityId: user.id,
      }),
    );
  });
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

    // Generate a random password for social sign-up users
    const { hash, salt } = hashPassword(crypto.randomUUID());

    const user = {
      id: `usr_${crypto.randomUUID()}`,
      role: ROLES.PLAYER,
      fullName,
      phone,
      email: null,
      passwordHash: hash,
      salt,
      location,
      verificationStatus: USER_VERIFICATION_STATUSES.PENDING_VERIFICATION,
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    user.verificationStatus = USER_VERIFICATION_STATUSES.VERIFIED;
    user.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'USER_VERIFICATION_APPROVED',
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');

    user.verificationStatus = USER_VERIFICATION_STATUSES.REJECTED;
    user.verificationRejectionReason = String(reason || 'Verification rejected by admin');
    user.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'USER_VERIFICATION_REJECTED',
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

export async function getPendingVerifications(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const state = await readState();
  return state.users
    .filter((u) => u.verificationStatus === USER_VERIFICATION_STATUSES.PENDING_VERIFICATION)
    .map((u) => publicUser(u))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
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
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const state = await readState();
  const refreshedRounds = state.rounds.map((round) => summarizeRound(state, expireStaleEntries(refreshRoundStatus(round))));
  return buildAdminPaymentQueue(state, refreshedRounds);
}

export async function getPaymentMethods() {
  const state = await readState();
  return buildPaymentMethods(state);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const gameType = createGameType(input);
    state.gameTypes.unshift(gameType);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'GAME_TYPE_CREATED',
        entityType: 'GAME_TYPE',
        entityId: gameType.id,
        after: gameType,
      }),
    );
    return gameType;
  });
}

export async function createPaymentMethodAction(input, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const paymentMethods = buildPaymentMethods(state);
    const paymentMethod = {
      id: `pay_${crypto.randomUUID()}`,
      name: String(input.name || '').trim(),
      instructions: String(input.instructions || '').trim(),
      accountName: String(input.accountName || '').trim(),
      accountNumber: String(input.accountNumber || '').trim(),
      referenceHint: String(input.referenceHint || '').trim(),
      paymentType: String(input.paymentType || 'bank').trim(),
      displayOrder: Number(input.displayOrder || 0),
      isActive: input.isActive !== false,
      createdAt: now(),
      updatedAt: now(),
    };
    if (!paymentMethod.name) throw new Error('Payment method name is required');
    paymentMethods.unshift(paymentMethod);
    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'PAYMENT_METHOD_CREATED',
        entityType: 'PAYMENT_METHOD',
        entityId: paymentMethod.id,
        after: paymentMethod,
      }),
    );
    return paymentMethod;
  });
}

export async function togglePaymentMethodAction(paymentMethodId, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
        action: 'PAYMENT_METHOD_TOGGLED',
        entityType: 'PAYMENT_METHOD',
        entityId: paymentMethod.id,
        after: paymentMethod,
      }),
    );
    return paymentMethod;
  });
}

export async function editPaymentMethodAction(paymentMethodId, input, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const paymentMethods = buildPaymentMethods(state);
    const paymentMethod = paymentMethods.find((item) => item.id === paymentMethodId);
    if (!paymentMethod) throw new Error('Payment method not found');

    paymentMethod.name = String(input.name || paymentMethod.name).trim();
    paymentMethod.instructions = String(input.instructions || paymentMethod.instructions).trim();
    paymentMethod.accountName = String(input.accountName || paymentMethod.accountName).trim();
    paymentMethod.accountNumber = String(input.accountNumber || paymentMethod.accountNumber).trim();
    paymentMethod.referenceHint = String(input.referenceHint || paymentMethod.referenceHint).trim();
    paymentMethod.paymentType = String(input.paymentType || paymentMethod.paymentType).trim();
    paymentMethod.displayOrder = Number(input.displayOrder !== undefined ? input.displayOrder : paymentMethod.displayOrder);
    paymentMethod.isActive = input.isActive !== undefined ? input.isActive : paymentMethod.isActive;
    paymentMethod.updatedAt = now();

    appendAudit(
      state,
      createAuditEntry({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'PAYMENT_METHOD_UPDATED',
        entityType: 'PAYMENT_METHOD',
        entityId: paymentMethod.id,
        after: paymentMethod,
      }),
    );

    return paymentMethod;
  });
}

export async function deletePaymentMethodAction(paymentMethodId, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
        action: 'PAYMENT_METHOD_DELETED',
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
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

    // Require ID document for deposit verification
    if (!input.paymentDetails?.idDocumentUrl) {
      throw new Error('ID document upload is required for deposit verification');
    }

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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = getUserWallet(state, transaction.userId);
    const result = completeDepositTransaction(transaction, wallet);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const result = failDepositTransaction(transaction, reason);
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
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = getUserWallet(state, transaction.userId);
    const result = approveWithdrawalTransaction(transaction, wallet);
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

export async function rejectWithdrawal(transactionId, reason, actor) {
  requireRole(actor, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  return mutateState((state) => {
    const transaction = (state.transactions || []).find((txn) => txn.id === transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const result = rejectWithdrawalTransaction(transaction, reason);
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
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  const state = await readState();
  return buildWithdrawalQueue(state);
}

export async function getDepositQueue(user) {
  requireRole(user, [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MONEY_ADMIN]);
  const state = await readState();
  return buildDepositQueue(state);
}

