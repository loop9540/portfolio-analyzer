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

async function fetchFromYahoo(
  ticker: string
): Promise<OptionChainData | null> {
  try {
    const crumbResp = await fetchWithProxy(
      "https://query2.finance.yahoo.com/v1/test/getcrumb"
    );
    if (!crumbResp) return null;
    const crumb = await crumbResp.text();
    if (!crumb || crumb.includes("error") || crumb.length > 30) return null;

    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(crumb)}`;
    const resp = await fetchWithProxy(url);
    if (!resp) return null;

    const data = await resp.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const allExps: number[] = result.expirationDates || [];
    const now = Math.floor(Date.now() / 1000);

    const targetDtes = [7, 30, 45];
    const selectedExps: number[] = [];

    for (const targetDte of targetDtes) {
      const targetTs = now + targetDte * 86400;
      let closest = allExps[0];
      let closestDiff = Math.abs(closest - targetTs);
      for (const exp of allExps) {
        if (exp <= now) continue;
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

    const parseCalls = (
      rawCalls: Record<string, number>[]
    ): OptionContract[] =>
      rawCalls.map((c) => ({
        strike: c.strike ?? 0,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        lastPrice: c.lastPrice ?? 0,
        volume: c.volume ?? 0,
        openInterest: c.openInterest ?? 0,
        impliedVolatility: c.impliedVolatility ?? 0,
        expiration: c.expiration ?? 0,
      }));

    const calls: Record<number, OptionContract[]> = {};
    const firstExp = allExps.find((e) => e > now);
    if (firstExp && selectedExps.includes(firstExp)) {
      calls[firstExp] = parseCalls(result.options?.[0]?.calls || []);
    }

    const remaining = selectedExps.filter((e) => !calls[e]);
    const results = await Promise.all(
      remaining.map(async (exp) => {
        const r = await fetchWithProxy(
          `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(crumb)}&date=${exp}`
        );
        if (!r) return { exp, calls: [] as OptionContract[] };
        const d = await r.json();
        const res = d?.optionChain?.result?.[0];
        return {
          exp,
          calls: res ? parseCalls(res.options?.[0]?.calls || []) : [],
        };
      })
    );

    for (const r of results) {
      if (r.calls.length > 0) calls[r.exp] = r.calls;
    }

    return {
      expirations: selectedExps.sort((a, b) => a - b),
      calls,
      source: "live",
    };
  } catch {
    return null;
  }
}

/**
 * Get realistic estimated expiration dates (actual Fridays).
 * Weekly = next Friday, Monthly = 3rd Friday of next month,
 * 45 DTE = 3rd Friday of month ~45 days out.
 */
function getEstimatedExpirations(): number[] {
  const now = new Date();
  const exps: number[] = [];

  // Next Friday (weekly)
  const weekly = new Date(now);
  weekly.setDate(weekly.getDate() + ((5 - weekly.getDay() + 7) % 7 || 7));
  weekly.setHours(16, 0, 0, 0);
  exps.push(Math.floor(weekly.getTime() / 1000));

  // 3rd Friday of next month (~30 DTE)
  const monthly = getThirdFriday(
    now.getMonth() + 1 + (now.getDate() > 20 ? 1 : 0),
    now.getFullYear()
  );
  if (monthly > now) {
    exps.push(Math.floor(monthly.getTime() / 1000));
  }

  // 3rd Friday ~45 DTE
  const target45 = new Date(now.getTime() + 45 * 86400000);
  const far = getThirdFriday(target45.getMonth(), target45.getFullYear());
  const farTs = Math.floor(far.getTime() / 1000);
  if (far > now && !exps.includes(farTs)) {
    exps.push(farTs);
  }

  return exps.sort((a, b) => a - b);
}

function getThirdFriday(month: number, year: number): Date {
  // Handle month overflow
  if (month > 11) {
    month -= 12;
    year++;
  }
  const d = new Date(year, month, 1);
  // Find first Friday
  const dayOfWeek = d.getDay();
  const firstFriday = 1 + ((5 - dayOfWeek + 7) % 7);
  // Third Friday = first Friday + 14
  d.setDate(firstFriday + 14);
  d.setHours(16, 0, 0, 0);
  return d;
}

export async function fetchFullOptionChain(
  ticker: string
): Promise<OptionChainData> {
  const yahoo = await fetchFromYahoo(ticker);
  if (yahoo && yahoo.expirations.length > 0) return yahoo;

  // Return estimated with real Friday dates
  return {
    expirations: getEstimatedExpirations(),
    calls: {},
    source: "estimated",
  };
}
