export interface FuzzyMatch {
  score: number;
  positions: number[];
}

/** Subsequence match with bonuses for tight runs, word/camel boundaries, and prefixes. */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const q = query.toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = target.toLowerCase();
  const positions: number[] = [];
  let targetIndex = 0;
  let score = 0;
  let previous = -2;

  for (let queryIndex = 0; queryIndex < q.length; queryIndex++) {
    const character = q[queryIndex];
    let found = -1;
    for (let index = targetIndex; index < t.length; index++) {
      if (t[index] === character) {
        found = index;
        break;
      }
    }
    if (found === -1) return null;

    positions.push(found);
    let characterScore = 1;
    if (found === previous + 1) characterScore += 6;
    const before = found > 0 ? target[found - 1] : "";
    const current = target[found];
    const boundary =
      found === 0 ||
      /[\s\-_/.:>]/.test(before) ||
      (/[a-z]/.test(before) && /[A-Z]/.test(current));
    if (boundary) characterScore += 8;
    if (found === 0) characterScore += 4;
    if (previous >= 0) characterScore -= Math.min(found - previous - 1, 4);
    score += characterScore;
    previous = found;
    targetIndex = found + 1;
  }

  score -= t.length * 0.05;
  return { score, positions };
}

export function fuzzyScore(query: string, target: string): number | null {
  return fuzzyMatch(query, target)?.score ?? null;
}
