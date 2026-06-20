/** Format splat count as "1.24M splats". */
export function formatSplatCount(count: number): string {
  if (count >= 1_000_000) {
    const val = count / 1_000_000;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, "")}M splats`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K splats`;
  }
  return `${count} splats`;
}

export function formatSplatStats(count: number, sizeMb: number): string {
  return `${formatSplatCount(count)} • ${sizeMb} MB`;
}
