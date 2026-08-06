export function buildWheelSegments(entries) {
  const count = entries.length;
  if (!count) return [];
  const segmentAngle = 360 / count;
  return entries.map((entry, index) => {
    const hue = Math.round((index * 360) / count);
    return {
      index,
      entryId: entry.id,
      position: entry.position,
      label: `Player ${String(entry.position).padStart(2, '0')}`,
      angleStart: index * segmentAngle,
      angleEnd: (index + 1) * segmentAngle,
      color: `hsl(${hue} 82% 48%)`,
      textColor: hue > 45 && hue < 210 ? '#0f172a' : '#ffffff',
    };
  });
}

export function getWinningRotation({ segmentCount, winnerIndex, revolutions = 7 }) {
  if (!segmentCount) return 0;
  const segmentAngle = 360 / segmentCount;
  const centerAngle = winnerIndex * segmentAngle + segmentAngle / 2;
  return revolutions * 360 + (360 - centerAngle);
}
