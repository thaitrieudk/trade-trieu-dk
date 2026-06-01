import assert from "node:assert/strict";
import test from "node:test";
import { getStoredTickerAnalysis, saveStoredTickerAnalysis } from "./analysisStore.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

test("getStoredTickerAnalysis returns null when Supabase is not configured", async () => {
  let fetchCalls = 0;
  const analysis = await getStoredTickerAnalysis("TSLA", {
    env: {},
    fetchImpl: async () => {
      fetchCalls += 1;
    },
  });

  assert.equal(analysis, null);
  assert.equal(fetchCalls, 0);
});

test("getStoredTickerAnalysis loads the latest analysis from Supabase REST", async () => {
  const calls = [];
  const cached = {
    symbol: "TSLA",
    analysis: {
      symbol: "TSLA",
      source: "openai",
      score: 71,
      headline: "Stored setup",
      generatedAt: "2026-05-31T09:30:00.000Z",
    },
    generated_at: "2026-05-31T09:30:00.000Z",
  };

  const analysis = await getStoredTickerAnalysis("tsla", {
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return [cached];
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /ticker_ai_analyses/);
  assert.match(calls[0].url, /symbol=eq\.TSLA/);
  assert.equal(calls[0].options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  assert.deepEqual(analysis, cached.analysis);
});

test("saveStoredTickerAnalysis upserts by symbol and returns the saved analysis", async () => {
  const calls = [];
  const fresh = {
    symbol: "TSLA",
    source: "openai",
    score: 80,
    headline: "Fresh setup",
    generatedAt: "2026-05-31T12:05:00.000Z",
    model: "gpt-5-mini",
  };

  const saved = await saveStoredTickerAnalysis(fresh, {
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        async json() {
          return [{ analysis: fresh, generated_at: fresh.generatedAt }];
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /on_conflict=symbol/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Prefer, "resolution=merge-duplicates,return=representation");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    symbol: "TSLA",
    analysis: fresh,
    model: "gpt-5-mini",
    analysis_source: "openai",
    generated_at: fresh.generatedAt,
  });
  assert.deepEqual(saved, fresh);
});

