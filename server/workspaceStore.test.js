import assert from "node:assert/strict";
import test from "node:test";
import { getStoredWorkspaceTickers, saveStoredWorkspaceTicker } from "./workspaceStore.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const ticker = {
  symbol: "NVDA",
  company: "NVIDIA Corporation",
  price: 211.14,
  gap: 0,
  relVol: 0,
  atr: 6.73,
  score: 2,
  category: "Market",
};

test("getStoredWorkspaceTickers returns an empty workspace when Supabase is not configured", async () => {
  let fetchCalls = 0;
  const workspace = await getStoredWorkspaceTickers({
    env: {},
    fetchImpl: async () => {
      fetchCalls += 1;
    },
  });

  assert.deepEqual(workspace, { tickers: [], focusSymbols: [] });
  assert.equal(fetchCalls, 0);
});

test("getStoredWorkspaceTickers loads saved scanner tickers and focus symbols from Supabase REST", async () => {
  const calls = [];
  const workspace = await getStoredWorkspaceTickers({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              symbol: "NVDA",
              ticker,
              in_focus: true,
              saved_to_scanner: true,
              last_opened_at: "2026-06-01T06:45:00.000Z",
            },
            {
              symbol: "TSLA",
              ticker: { ...ticker, symbol: "TSLA", company: "Tesla Inc" },
              in_focus: false,
              saved_to_scanner: true,
              last_opened_at: "2026-06-01T06:40:00.000Z",
            },
          ];
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /saved_tickers/);
  assert.match(calls[0].url, /select=symbol%2Cticker%2Cin_focus%2Csaved_to_scanner%2Clast_opened_at%2Cupdated_at/);
  assert.equal(calls[0].options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(workspace.focusSymbols, ["NVDA"]);
  assert.deepEqual(
    workspace.tickers.map((item) => item.symbol),
    ["NVDA", "TSLA"],
  );
});

test("saveStoredWorkspaceTicker upserts ticker workspace state by symbol", async () => {
  const calls = [];
  const saved = await saveStoredWorkspaceTicker(ticker, {
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        async json() {
          return [
            {
              symbol: "NVDA",
              ticker,
              in_focus: true,
              saved_to_scanner: true,
              last_opened_at: "2026-06-01T06:45:00.000Z",
            },
          ];
        },
      };
    },
    inFocus: true,
    savedToScanner: true,
    now: () => new Date("2026-06-01T06:45:00.000Z"),
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /on_conflict=symbol/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Prefer, "resolution=merge-duplicates,return=representation");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    symbol: "NVDA",
    ticker,
    in_focus: true,
    saved_to_scanner: true,
    last_opened_at: "2026-06-01T06:45:00.000Z",
  });
  assert.deepEqual(saved, {
    ticker,
    inFocus: true,
    savedToScanner: true,
    lastOpenedAt: "2026-06-01T06:45:00.000Z",
  });
});
