import assert from "node:assert/strict";
import test from "node:test";
import { resolveTickerForSymbol, shouldRequestAnalysis } from "./tradingState.js";

test("resolveTickerForSymbol prefers a fresh lookup result over a stored universe ticker", () => {
  const stored = { symbol: "NVDA", price: 211.14, generatedAt: "2026-06-01T08:00:00.000Z" };
  const freshLookup = { symbol: "NVDA", price: 214.42, generatedAt: "2026-06-01T08:05:00.000Z" };

  assert.equal(resolveTickerForSymbol("NVDA", { universe: [stored], lookupTicker: freshLookup }), freshLookup);
});

test("shouldRequestAnalysis allows a manual forced re-analysis for an already loaded OpenAI result", () => {
  const analysis = { symbol: "TSLA", source: "openai" };
  const ticker = { symbol: "TSLA" };

  assert.equal(shouldRequestAnalysis({ analysis, ticker, force: true }), true);
  assert.equal(shouldRequestAnalysis({ analysis, ticker, force: false }), false);
});
