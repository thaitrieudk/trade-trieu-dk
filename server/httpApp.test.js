import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApiHandler } from "./httpApp.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("createApiHandler serves health without starting a fixed-port server", async () => {
  const server = createServer(
    createApiHandler({
      env: {
        POLYGON_API_KEY: "polygon-key",
        OPENAI_API_KEY: "openai-key",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
    }),
  );

  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.marketProvider, "polygon");
    assert.equal(body.aiProvider, "openai");
    assert.equal(body.analysisStore, "supabase");
    assert.equal(body.workspaceStore, "supabase");
  } finally {
    await close(server);
  }
});

test("createApiHandler delegates workspace ticker requests", async () => {
  const server = createServer(
    createApiHandler({
      getStoredWorkspaceTickers: async () => ({
        tickers: [{ symbol: "NVDA" }],
        focusSymbols: ["NVDA"],
      }),
    }),
  );

  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/workspace/tickers`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      tickers: [{ symbol: "NVDA" }],
      focusSymbols: ["NVDA"],
    });
  } finally {
    await close(server);
  }
});
