export function buildLiveBroadcastSummary(round = {}, options = {}) {
  const availableNumbers = Array.isArray(round.availablePositions)
    ? round.availablePositions.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : Array.isArray(round.wheel)
      ? round.wheel.map((segment) => Number(segment.position)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
      : [];

  const totalPlayers = Number(
    round.verifiedPlayerCount ??
    round.totalPlayers ??
    round.playerCount ??
    round.wheel?.length ??
    availableNumbers.length ??
    0,
  ) || 0;

  const winnerNumber = Number(round.winners?.[0]?.position ?? round.winnerNumber ?? 0) || null;
  const currentPrize = String(round.prize || options.defaultPrize || 'Prize pending');
  const countdownSeconds = Number(options.countdownSeconds ?? round.countdownSeconds ?? 30);

  return {
    gameId: String(round.id || round.number || 'LIVE'),
    totalPlayers,
    availableNumbers,
    playerNumbers: Array.isArray(round.wheel)
      ? round.wheel.map((segment) => Number(segment.position)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
      : availableNumbers,
    winnerNumber,
    currentPrize,
    countdownSeconds: Number.isFinite(countdownSeconds) && countdownSeconds > 0 ? countdownSeconds : 30,
  };
}
