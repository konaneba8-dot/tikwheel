import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveBroadcastSummary } from '../public/live-broadcast.js';

test('buildLiveBroadcastSummary returns broadcast-ready metrics for the current round', () => {
  const round = {
    id: 'round-123',
    number: 'ROUND 014',
    prize: '5000 ETB',
    availablePositions: [1, 2, 3, 4, 5, 6, 7, 8],
    verifiedPlayerCount: 8,
    wheel: [
      { position: 1, label: '1', color: '#ff0088' },
      { position: 2, label: '2', color: '#00e5ff' },
      { position: 3, label: '3', color: '#7c5cff' },
      { position: 4, label: '4', color: '#3de38a' },
      { position: 5, label: '5', color: '#ffc857' },
      { position: 6, label: '6', color: '#ff6577' },
      { position: 7, label: '7', color: '#6ee7b7' },
      { position: 8, label: '8', color: '#f472b6' },
    ],
    winners: [{ position: 4 }],
  };

  const summary = buildLiveBroadcastSummary(round);

  assert.equal(summary.gameId, 'round-123');
  assert.equal(summary.totalPlayers, 8);
  assert.deepEqual(summary.availableNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(summary.winnerNumber, 4);
  assert.equal(summary.currentPrize, '5000 ETB');
  assert.ok(summary.countdownSeconds >= 10 && summary.countdownSeconds <= 60);
});
