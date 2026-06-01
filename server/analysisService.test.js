import assert from "node:assert/strict";
import test from "node:test";
import { getAnalysisForTicker } from "./analysisService.js";

const ticker = { symbol: "TSLA", atr: 4.2, gap: 1.1, relVol: 2.5, score: 61 };

test("returns cached analysis without calling the AI provider", async () => {
  let aiCalls = 0;
  const cachedAnalysis = {
    symbol: "TSLA",
    source: "openai",
    score: 72,
    headline: "Cached setup",
    generatedAt: "2026-05-31T10:15:00.000Z",
  };

  const result = await getAnalysisForTicker(
    { ticker },
    {
      store: {
        get: async () => cachedAnalysis,
        save: async () => {
          throw new Error("save should not run on cache hit");
        },
      },
      analyze: async () => {
        aiCalls += 1;
        return { symbol: "TSLA", source: "openai", score: 80 };
      },
    },
  );

  assert.equal(aiCalls, 0);
  assert.equal(result.cacheStatus, "hit");
  assert.deepEqual(result.analysis, cachedAnalysis);
  assert.equal(result.lastRunAt, cachedAnalysis.generatedAt);
});

test("stores a fresh OpenAI analysis when no cache exists", async () => {
  let savedAnalysis = null;
  const freshAnalysis = {
    symbol: "TSLA",
    source: "openai",
    score: 78,
    headline: "Fresh setup",
    generatedAt: "2026-05-31T11:20:00.000Z",
  };

  const result = await getAnalysisForTicker(
    { ticker, scannerCandidates: [ticker], focusSymbols: ["TSLA"] },
    {
      store: {
        get: async () => null,
        save: async (analysis) => {
          savedAnalysis = analysis;
          return analysis;
        },
      },
      analyze: async () => freshAnalysis,
    },
  );

  assert.deepEqual(savedAnalysis, freshAnalysis);
  assert.equal(result.cacheStatus, "stored");
  assert.deepEqual(result.analysis, freshAnalysis);
  assert.equal(result.lastRunAt, freshAnalysis.generatedAt);
});

