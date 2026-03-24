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

// --- Barchart API ---

interface BarchartSession {
  cookieHeader: string;
  xsrfToken: string;
}

async function getBarchartSession(): Promise<BarchartSession | null> {
  try {
    const resp = await fetch(
      "https://www.barchart.com/stocks/quotes/SPY/options",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
        credentials: "include",
      }
    );
    if (!resp.ok) return null;

    const cookies = resp.headers.getSetCookie?.() ?? [];
    const cookieHeader = cookies
      .map((c) => c.split(";")[0])
      .join("; ");

    const xsrfMatch = cookies.find((c) => c.startsWith("XSRF-TOKEN="));
    if (!xsrfMatch) return null;

    const xsrfToken = decodeURIComponent(
      xsrfMatch.split("=").slice(1).join("=").split(";")[0]
    );

    return { cookieHeader, xsrfToken };
  } catch {
    return null;
  }
}

async function fetchBarchartExpirations(
  ticker: string,
  session: BarchartSession
): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://www.barchart.com/proxies/core-api/v1/options/chain?symbol=${encodeURIComponent(ticker)}&fields=expirationDate&raw=1&type=Call&meta=expirations`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-XSRF-TOKEN": session.xsrfToken,
          Accept: "application/json",
          Cookie: session.cookieHeader,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return data?.meta?.expirations ?? [];
  } catch {
    return [];
  }
}

async function fetchBarchartCalls(
  ticker: string,
  expiration: string,
  session: BarchartSession
): Promise<OptionContract[]> {
  try {
    const resp = await fetch(
      `https://www.barchart.com/proxies/core-api/v1/options/get?underlying=${encodeURIComponent(ticker)}&fields=strikePrice,lastPrice,bidPrice,askPrice,volume,openInterest,volatility,expirationDate&raw=1&type=Call&expiration=${expiration}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-XSRF-TOKEN": session.xsrfToken,
          Accept: "application/json",
          Cookie: session.cookieHeader,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    const items: Record<string, unknown>[] = Array.isArray(data?.data)
      ? data.data
      : [];

    const expTs = Math.floor(new Date(expiration).getTime() / 1000);

    return items
      .map((item) => {
        const r = (item as Record<string, Record<string, number>>).raw ?? item;
        return {
          strike: (r as Record<string, number>).strikePrice ?? 0,
          bid: (r as Record<string, number>).bidPrice ?? 0,
          ask: (r as Record<string, number>).askPrice ?? 0,
          lastPrice: (r as Record<string, number>).lastPrice ?? 0,
          volume: (r as Record<string, number>).volume ?? 0,
          openInterest: (r as Record<string, number>).openInterest ?? 0,
          impliedVolatility:
            ((r as Record<string, number>).volatility ?? 0) / 100,
          expiration: expTs,
        };
      })
      .filter((c) => c.strike > 0);
  } catch {
    return [];
  }
}

async function fetchFromBarchart(
  ticker: string
): Promise<OptionChainData | null> {
  const session = await getBarchartSession();
  if (!session) return null;

  const expirationDates = await fetchBarchartExpirations(ticker, session);
  if (expirationDates.length === 0) return null;

  const now = Date.now();
  const targetDtes = [7, 30, 45];
  const selectedDates: string[] = [];

  for (const targetDte of targetDtes) {
    const targetMs = now + targetDte * 86400 * 1000;
    let closest = expirationDates[0];
    let closestDiff = Math.abs(new Date(closest).getTime() - targetMs);

    for (const exp of expirationDates) {
      const expMs = new Date(exp).getTime();
      if (expMs <= now) continue;
      const diff = Math.abs(expMs - targetMs);
      if (diff < closestDiff) {
        closest = exp;
        closestDiff = diff;
      }
    }
    if (
      new Date(closest).getTime() > now &&
      !selectedDates.includes(closest)
    ) {
      selectedDates.push(closest);
    }
  }

  // Fetch calls for each selected expiration in parallel
  const results = await Promise.all(
    selectedDates.map(async (dateStr) => {
      const calls = await fetchBarchartCalls(ticker, dateStr, session);
      const expTs = Math.floor(new Date(dateStr).getTime() / 1000);
      return { expTs, calls };
    })
  );

  const expirations: number[] = [];
  const calls: Record<number, OptionContract[]> = {};

  for (const r of results) {
    if (r.calls.length > 0) {
      expirations.push(r.expTs);
      calls[r.expTs] = r.calls;
    }
  }

  if (expirations.length === 0) return null;

  return {
    expirations: expirations.sort((a, b) => a - b),
    calls,
    source: "live",
  };
}

// --- Yahoo Finance fallback ---

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

    // Get expirations
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(crumb)}`;
    const resp = await fetchWithProxy(url);
    if (!resp) return null;

    const data = await resp.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    const allExps: number[] = result.expirationDates || [];
    const now = Math.floor(Date.now() / 1000);

    // Pick expirations for ~7, ~30, ~45 DTE
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

    // First fetch already has nearest expiration data
    const firstExp = allExps.find((e) => e > now);
    const calls: Record<number, OptionContract[]> = {};

    const parseCalls = (rawCalls: Record<string, number>[]): OptionContract[] =>
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

    if (firstExp && selectedExps.includes(firstExp)) {
      calls[firstExp] = parseCalls(result.options?.[0]?.calls || []);
    }

    // Fetch remaining
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

// --- Public API ---

export async function fetchFullOptionChain(
  ticker: string
): Promise<OptionChainData> {
  // Try Barchart first, then Yahoo Finance fallback
  const barchart = await fetchFromBarchart(ticker);
  if (barchart) return barchart;

  const yahoo = await fetchFromYahoo(ticker);
  if (yahoo) return yahoo;

  return { expirations: [], calls: {}, source: "estimated" };
}
