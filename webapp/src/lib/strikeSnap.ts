import { OptionContract } from "./optionChain";

/**
 * Snap a target price to a realistic option strike.
 * If live chain data is available, snaps to nearest real strike.
 * Otherwise uses common market increments ($1/$2.50/$5).
 */
export function snapStrike(
  price: number,
  liveCalls: OptionContract[] = []
): number {
  if (liveCalls.length > 0) {
    const closest = liveCalls.reduce((best, c) =>
      Math.abs(c.strike - price) < Math.abs(best.strike - price) ? c : best
    );
    if (Math.abs(closest.strike - price) <= price * 0.05) return closest.strike;
  }
  // Common increments: $1 under $100, $2.50 under $250, $5 over $250
  if (price < 100) return Math.round(price);
  if (price < 250) return Math.round(price / 2.5) * 2.5;
  return Math.round(price / 5) * 5;
}

/**
 * Find the closest live option contract to a target strike.
 * Returns null if no match within 3% of target.
 */
export function findLiveMatch(
  target: number,
  liveCalls: OptionContract[]
): OptionContract | null {
  if (liveCalls.length === 0) return null;
  const match = liveCalls.reduce((best, c) =>
    Math.abs(c.strike - target) < Math.abs(best.strike - target) ? c : best
  );
  if (Math.abs(match.strike - target) > target * 0.03) return null;
  return match;
}
