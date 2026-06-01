import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const requiredRoutes = [
  "api/health.js",
  "api/market/scanner.js",
  "api/market/ticker/[symbol].js",
  "api/market/chart/[symbol].js",
  "api/workspace/tickers.js",
  "api/ai/ticker-analysis.js",
  "api/ai/ticker-analysis/[symbol].js",
];

test("Vercel API routes exist for every frontend API path", async () => {
  for (const route of requiredRoutes) {
    assert.equal(existsSync(route), true, `${route} should exist`);
    await import(`../${route}`);
  }
});
