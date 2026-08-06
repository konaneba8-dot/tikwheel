import crypto from 'node:crypto';
import { ROUND_STATUSES } from './statuses.js';

export function createGameType(input) {
  const id = `gt_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  return {
    id,
    code: String(input.code || input.name || id).toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    name: input.name,
    description: input.description || '',
    winnerCount: Math.max(1, Number(input.winnerCount || 1)),
    defaultEntryPrice: Number(input.defaultEntryPrice || 0),
    defaultPrize: input.defaultPrize || '',
    defaultMaxPlayers: Math.max(1, Number(input.defaultMaxPlayers || 16)),
    isActive: input.isActive !== false,
    config: input.config || {},
    createdAt: now,
    updatedAt: now,
  };
}

export function getGameType(gameTypes, id) {
  return gameTypes.find((item) => item.id === id || item.code === id) || null;
}

export function listActiveGameTypes(gameTypes) {
  return gameTypes.filter((item) => item.isActive);
}

export function createRoundFromGameType(gameType, input = {}) {
  const now = new Date().toISOString();
  const maxPlayers = Math.max(1, Number(input.maxPlayers || gameType.defaultMaxPlayers || 16));
  return {
    id: `rnd_${crypto.randomUUID()}`,
    number: input.number || null,
    gameTypeId: gameType.id,
    status: input.status || ROUND_STATUSES.DRAFT,
    maxPlayers,
    entryPrice: Number(input.entryPrice ?? gameType.defaultEntryPrice ?? 0),
    prize: input.prize || gameType.defaultPrize || '',
    startAt: input.startAt || null,
    endAt: input.endAt || null,
    liveLink: input.liveLink || '',
    positions: Array.from({ length: maxPlayers }, (_, index) => index + 1),
    entries: [],
    winnerSelection: null,
    winners: [],
    createdAt: now,
    updatedAt: now,
  };
}
