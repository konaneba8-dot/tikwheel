import { ROUND_STATUSES } from './statuses.js';

const TRANSITIONS = Object.freeze({
  [ROUND_STATUSES.DRAFT]: [ROUND_STATUSES.UPCOMING, ROUND_STATUSES.OPEN, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.UPCOMING]: [ROUND_STATUSES.OPEN, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.OPEN]: [ROUND_STATUSES.FILLING, ROUND_STATUSES.READY, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.FILLING]: [ROUND_STATUSES.FULL, ROUND_STATUSES.READY, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.FULL]: [ROUND_STATUSES.READY, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.READY]: [ROUND_STATUSES.DRAWING, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.DRAWING]: [ROUND_STATUSES.COMPLETED, ROUND_STATUSES.CANCELLED],
  [ROUND_STATUSES.COMPLETED]: [],
  [ROUND_STATUSES.CANCELLED]: [ROUND_STATUSES.DRAFT, ROUND_STATUSES.UPCOMING],
});

export function getAllowedRoundTransitions(status) {
  return TRANSITIONS[status] || [];
}

export function canTransitionRoundStatus(fromStatus, toStatus) {
  return getAllowedRoundTransitions(fromStatus).includes(toStatus);
}

export function assertRoundStatusTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return;
  if (!canTransitionRoundStatus(fromStatus, toStatus)) {
    throw new Error(`Invalid round status transition: ${fromStatus} -> ${toStatus}`);
  }
}
