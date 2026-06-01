const TABLE_NAME = "saved_tickers";

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

function rowToWorkspaceTicker(row) {
  const symbol = normalizeSymbol(row?.symbol || row?.ticker?.symbol);
  if (!symbol || !row?.ticker) return null;

  return {
    ticker: {
      ...row.ticker,
      symbol,
    },
    inFocus: Boolean(row.in_focus),
    savedToScanner: row.saved_to_scanner !== false,
    lastOpenedAt: row.last_opened_at || null,
  };
}

export function isWorkspaceStoreConfigured(env = process.env) {
  return Boolean(getConfig(env));
}

export async function getStoredWorkspaceTickers(options = {}) {
  const config = getConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  if (!config) return { tickers: [], focusSymbols: [] };

  const url = buildRestUrl(config);
  url.searchParams.set("select", "symbol,ticker,in_focus,saved_to_scanner,last_opened_at,updated_at");
  url.searchParams.set("order", "updated_at.desc");

  const response = await fetchImpl(url, {
    headers: buildHeaders(config.key),
  });

  if (!response.ok) {
    throw new Error(`Supabase workspace ticker lookup failed: ${response.status}`);
  }

  const rows = await response.json();
  const entries = (Array.isArray(rows) ? rows : []).map(rowToWorkspaceTicker).filter(Boolean);

  return {
    tickers: entries.filter((entry) => entry.savedToScanner).map((entry) => entry.ticker),
    focusSymbols: entries.filter((entry) => entry.inFocus).map((entry) => entry.ticker.symbol),
  };
}

export async function saveStoredWorkspaceTicker(ticker, options = {}) {
  const config = getConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const symbol = normalizeSymbol(ticker?.symbol);
  if (!config || !symbol || !ticker) return null;

  const timestamp = (options.now ? options.now() : new Date()).toISOString();
  const tickerToStore = {
    ...ticker,
    symbol,
  };
  const url = buildRestUrl(config);
  url.searchParams.set("on_conflict", "symbol");
  url.searchParams.set("select", "symbol,ticker,in_focus,saved_to_scanner,last_opened_at");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...buildHeaders(config.key),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      symbol,
      ticker: tickerToStore,
      in_focus: Boolean(options.inFocus),
      saved_to_scanner: options.savedToScanner !== false,
      last_opened_at: timestamp,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase workspace ticker upsert failed: ${response.status}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return (
    rowToWorkspaceTicker(row) || {
      ticker: tickerToStore,
      inFocus: Boolean(options.inFocus),
      savedToScanner: options.savedToScanner !== false,
      lastOpenedAt: timestamp,
    }
  );
}
