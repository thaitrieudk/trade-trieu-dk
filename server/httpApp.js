import { getAnalysisForTicker, getCachedAnalysisForSymbol } from "./analysisService.js";
import { isAnalysisStoreConfigured } from "./analysisStore.js";
import { normalizeFilters } from "./marketRules.js";
import { getMarketChart, getMarketScanner, getMarketTicker } from "./marketProvider.js";
import { getStoredWorkspaceTickers, isWorkspaceStoreConfigured, saveStoredWorkspaceTicker } from "./workspaceStore.js";

function sendJson(response, statusCode, payload, corsOrigin) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function getUrl(request, port) {
  return new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);
}

export function createApiHandler(options = {}) {
  const env = options.env || process.env;
  const port = Number(env.PORT || 8787);
  const corsOrigin = env.CORS_ORIGIN || "http://127.0.0.1:5173";
  const dependencies = {
    getAnalysisForTicker,
    getCachedAnalysisForSymbol,
    getMarketChart,
    getMarketScanner,
    getMarketTicker,
    getStoredWorkspaceTickers,
    isAnalysisStoreConfigured,
    isWorkspaceStoreConfigured,
    saveStoredWorkspaceTicker,
    ...options,
  };

  return async function handleApiRequest(request, response) {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, {}, corsOrigin);
      return;
    }

    try {
      const url = getUrl(request, port);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(
          response,
          200,
          {
            ok: true,
            marketProvider: env.POLYGON_API_KEY ? "polygon" : "unconfigured",
            aiProvider: env.OPENAI_API_KEY ? "openai" : "heuristic",
            analysisStore: dependencies.isAnalysisStoreConfigured(env) ? "supabase" : "unconfigured",
            workspaceStore: dependencies.isWorkspaceStoreConfigured(env) ? "supabase" : "unconfigured",
          },
          corsOrigin,
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/workspace/tickers") {
        const result = await dependencies.getStoredWorkspaceTickers();
        sendJson(response, 200, result, corsOrigin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/workspace/tickers") {
        const body = await readBody(request);
        if (!body.ticker?.symbol) {
          sendJson(response, 400, { error: "ticker is required" }, corsOrigin);
          return;
        }
        const result = await dependencies.saveStoredWorkspaceTicker(body.ticker, {
          inFocus: Boolean(body.inFocus),
          savedToScanner: body.savedToScanner !== false,
        });
        sendJson(response, 200, result, corsOrigin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/market/scanner") {
        const filters = normalizeFilters(url.searchParams);
        const result = await dependencies.getMarketScanner(filters);
        sendJson(
          response,
          200,
          {
            ...result,
            filters,
            generatedAt: new Date().toISOString(),
          },
          corsOrigin,
        );
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/market/ticker/")) {
        const symbol = decodeURIComponent(url.pathname.split("/").pop() || "").toUpperCase();
        const result = await dependencies.getMarketTicker(symbol);
        if (!result.ticker) {
          sendJson(response, 404, { error: `Ticker ${symbol} not found` }, corsOrigin);
          return;
        }
        sendJson(
          response,
          200,
          {
            ...result,
            generatedAt: new Date().toISOString(),
          },
          corsOrigin,
        );
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/market/chart/")) {
        const symbol = decodeURIComponent(url.pathname.split("/").pop() || "").toUpperCase();
        const result = await dependencies.getMarketChart(symbol, {
          multiplier: Number(url.searchParams.get("multiplier") || 5),
          timespan: url.searchParams.get("timespan") || "minute",
        });
        sendJson(response, 200, result, corsOrigin);
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/ai/ticker-analysis/")) {
        const symbol = decodeURIComponent(url.pathname.split("/").pop() || "").toUpperCase();
        const result = await dependencies.getCachedAnalysisForSymbol(symbol);
        sendJson(response, 200, result, corsOrigin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/ticker-analysis") {
        const body = await readBody(request);
        if (!body.ticker?.symbol) {
          sendJson(response, 400, { error: "ticker is required" }, corsOrigin);
          return;
        }
        const result = await dependencies.getAnalysisForTicker(body);
        sendJson(response, 200, result, corsOrigin);
        return;
      }

      sendJson(response, 404, { error: "Not found" }, corsOrigin);
    } catch (error) {
      sendJson(response, 500, { error: error.message }, corsOrigin);
    }
  };
}
