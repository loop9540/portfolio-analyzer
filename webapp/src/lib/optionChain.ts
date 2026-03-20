export interface OptionContract {
  strike: number;
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: number; // unix timestamp
}

export interface OptionChainData {
  expirations: number[];
  calls: Record<number, OptionContract[]>; // keyed by expiration timestamp
  source: "live" | "estimated";
}

async function fetchWithProxy(url: string): Promise<Response | null> {
  const proxies = [
    (u: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];

  for (const proxyFn of proxies) {
    try {
      const resp = await fetch(proxyFn(url), {
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) return resp;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function getCrumb(): Promise<{
  crumb: string;
} | null> {
  try {
    const resp = await fetchWithProxy(
      "https://query2.finance.yahoo.com/v1/test/getcrumb"
    );
    if (!resp) return null;
    const crumb = await resp.text();
    if (!crumb || crumb.includes("error") || crumb.length > 30) return null;
    return { crumb };
  } catch {
    return null;
  }
}

export async function fetchOptionChain(
  ticker: string,
  expirationTimestamp?: number
): Promise<{
  expirations: number[];
  calls: OptionContract[];
} | null> {
  const auth = await getCrumb();
  if (!auth) return null;

  let url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(auth.crumb)}`;
  if (expirationTimestamp) {
    url += `&date=${expirationTimestamp}`;
  }

  const resp = await fetchWithProxy(url);
  if (!resp) return null;

  try {
    const data = await resp.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const expirations: number[] = result.expirationDates || [];
    const rawCalls = result.options?.[0]?.calls || [];

    const calls: OptionContract[] = rawCalls.map(
      (c: Record<string, number>) => ({
        strike: c.strike ?? 0,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        lastPrice: c.lastPrice ?? 0,
        volume: c.volume ?? 0,
        openInterest: c.openInterest ?? 0,
        impliedVolatility: c.impliedVolatility ?? 0,
        expiration: c.expiration ?? expirationTimestamp ?? 0,
      })
    );

    return { expirations, calls };
  } catch {
    return null;
  }
}

export async function fetchFullOptionChain(
  ticker: string
): Promise<OptionChainData> {
  // First fetch to get available expirations
  const initial = await fetchOptionChain(ticker);

  if (!initial || initial.expirations.length === 0) {
    return { expirations: [], calls: {}, source: "estimated" };
  }

  const now = Math.floor(Date.now() / 1000);
  // Pick expirations: next weekly, ~30 DTE, ~45 DTE
  const targetDtes = [7, 30, 45];
  const selectedExps: number[] = [];

  for (const targetDte of targetDtes) {
    const targetTs = now + targetDte * 86400;
    let closest = initial.expirations[0];
    let closestDiff = Math.abs(closest - targetTs);

    for (const exp of initial.expirations) {
      if (exp <= now) continue; // skip expired
      const diff = Math.abs(exp - targetTs);
      if (diff < closestDiff) {
        closest = exp;
        closestDiff = diff;
      }
    }
    if (closest > now && !selectedExps.includes(closest)) {
      selectedExps.push(closest);
    }
  }

  // Fetch each expiration's calls
  const calls: Record<number, OptionContract[]> = {};

  // The initial fetch already has the first expiration's data
  const firstExp = initial.expirations.find((e) => e > now);
  if (firstExp && selectedExps.includes(firstExp)) {
    calls[firstExp] = initial.calls;
  }

  // Fetch remaining expirations in parallel
  const remaining = selectedExps.filter((e) => !calls[e]);
  const results = await Promise.all(
    remaining.map(async (exp) => {
      const data = await fetchOptionChain(ticker, exp);
      return { exp, calls: data?.calls ?? [] };
    })
  );

  for (const r of results) {
    calls[r.exp] = r.calls;
  }

  return {
    expirations: selectedExps.sort((a, b) => a - b),
    calls,
    source: "live",
  };
}
