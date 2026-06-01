function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

export function resolveTickerForSymbol(symbol, { universe = [], lookupTicker = null } = {}) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  if (normalizeSymbol(lookupTicker?.symbol) === normalized) return lookupTicker;
  return universe.find((ticker) => normalizeSymbol(ticker?.symbol) === normalized) || null;
}

export function shouldRequestAnalysis({ analysis = null, ticker = null, force = false } = {}) {
  if (!ticker?.symbol) return false;
  if (force) return true;
  return !(normalizeSymbol(analysis?.symbol) === normalizeSymbol(ticker.symbol) && analysis?.source === "openai");
}
