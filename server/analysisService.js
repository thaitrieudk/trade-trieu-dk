import { getTickerAnalysis } from "./aiProvider.js";
import { getStoredTickerAnalysis, saveStoredTickerAnalysis } from "./analysisStore.js";

const defaultStore = {
  get: getStoredTickerAnalysis,
  save: saveStoredTickerAnalysis,
};

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function getLastRunAt(analysis) {
  return analysis?.generatedAt || null;
}

export async function getCachedAnalysisForSymbol(symbol, options = {}) {
  const store = options.store || defaultStore;
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return { analysis: null, cacheStatus: "miss", lastRunAt: null };

  try {
    const analysis = await store.get(normalized);
    return {
      analysis,
      cacheStatus: analysis ? "hit" : "miss",
      lastRunAt: getLastRunAt(analysis),
    };
  } catch (error) {
    return {
      analysis: null,
      cacheStatus: "error",
      lastRunAt: null,
      error: error.message,
    };
  }
}

export async function getAnalysisForTicker(payload, options = {}) {
  const store = options.store || defaultStore;
  const analyze = options.analyze || getTickerAnalysis;
  const force = Boolean(payload.force);
  let storeError = "";

  if (!force) {
    try {
      const cached = await store.get(payload.ticker.symbol);
      if (cached) {
        return {
          analysis: cached,
          cacheStatus: "hit",
          lastRunAt: getLastRunAt(cached),
        };
      }
    } catch (error) {
      storeError = error.message;
    }
  }

  const analysis = await analyze(payload);
  let stored = null;

  if (analysis?.source === "openai") {
    try {
      stored = await store.save(analysis);
    } catch (error) {
      storeError = error.message;
    }
  }

  return {
    analysis: stored || analysis,
    cacheStatus: stored ? "stored" : storeError ? "store-error" : "not-stored",
    lastRunAt: getLastRunAt(stored || analysis),
    error: storeError || undefined,
  };
}

