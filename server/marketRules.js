export const defaultFilters = {
  minPrice: 1,
  maxPrice: 500,
  minGap: 0,
  minRelVol: 0,
  maxAtr: 20,
  maxFloat: 10000,
  catalysts: ["Trend", "News", "SEC", "PR", "Market"],
};

export function normalizeFilters(query) {
  const catalysts = String(query.get("catalysts") || defaultFilters.catalysts.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    minPrice: Number(query.get("minPrice") || defaultFilters.minPrice),
    maxPrice: Number(query.get("maxPrice") || defaultFilters.maxPrice),
    minGap: Number(query.get("minGap") || defaultFilters.minGap),
    minRelVol: Number(query.get("minRelVol") || defaultFilters.minRelVol),
    maxAtr: Number(query.get("maxAtr") || defaultFilters.maxAtr),
    maxFloat: Number(query.get("maxFloat") || defaultFilters.maxFloat),
    catalysts,
  };
}

export function matchesScanner(ticker, filters) {
  const atrOk = !Number.isFinite(ticker.atr) || ticker.atr <= filters.maxAtr;
  const floatOk = !Number.isFinite(ticker.floatM) || ticker.floatM <= filters.maxFloat;
  const catalystOk = !filters.catalysts.length || filters.catalysts.includes(ticker.catalystType);

  return (
    ticker.price >= filters.minPrice &&
    ticker.price <= filters.maxPrice &&
    ticker.gap >= filters.minGap &&
    ticker.relVol >= filters.minRelVol &&
    atrOk &&
    floatOk &&
    catalystOk
  );
}
