import { matchesScanner } from "./marketRules.js";

const POLYGON_BASE_URL = "https://api.polygon.io";
const DEFAULT_UNIVERSE = ["TSLA", "NVDA", "AAPL", "MSFT", "AMZN", "META", "AMD", "PLTR", "QQQ", "SPY", "IWM", "SOUN", "HUMA"];

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return value;
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function getUniverse() {
  return String(process.env.MARKET_DATA_UNIVERSE || DEFAULT_UNIVERSE.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function scoreTicker(ticker) {
  const catalystBoost = ticker.catalystType === "SEC" ? 12 : ticker.catalystType === "PR" ? 8 : ticker.catalystType === "News" ? 5 : 2;
  const raw = ticker.gap * 0.55 + ticker.relVol * 5 + catalystBoost + Math.max(0, 3 - ticker.atr) * 4;
  return Math.max(1, Math.min(99, Math.round(raw)));
}

async function fetchPolygonSnapshot(symbol, apiKey) {
  const url = new URL(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`, POLYGON_BASE_URL);
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Polygon snapshot failed for ${symbol}: ${response.status}`);
  }

  const data = await response.json();
  return data.ticker;
}

async function fetchPolygonMovers(direction, apiKey) {
  const url = new URL(`/v2/snapshot/locale/us/markets/stocks/${direction}`, POLYGON_BASE_URL);
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Polygon movers failed for ${direction}: ${response.status}`);
  }

  const data = await response.json();
  return data.tickers || [];
}

async function fetchTickerDetails(symbol, apiKey) {
  const url = new URL(`/v3/reference/tickers/${symbol}`, POLYGON_BASE_URL);
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  return data.results || null;
}

async function fetchPolygonPrevBar(symbol, apiKey) {
  const url = new URL(`/v2/aggs/ticker/${symbol}/prev`, POLYGON_BASE_URL);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Polygon previous bar failed for ${symbol}: ${response.status}`);
  }

  const data = await response.json();
  return data.results?.[0] || null;
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function buildEmptyTicker(symbol) {
  return {
    symbol,
    company: symbol,
    price: 0,
    gap: 0,
    relVol: 0,
    atr: Number.NaN,
    score: 1,
    category: "Market",
    catalystType: "Market",
    floatM: Number.NaN,
    pmHigh: 0,
    pmLow: 0,
    vwap: 0,
    volumeM: 0,
    thesis: "Real market data loaded. Add a catalyst source or strategy reason before promoting this ticker.",
    invalidation: "Require clean liquidity, spread, and VWAP confirmation.",
    sources: [],
  };
}

function mergePolygonSnapshot(symbol, snapshot, prevBar = null, details = null) {
  const fallback = buildEmptyTicker(symbol);

  if (!snapshot) return fallback;

  const snapshotPrice = positiveNumber(snapshot.lastTrade?.p) ?? positiveNumber(snapshot.day?.c);
  const price = snapshotPrice ?? positiveNumber(prevBar?.c) ?? fallback.price;
  const gap = snapshotPrice ? snapshot.todaysChangePerc ?? fallback.gap : 0;
  const day = snapshot.day || {};
  const minute = snapshot.min || {};
  const prevDay = snapshot.prevDay || {};
  const sessionVolume = positiveNumber(day.v) ?? positiveNumber(prevBar?.v);
  const relVol = prevDay.v && day.v ? Math.max(0.1, day.v / prevDay.v) : fallback.relVol;
  const ticker = {
    ...fallback,
    symbol,
    company: details?.name || fallback.company,
    price: round(price),
    gap: round(gap, 1),
    relVol: round(relVol, 1),
    atr: round((positiveNumber(day.h) ?? positiveNumber(prevBar?.h) ?? 0) - (positiveNumber(day.l) ?? positiveNumber(prevBar?.l) ?? 0)),
    pmHigh: round(positiveNumber(day.h) ?? positiveNumber(prevBar?.h) ?? fallback.pmHigh),
    pmLow: round(positiveNumber(day.l) ?? positiveNumber(prevBar?.l) ?? fallback.pmLow),
    vwap: round(positiveNumber(minute.vw) ?? positiveNumber(day.vw) ?? positiveNumber(prevBar?.vw) ?? fallback.vwap),
    volumeM: round((sessionVolume ?? fallback.volumeM * 1_000_000) / 1_000_000, 1),
    sources: [
      [
        prevBar && !snapshotPrice ? "Polygon previous session" : "Polygon snapshot",
        prevBar && !snapshotPrice
          ? "Snapshot is empty outside active market reporting; using the previous adjusted daily bar."
          : "Price, change, session range, VWAP, and volume loaded from Polygon.",
      ],
      ...(fallback.sources || []),
    ],
  };

  return { ...ticker, score: scoreTicker(ticker) };
}

export async function getMarketTicker(symbol) {
  const normalized = symbol.toUpperCase();
  const provider = String(process.env.MARKET_DATA_PROVIDER || "polygon").toLowerCase();
  const apiKey = process.env.POLYGON_API_KEY;

  if (provider === "polygon" && apiKey) {
    try {
      const snapshot = await fetchPolygonSnapshot(normalized, apiKey);
      const snapshotPrice = positiveNumber(snapshot?.lastTrade?.p) ?? positiveNumber(snapshot?.day?.c);
      const [prevBar, details] = await Promise.all([snapshotPrice ? Promise.resolve(null) : fetchPolygonPrevBar(normalized, apiKey), fetchTickerDetails(normalized, apiKey)]);
      return { ticker: mergePolygonSnapshot(normalized, snapshot, prevBar, details), source: "polygon", live: true };
    } catch (error) {
      throw error;
    }
  }

  return { ticker: null, source: "unconfigured", live: false };
}

export async function getMarketScanner(filters) {
  const provider = String(process.env.MARKET_DATA_PROVIDER || "polygon").toLowerCase();
  const apiKey = process.env.POLYGON_API_KEY;
  const universe = getUniverse();

  if (provider === "polygon" && apiKey) {
    const moverSymbols = await Promise.allSettled([fetchPolygonMovers("gainers", apiKey), fetchPolygonMovers("losers", apiKey)]).then((results) =>
      results
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value.map((snapshot) => snapshot.ticker))
        .filter(Boolean),
    );
    const symbols = [...new Set([...moverSymbols, ...universe])];
    const settled = await Promise.allSettled(symbols.map((symbol) => getMarketTicker(symbol)));
    const results = settled
      .filter((result) => result.status === "fulfilled" && result.value.ticker)
      .map((result) => result.value);
    const tickers = results.map((result) => result.ticker);
    const liveCount = results.filter((result) => result.live).length;
    const fallbackCount = results.filter((result) => !result.live).length;

    return {
      tickers: tickers.filter((ticker) => matchesScanner(ticker, filters)),
      universe: tickers,
      source: liveCount ? (fallbackCount ? "polygon-mixed" : "polygon") : "unconfigured",
      live: liveCount > 0,
      liveCount,
      fallbackCount,
      failed: settled.filter((result) => result.status === "rejected").length,
    };
  }

  return {
    tickers: [],
    universe: [],
    source: "unconfigured",
    live: false,
    liveCount: 0,
    fallbackCount: 0,
    failed: 0,
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getChartWindow() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 10);
  return { from: formatDate(from), to: formatDate(to) };
}

export async function getMarketChart(symbol, options = {}) {
  const normalized = symbol.toUpperCase();
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return { symbol: normalized, bars: [], source: "unconfigured", live: false };
  }

  const multiplier = Math.max(1, Number(options.multiplier || 5));
  const timespan = options.timespan || "minute";
  const { from, to } = getChartWindow();
  const url = new URL(`/v2/aggs/ticker/${normalized}/range/${multiplier}/${timespan}/${from}/${to}`, POLYGON_BASE_URL);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "5000");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Polygon chart failed for ${normalized}: ${response.status}`);
  }

  const data = await response.json();
  const bars = (data.results || []).map((bar) => ({
    time: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
    vwap: bar.vw,
  }));

  return {
    symbol: normalized,
    bars,
    source: "polygon",
    live: true,
    multiplier,
    timespan,
    from,
    to,
  };
}
