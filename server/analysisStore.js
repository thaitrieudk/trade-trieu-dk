const TABLE_NAME = "ticker_ai_analyses";

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function getConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function buildHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function buildRestUrl(config, path = TABLE_NAME) {
  return new URL(`/rest/v1/${path}`, config.url);
}

export function isAnalysisStoreConfigured(env = process.env) {
  return Boolean(getConfig(env));
}

export async function getStoredTickerAnalysis(symbol, options = {}) {
  const config = getConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const normalized = normalizeSymbol(symbol);
  if (!config || !normalized) return null;

  const url = buildRestUrl(config);
  url.searchParams.set("symbol", `eq.${normalized}`);
  url.searchParams.set("select", "analysis,generated_at");
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetchImpl(url, {
    headers: buildHeaders(config.key),
  });

  if (!response.ok) {
    throw new Error(`Supabase analysis lookup failed: ${response.status}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.analysis) return null;

  return {
    ...row.analysis,
    generatedAt: row.analysis.generatedAt || row.generated_at,
  };
}

export async function saveStoredTickerAnalysis(analysis, options = {}) {
  const config = getConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const symbol = normalizeSymbol(analysis?.symbol);
  if (!config || !symbol || !analysis) return null;

  const generatedAt = analysis.generatedAt || new Date().toISOString();
  const analysisToStore = analysis.generatedAt ? analysis : { ...analysis, generatedAt };
  const url = buildRestUrl(config);
  url.searchParams.set("on_conflict", "symbol");
  url.searchParams.set("select", "analysis,generated_at");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...buildHeaders(config.key),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      symbol,
      analysis: analysisToStore,
      model: analysis.model || null,
      analysis_source: analysis.source || "openai",
      generated_at: generatedAt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase analysis upsert failed: ${response.status}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.analysis) return analysisToStore;

  return {
    ...row.analysis,
    generatedAt: row.analysis.generatedAt || row.generated_at,
  };
}

