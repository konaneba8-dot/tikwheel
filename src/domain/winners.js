import crypto from 'node:crypto';

export function selectUniqueRandomEntries(entries, winnerCount = 1) {
  const pool = [...entries];
  const winners = [];
  const count = Math.max(1, Math.min(Number(winnerCount || 1), pool.length));

  for (let i = 0; i < count; i += 1) {
    const index = crypto.randomInt(pool.length);
    winners.push(pool.splice(index, 1)[0]);
  }

  return winners;
}

export function createWinnerSelection(roundId, winners) {
  return {
    id: `win_${crypto.randomUUID()}`,
    roundId,
    winnerCount: winners.length,
    selectedEntryIds: winners.map((entry) => entry.id),
    selectedPositions: winners.map((entry) => entry.position),
    randomSeedSource: 'crypto.randomInt',
    createdAt: new Date().toISOString(),
  };
}
