import crypto from 'node:crypto';
import { PAYMENT_STATUSES, ROUND_STATUSES } from './statuses.js';
import { createPendingEntry, expireEntry } from './payments.js';
import { createWinnerSelection, selectUniqueRandomEntries } from './winners.js';
import { buildWheelSegments } from './wheel.js';

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function getRoundGameType(state, round) {
  return state.gameTypes.find((item) => item.id === round.gameTypeId) || null;
}

export function getRoundEntries(round) {
  return Array.isArray(round.entries) ? round.entries : [];
}

export function getVerifiedEntries(round) {
  return getRoundEntries(round).filter((entry) => entry.paymentStatus === PAYMENT_STATUSES.VERIFIED);
}

export function getActiveEntries(round) {
  return getRoundEntries(round).filter((entry) => entry.paymentStatus === PAYMENT_STATUSES.PENDING || entry.paymentStatus === PAYMENT_STATUSES.VERIFIED);
}

export function getAvailablePositions(round) {
  const locked = new Set(getActiveEntries(round).map((entry) => entry.position));
  return round.positions.filter((position) => !locked.has(position));
}

export function refreshRoundStatus(round) {
  const verifiedCount = getVerifiedEntries(round).length;
  if (round.status === ROUND_STATUSES.CANCELLED || round.status === ROUND_STATUSES.COMPLETED || round.status === ROUND_STATUSES.DRAWING) {
    return round;
  }

  let nextStatus = ROUND_STATUSES.OPEN;
  if (verifiedCount === 0) nextStatus = ROUND_STATUSES.OPEN;
  else if (verifiedCount < round.maxPlayers * 0.5) nextStatus = ROUND_STATUSES.FILLING;
  else if (verifiedCount < round.maxPlayers) nextStatus = ROUND_STATUSES.FULL;
  if (verifiedCount >= round.maxPlayers) nextStatus = ROUND_STATUSES.READY;

  return { ...round, status: nextStatus, updatedAt: new Date().toISOString() };
}

export function lockPosition(round, userId, position, lockMinutes = 15) {
  if (!round.positions.includes(position)) {
    throw new Error('Invalid position');
  }
  if (getActiveEntries(round).some((entry) => entry.position === position)) {
    throw new Error('Position already taken');
  }
  const entry = createPendingEntry({
    id: `ent_${crypto.randomUUID()}`,
    roundId: round.id,
    userId,
    position,
    lockedAt: new Date().toISOString(),
    expiresAt: minutesFromNow(lockMinutes),
  });
  round.entries = [...getRoundEntries(round), entry];
  round.updatedAt = new Date().toISOString();
  return entry;
}

export function attachReceipt(entry, { receiptUrl, reference }) {
  return {
    ...entry,
    receiptUrl: receiptUrl || entry.receiptUrl || null,
    reference: reference || entry.reference || null,
    updatedAt: new Date().toISOString(),
  };
}

export function expireStaleEntries(round, now = Date.now()) {
  const entries = getRoundEntries(round).map((entry) => {
    if (entry.paymentStatus !== PAYMENT_STATUSES.PENDING) return entry;
    if (!entry.expiresAt) return entry;
    if (Date.parse(entry.expiresAt) > now) return entry;
    return expireEntry(entry, 'Payment verification window expired');
  });
  return { ...round, entries };
}

export function createWheelForRound(round) {
  return buildWheelSegments(getVerifiedEntries(round));
}

export function selectRoundWinners(round, winnerCount = 1) {
  const verified = getVerifiedEntries(round);
  if (!verified.length) {
    throw new Error('No verified players available');
  }
  if (round.status !== ROUND_STATUSES.READY && round.status !== ROUND_STATUSES.DRAWING) {
    throw new Error('Round must be READY before drawing');
  }
  if (round.winners && round.winners.length) {
    if (!round.winnerSelection) {
      throw new Error('Winner selection missing for drawn round');
    }
    return {
      round,
      selection: round.winnerSelection,
      winners: round.winners,
      wheel: buildWheelSegments(verified),
    };
  }
  const winners = selectUniqueRandomEntries(verified, winnerCount);
  const selection = createWinnerSelection(round.id, winners);
  return {
    round: {
      ...round,
      status: ROUND_STATUSES.DRAWING,
      winnerSelection: selection,
      winners: winners.map((entry) => ({
        entryId: entry.id,
        userId: entry.userId,
        position: entry.position,
        paymentStatus: entry.paymentStatus,
      })),
      updatedAt: new Date().toISOString(),
    },
    selection,
    winners,
    wheel: buildWheelSegments(verified),
  };
}

export function completeRound(round) {
  if (round.status !== ROUND_STATUSES.DRAWING && round.winnerSelection) {
    throw new Error('Round must be DRAWING before completion');
  }
  return { ...round, status: ROUND_STATUSES.COMPLETED, updatedAt: new Date().toISOString() };
}

export function summarizeRound(state, round) {
  const gameType = getRoundGameType(state, round);
  const verified = getVerifiedEntries(round);
  const wheel = buildWheelSegments(verified);
  const positionState = round.positions.map((position) => {
    const entry = getRoundEntries(round).find((item) => item.position === position);
    if (!entry) {
      return {
        position,
        status: 'AVAILABLE',
        entry: null,
      };
    }
    return {
      position,
      status: entry.paymentStatus,
      entry: {
        id: entry.id,
        userId: entry.userId,
        paymentStatus: entry.paymentStatus,
        reference: entry.reference,
        receiptUrl: entry.receiptUrl,
        verifiedAt: entry.verifiedAt,
        rejectedAt: entry.rejectedAt,
      },
    };
  });
  return {
    ...round,
    gameType,
    verifiedPlayerCount: verified.length,
    availablePositions: getAvailablePositions(round),
    positionState,
    wheel,
  };
}
