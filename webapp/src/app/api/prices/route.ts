import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tickers = request.nextUrl.searchParams.get("tickers");
  if (!tickers) {
    return NextResponse.json({ error: "Missing tickers param" }, { status: 400 });
  }

  const tickerList = tickers.split(",").map((t) => t.trim()).filter(Boolean);
  const prices: Record<string, number | null> = {};

  await Promise.all(
    tickerList.map(async (ticker) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 60 },
        });
        const data = await resp.json();
        prices[ticker] =
          data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
      } catch {
        prices[ticker] = null;
      }
    })
  );

  return NextResponse.json(prices);
}
