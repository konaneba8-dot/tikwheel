import { PAYMENT_STATUSES } from './statuses.js';

export function isPaymentActive(paymentStatus) {
  return paymentStatus === PAYMENT_STATUSES.PENDING || paymentStatus === PAYMENT_STATUSES.VERIFIED;
}

export function createPendingEntry({ id, roundId, userId, position, receiptUrl, reference, lockedAt, expiresAt }) {
  const now = new Date().toISOString();
  return {
    id,
    roundId,
    userId,
    position,
    paymentStatus: PAYMENT_STATUSES.PENDING,
    receiptUrl: receiptUrl || null,
    reference: reference || null,
    lockedAt,
    expiresAt,
    verifiedAt: null,
    rejectedAt: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function expireEntry(entry, reason = 'Payment expired') {
  return {
    ...entry,
    paymentStatus: PAYMENT_STATUSES.EXPIRED,
    rejectedAt: new Date().toISOString(),
    reason,
    updatedAt: new Date().toISOString(),
  };
}

export function verifyEntry(entry) {
  return {
    ...entry,
    paymentStatus: PAYMENT_STATUSES.VERIFIED,
    verifiedAt: new Date().toISOString(),
    rejectedAt: null,
    reason: null,
    updatedAt: new Date().toISOString(),
  };
}

export function rejectEntry(entry, reason = 'Rejected by admin') {
  return {
    ...entry,
    paymentStatus: PAYMENT_STATUSES.REJECTED,
    rejectedAt: new Date().toISOString(),
    reason,
    updatedAt: new Date().toISOString(),
  };
}
