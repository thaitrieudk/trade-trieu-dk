import React, { useEffect, useMemo, useRef, useState } from "react";
import { resolveTickerForSymbol, shouldRequestAnalysis } from "./tradingState.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://127.0.0.1:8787");

function createEmptyTicker(symbol = "TSLA") {
  return {
    symbol,
    company: symbol,
    price: 0,
    gap: 0,
    relVol: 0,
    atr: Number.NaN,
    score: 1,
    category: "Market",
    catalystType: "Market",
    floatM: Number.NaN,
    pmHigh: 0,
    pmLow: 0,
    vwap: 0,
    volumeM: 0,
    thesis: "Loading real market data.",
    invalidation: "Wait for a valid market snapshot and chart before making a plan.",
    sources: [],
  };
}

const initialTicker = createEmptyTicker("TSLA");
const defaultFilters = {
  minPrice: 1,
  maxPrice: 500,
  minGap: 0,
  minRelVol: 0,
  maxAtr: 20,
  maxFloat: 10000,
  catalysts: ["Trend", "News", "SEC", "PR", "Market"],
};

const defaultFocus = [];

function Icon({ name }) {
  const paths = {
    chart: ["M4 19V5", "M4 19h16", "M7 15l4-4 3 3 5-7"],
    journal: ["M7 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M9 8h6", "M9 12h6"],
    strategy: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M7.8 7.8l2.8 2.8", "M13.4 13.4l2.8 2.8", "M16.2 7.8l-2.8 2.8", "M10.6 13.4l-2.8 2.8"],
    review: ["M5 5h14v14H5Z", "M8 12l3 3 5-6"],
    settings: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v3", "M12 19v3", "M4.9 4.9 7 7", "M17.1 17.1l2 2", "M2 12h3", "M19 12h3", "M4.9 19.1l2-2", "M17.1 6.9l2-2"],
    sliders: ["M4 6h8", "M16 6h4", "M4 12h4", "M12 12h8", "M4 18h10", "M18 18h2", "M12 4v4", "M10 6h4", "M10 10v4", "M8 12h4", "M16 16v4", "M14 18h4"],
    moon: ["M21 13a8 8 0 1 1-10-10 6.5 6.5 0 0 0 10 10Z"],
    sun: ["M12 5V3", "M12 21v-2", "M5 12H3", "M21 12h-2", "M6.3 6.3 4.9 4.9", "M17.7 17.7l1.4 1.4", "M17.7 6.3l1.4-1.4", "M6.3 17.7l-1.4 1.4", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
    menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
    sidebarCollapse: ["M4 5h16v14H4Z", "M9 5v14", "M16 9l-3 3 3 3"],
    sidebarExpand: ["M4 5h16v14H4Z", "M9 5v14", "M13 9l3 3-3 3"],
    search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
    edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
    x: ["M18 6 6 18", "M6 6l12 12"],
    check: ["M20 6 9 17l-5-5"],
    prev: ["M15 6l-6 6 6 6", "M20 12H9"],
    next: ["M9 6l6 6-6 6", "M4 12h11"],
    focus: ["M12 5V3", "M12 21v-2", "M5 12H3", "M21 12h-2", "M8 8h8v8H8Z"],
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function formatPercent(value) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function formatFilterSummary(filters) {
  const catalystText = filters.catalysts.length ? filters.catalysts.join("/") : "all catalysts";
  return `$${filters.minPrice}-$${filters.maxPrice}, gap >${filters.minGap}%, rel vol >${filters.minRelVol}x, ATR <${filters.maxAtr}, float <${filters.maxFloat}M, ${catalystText}`;
}

function matchesScanner(ticker, filters) {
  const atrOk = !Number.isFinite(ticker.atr) || ticker.atr <= filters.maxAtr;
  const floatOk = !Number.isFinite(ticker.floatM) || ticker.floatM <= filters.maxFloat;
  const catalystOk = !filters.catalysts.length || filters.catalysts.includes(ticker.catalystType);

  return (
    ticker.price >= filters.minPrice &&
    ticker.price <= filters.maxPrice &&
    ticker.gap >= filters.minGap &&
    ticker.relVol >= filters.minRelVol &&
    atrOk &&
    floatOk &&
    catalystOk
  );
}

function getTicker(symbol, universe = []) {
  return universe.find((ticker) => ticker.symbol === symbol);
}

function upsertTicker(universe, ticker) {
  if (!ticker?.symbol) return universe;
  const exists = universe.some((item) => item.symbol === ticker.symbol);
  return exists ? universe.map((item) => (item.symbol === ticker.symbol ? ticker : item)) : [ticker, ...universe];
}

function stampTicker(ticker, timestamp = "") {
  if (!ticker?.symbol) return ticker;
  return {
    ...ticker,
    lastUpdatedAt: timestamp || new Date().toISOString(),
  };
}

function mergeTickerLists(primary = [], supplemental = []) {
  const seen = new Set();
  const merged = [];

  [...primary, ...supplemental].forEach((ticker) => {
    if (!ticker?.symbol || seen.has(ticker.symbol)) return;
    seen.add(ticker.symbol);
    merged.push(ticker);
  });

  return merged;
}

function uniqueSymbols(symbols = []) {
  return [...new Set(symbols.map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean))];
}

function formatNumber(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals).replace(/\.?0+$/, "") : "n/a";
}

function formatPrice(value) {
  return Number.isFinite(value) && value > 0 ? `$${formatNumber(value, 2)}` : "$--";
}

function formatMillions(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)}M` : "n/a";
}

function formatAnalysisTime(value) {
  if (!value) return "Not run";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Last run unknown";
  return `Last run ${date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function shortText(value, maxLength = 150) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function buildScannerQuery(filters) {
  return new URLSearchParams({
    minPrice: String(filters.minPrice),
    maxPrice: String(filters.maxPrice),
    minGap: String(filters.minGap),
    minRelVol: String(filters.minRelVol),
    maxAtr: String(filters.maxAtr),
    maxFloat: String(filters.maxFloat),
    catalysts: filters.catalysts.join(","),
  }).toString();
}

async function fetchApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`);
  }

  return response.json();
}

function buildLocalAnalysis(ticker) {
  const score = Number.isFinite(ticker.score) ? ticker.score : 1;
  const strong = score >= 70;
  const weak = score < 50;
  return {
    symbol: ticker.symbol,
    score,
    rating: strong ? "watch" : weak ? "avoid" : "neutral",
    confidence: ticker.relVol >= 4 && ticker.gap >= 10 ? "medium" : "low",
    headline: strong ? "High-quality gapper candidate" : weak ? "Low-priority context ticker" : "Conditional watch candidate",
    summary: strong
      ? "Momentum, relative volume, and catalyst quality are aligned enough for active review."
      : "The setup needs cleaner confirmation before it belongs on the focus list.",
    thesis: ticker.thesis,
    risks: [ticker.invalidation, "Confirm spread, liquidity, and VWAP behavior before acting."],
    actionPlan: [`Review ${ticker.symbol} around VWAP ${ticker.vwap}.`, `Use PM high ${ticker.pmHigh} and PM low ${ticker.pmLow} as decision levels.`],
    source: "local-heuristic",
    generatedAt: new Date().toISOString(),
  };
}

function Sidebar({ collapsed, activeSection, setActiveSection, theme, onTheme, onCollapse }) {
  const items = [
    ["Pre-market", "chart"],
    ["Journal", "journal"],
    ["Strategies", "strategy"],
    ["Review", "review"],
  ];

  return (
    <aside className="side-nav">
      {!collapsed && <div className="side-label">Workspace</div>}
      <div className="side-items">
        {items.map(([label, icon], index) => (
          <button
            className={`side-item ${activeSection === label ? "active" : ""}`}
            key={label}
            type="button"
            title={label}
            onClick={() => setActiveSection(label)}
          >
            <span className="side-icon">
              <Icon name={icon} />
            </span>
            {!collapsed && (
              <>
                <span>{label}</span>
                <span className="side-count">{index + 1}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="side-footer">
        <button className="footer-button" type="button" title="Settings" aria-label="Settings">
          <Icon name="sliders" />
        </button>
        <button
          className="footer-button"
          type="button"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
          onClick={onTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button
          className="footer-button"
          type="button"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label="Toggle sidebar"
          onClick={onCollapse}
        >
          <Icon name={collapsed ? "sidebarExpand" : "sidebarCollapse"} />
        </button>
      </div>
    </aside>
  );
}

function TopNav({
  filters,
  scannerCount,
  searchValue,
  setSearchValue,
  searchFocused,
  setSearchFocused,
  searchResult,
  searchLoading,
  searchError,
  onOpenTicker,
  onToggleFocus,
  focusSymbols,
  marketStatus,
  onRefreshMarket,
}) {
  const marketPills = [
    ["SPY", "+0.4%", "green"],
    ["QQQ", "+0.7%", "green"],
    ["IWM", "+0.2%", "green"],
    ["VIX", "-2.1%", "red"],
  ];

  const showLookup = searchValue.trim().length > 0;
  const searchInFocus = searchResult ? focusSymbols.includes(searchResult.symbol) : false;
  const marketStatusText =
    marketStatus === "live" ? "Live API" : marketStatus === "loading" ? "Loading" : marketStatus === "offline" ? "API offline" : "No live data";

  return (
    <div className="nav">
      <div className="top-market">
        {marketPills.map(([name, value, tone]) => (
          <div className="ticker-pill" key={name}>
            {name} <span className={tone}>{value}</span>
          </div>
        ))}
        <div className="ticker-pill">CPI 08:30 ET</div>
        <div className="scanner-bus">
          <span className="bus-label">Scanner</span>
          <strong>Balanced gappers</strong>
          <span>
            <span className="green">{scannerCount}</span> candidates
          </span>
        </div>
      </div>
      <div className="right-tools">
        <label className="command-search">
          <Icon name="search" />
          <input
            className="command-input"
            value={searchValue}
            aria-label="Direct ticker lookup"
            onChange={(event) => setSearchValue(event.target.value.toUpperCase())}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResult) onOpenTicker(searchResult.symbol);
            }}
          />
          <span className="kbd">Ctrl K</span>
          {showLookup && (
            <div className="lookup-popover">
              <div className="lookup-header">
                <span>Direct ticker lookup</span>
                <span>ignores scanner filters</span>
              </div>
              {searchLoading ? (
                <div className="lookup-empty">Loading latest market data...</div>
              ) : searchResult ? (
                <div className="lookup-row">
                  <span className="lookup-symbol">{searchResult.symbol}</span>
                  <span className="lookup-meta">
                    {searchInFocus ? "In focus watchlist" : "Live ticker lookup"} - {formatPrice(searchResult.price)} - ATR {formatNumber(searchResult.atr)} - rel vol{" "}
                    {formatNumber(searchResult.relVol, 1)}x
                  </span>
                  <span className="lookup-actions">
                    <button className="lookup-open-button" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onOpenTicker(searchResult.symbol)}>
                      Open
                    </button>
                    <button className="lookup-add-focus-button" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onToggleFocus(searchResult.symbol)}>
                      {searchInFocus ? "Remove" : "Add focus"}
                    </button>
                  </span>
                </div>
              ) : searchError ? (
                <div className="lookup-empty">{searchError}</div>
              ) : (
                <div className="lookup-empty">Type any US ticker to load latest data.</div>
              )}
            </div>
          )}
        </label>
        <button className={`session-button market-status ${marketStatus}`} type="button" onClick={onRefreshMarket}>
          <span className="dot-live" />
          <span>{marketStatusText}</span>
        </button>
        <div className="top-time">08:42 ET - 14:42 CPH</div>
      </div>
    </div>
  );
}

function TradingFocus({ focusSymbols, activeSymbol, onSelect, onPrev, onNext, universe }) {
  return (
    <div className="watch-dock">
      <div className="dock-label">Trading focus</div>
      <div className="dock-tickers">
        {focusSymbols.length ? (
          focusSymbols.map((symbol) => {
            const ticker = getTicker(symbol, universe);
            if (!ticker) return null;
            return (
              <button
                type="button"
                className={`dock-ticker ${activeSymbol === symbol ? "active" : ""}`}
                key={symbol}
                onClick={() => onSelect(symbol)}
              >
                <strong>{symbol}</strong>
                <span className={ticker.gap >= 0 ? "green" : "red"}>{formatPercent(ticker.gap)}</span>
                <span>ATR {ticker.atr}</span>
              </button>
            );
          })
        ) : (
          <div className="dock-empty">No focus tickers</div>
        )}
      </div>
      <div className="dock-spacer" />
      <div className="dock-controls">
        <button className="dock-control" type="button" title="Previous ticker" aria-label="Previous ticker" onClick={onPrev}>
          <Icon name="prev" />
        </button>
        <button className="dock-control" type="button" title="Next ticker" aria-label="Next ticker" onClick={onNext}>
          <Icon name="next" />
        </button>
        <button className="dock-control" type="button" title="Focus selected ticker" aria-label="Focus selected ticker">
          <Icon name="focus" />
        </button>
      </div>
    </div>
  );
}

function ScannerPanel({ candidates, activeSymbol, onSelect, filterSummary, onOpenFilters }) {
  return (
    <section className="panel scanner-panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="icon-square">S</span>
          <span>Live scanner</span>
        </div>
        <div className="panel-sub">filter scan only</div>
      </div>
      <div className="panel-body">
        <div className="lookup-note">Global search is separate: open any US ticker without changing these filters.</div>
        <div className="scanner-tools">
          <input className="search scanner-filter-input" value={filterSummary} readOnly aria-label="Scanner filter expression" />
          <button className="tiny-button filter-edit-button" type="button" aria-haspopup="dialog" onClick={onOpenFilters}>
            <Icon name="edit" />
            <span>Edit</span>
          </button>
        </div>
        <div className="scanner-table">
          <div className="scanner-head">
            <span>Symbol</span>
            <span>Gap</span>
            <span>RelVol</span>
            <span>ATR</span>
            <span>Score</span>
            <span>Cat.</span>
          </div>
          {candidates.length ? (
            candidates.map((ticker) => (
              <button
                type="button"
                className={`scan-row ${activeSymbol === ticker.symbol ? "selected" : ""}`}
                key={ticker.symbol}
                onClick={() => onSelect(ticker.symbol)}
              >
                <span className="symbol">{ticker.symbol}</span>
                <span className={ticker.gap >= 0 ? "green" : "red"}>{formatPercent(ticker.gap)}</span>
                <span>{ticker.relVol}x</span>
                <span>{ticker.atr}</span>
                <span>{ticker.score}</span>
                <span className="small-source">{ticker.category}</span>
              </button>
            ))
          ) : (
            <div className="empty-scanner">No candidates match the current filters.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function RealPriceChart({ ticker, bars, loading, error }) {
  if (loading) return <div className="chart-empty">Loading real chart...</div>;
  if (error) return <div className="chart-empty">{error}</div>;
  if (!bars.length) return <div className="chart-empty">No aggregate bars returned for {ticker.symbol}.</div>;

  const visibleBars = bars.slice(-72);
  const width = 1000;
  const height = 280;
  const padX = 34;
  const padY = 22;
  const volumeHeight = 46;
  const volumeGap = 12;
  const highs = visibleBars.map((bar) => bar.high).filter(Number.isFinite);
  const lows = visibleBars.map((bar) => bar.low).filter(Number.isFinite);
  const volumes = visibleBars.map((bar) => bar.volume).filter(Number.isFinite);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const maxVolume = Math.max(1, ...volumes);
  const range = Math.max(0.01, maxPrice - minPrice);
  const chartWidth = width - padX * 2;
  const priceHeight = height - padY * 2 - volumeHeight - volumeGap;
  const volumeTop = padY + priceHeight + volumeGap;
  const candleWidth = Math.max(7, Math.min(16, (chartWidth / visibleBars.length) * 0.68));
  const xFor = (index) => padX + (visibleBars.length === 1 ? chartWidth / 2 : (index / (visibleBars.length - 1)) * chartWidth);
  const yFor = (price) => padY + ((maxPrice - price) / range) * priceHeight;
  const closePath = visibleBars.map((bar, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(bar.close)}`).join(" ");
  const firstTime = new Date(visibleBars[0].time).toLocaleDateString([], { month: "short", day: "numeric" });
  const lastTime = new Date(visibleBars[visibleBars.length - 1].time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const lastClose = visibleBars[visibleBars.length - 1].close;
  const lastCloseY = yFor(lastClose);

  return (
    <svg className="real-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${ticker.symbol} real aggregate chart`}>
      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
        const y = padY + step * priceHeight;
        const price = maxPrice - step * range;
        return (
          <g key={step}>
            <line className="chart-grid-line" x1={padX} y1={y} x2={width - padX} y2={y} />
            <text className="chart-axis-label" x={width - padX + 8} y={y + 4}>
              {formatNumber(price, 2)}
            </text>
          </g>
        );
      })}
      <line className="chart-volume-divider" x1={padX} y1={volumeTop - 6} x2={width - padX} y2={volumeTop - 6} />
      <line className="chart-last-price" x1={padX} y1={lastCloseY} x2={width - padX} y2={lastCloseY} />
      <text className="chart-price-tag" x={width - padX - 56} y={lastCloseY - 5}>
        {formatNumber(lastClose, 2)}
      </text>
      <path className="chart-close-line" d={closePath} />
      {visibleBars.map((bar, index) => {
        const x = xFor(index);
        const openY = yFor(bar.open);
        const closeY = yFor(bar.close);
        const highY = yFor(bar.high);
        const lowY = yFor(bar.low);
        const up = bar.close >= bar.open;
        return (
          <g className={up ? "chart-candle up" : "chart-candle down"} key={`${bar.time}-${index}`}>
            <line x1={x} y1={highY} x2={x} y2={lowY} />
            <rect x={x - candleWidth / 2} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(closeY - openY))} />
          </g>
        );
      })}
      {visibleBars.map((bar, index) => {
        const x = xFor(index);
        const barHeight = Math.max(1, (bar.volume / maxVolume) * volumeHeight);
        const up = bar.close >= bar.open;
        return <rect className={up ? "chart-volume up" : "chart-volume down"} key={`volume-${bar.time}-${index}`} x={x - candleWidth / 2} y={volumeTop + volumeHeight - barHeight} width={candleWidth} height={barHeight} />;
      })}
      <text className="chart-volume-label" x={padX} y={volumeTop - 10}>
        Volume
      </text>
      <text className="chart-time-label" x={padX} y={height - 5}>
        {firstTime}
      </text>
      <text className="chart-time-label" x={width - padX - 125} y={height - 5}>
        {lastTime}
      </text>
    </svg>
  );
}

function ChartPanel({ ticker, inFocus, bars, chartLoading, chartError }) {
  return (
    <section className="panel detail-panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="icon-square">A</span>
          <span>
            {ticker.symbol} detail {inFocus && <span className="saved-indicator">focus</span>}
          </span>
        </div>
        <div className="panel-sub">
          {formatPrice(ticker.price)} <span className={ticker.gap >= 0 ? "green" : "red"}>{formatPercent(ticker.gap)}</span>
        </div>
      </div>
      <div className="panel-body detail-body">
        <div className="chart-card">
          <div className="chart-toolbar">
            <span>5m aggregate bars - Polygon/Massive</span>
            <span>{bars.length ? `${Math.min(72, bars.length)} visible / ${bars.length} bars` : "waiting for bars"}</span>
          </div>
          <RealPriceChart ticker={ticker} bars={bars} loading={chartLoading} error={chartError} />
        </div>
        <div className="metric-row">
          <div className="metric">
            <span>High</span>
            <strong>{formatNumber(ticker.pmHigh)}</strong>
          </div>
          <div className="metric">
            <span>Low</span>
            <strong>{formatNumber(ticker.pmLow)}</strong>
          </div>
          <div className="metric">
            <span>VWAP</span>
            <strong>{formatNumber(ticker.vwap)}</strong>
          </div>
          <div className="metric">
            <span>Float</span>
            <strong>{formatMillions(ticker.floatM)}</strong>
          </div>
          <div className="metric">
            <span>Volume</span>
            <strong>{formatMillions(ticker.volumeM)}</strong>
          </div>
          <div className="metric">
            <span>Range</span>
            <strong>{formatNumber(ticker.atr)}</strong>
          </div>
        </div>
        <div className="plan-editor">
          <div className="editor-tabs">
            <button className="editor-tab active" type="button">
              Plan
            </button>
            <button className="editor-tab" type="button">
              Levels
            </button>
            <button className="editor-tab" type="button">
              Notes
            </button>
          </div>
          <div className="editor-box">
            <div className="text-block">
              <strong>Thesis</strong>
              <br />
              {ticker.thesis}
            </div>
            <div className="text-block">
              <strong>Invalidation</strong>
              <br />
              {ticker.invalidation}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CopilotPanel({
  ticker,
  inFocus,
  inScanner,
  analysis,
  analysisLoading,
  analysisRequested,
  analysisCacheLoading,
  analysisLastRunAt,
  analysisCacheStatus,
  analysisError,
  onAnalyze,
  onToggleFocus,
}) {
  const contextCopy = inFocus
    ? `On focus watchlist - ATR ${ticker.atr}`
    : inScanner
      ? "From scanner - not in focus"
      : "Lookup ticker - not in focus";
  const activeAnalysis = analysisRequested && analysis ? analysis : null;
  const analysisSource =
    analysisCacheStatus === "hit"
      ? "Saved OpenAI analysis"
      : activeAnalysis?.source === "openai"
      ? "OpenAI analysis"
      : activeAnalysis?.source === "heuristic-fallback"
        ? "AI fallback"
        : activeAnalysis?.source === "heuristic"
          ? "AI heuristic"
          : "Manual analysis";
  const analysisTimeCopy = analysisLoading ? "Running AI" : analysisCacheLoading ? "Checking saved AI" : formatAnalysisTime(analysisLastRunAt);
  const warningCopy = analysisError || activeAnalysis?.error;
  const summaryText = shortText(activeAnalysis?.summary, 165);
  const thesisText = shortText(activeAnalysis?.thesis, 260);
  const riskText = shortText((activeAnalysis?.risks || []).join(" "), 260);
  const hasOpenAiAnalysis = activeAnalysis?.symbol === ticker.symbol && activeAnalysis?.source === "openai";

  return (
    <section className="panel copilot-panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="icon-square">AI</span>
          <span>Co-pilot + active plan</span>
        </div>
        <div className="analysis-actions">
          <span className={`analysis-timestamp ${analysisCacheStatus || "miss"}`}>{analysisTimeCopy}</span>
          <button className="panel-action analyze-button" type="button" onClick={() => onAnalyze(ticker.symbol)} disabled={analysisLoading || analysisCacheLoading}>
            {analysisLoading ? "Analyzing..." : hasOpenAiAnalysis ? "Re-analyze" : "Analyze"}
          </button>
        </div>
      </div>
      <div className="panel-body right-body">
        {analysisRequested && activeAnalysis ? (
          <div className="score-card">
            <div className="score-ring">{activeAnalysis.score}</div>
            <div className="score-copy">
              <strong>{activeAnalysis.headline}</strong>
              <span>{summaryText}</span>
            </div>
          </div>
        ) : (
          <div className="score-card score-card-idle">
            <div className="score-ring idle">AI</div>
            <div className="score-copy">
              <strong>Manual ticker analysis</strong>
              <span>Click Analyze to spend an AI request on {ticker.symbol}. Market data and chart loading do not call OpenAI.</span>
            </div>
          </div>
        )}

        <div className="source-stack">
          {analysisRequested && activeAnalysis ? (
            <>
              <div className="source-card ai-source-card">
                <strong>{analysisSource}</strong>
                {thesisText}
              </div>
              <div className="source-card">
                <strong>Risk check</strong>
                {riskText}
              </div>
            </>
          ) : (
            <div className="source-card ai-source-card idle-source-card">
              <strong>AI standby</strong>
              No analysis has been requested for {ticker.symbol} yet.
            </div>
          )}
          {warningCopy && (
            <div className="source-card warning-source-card">
              <strong>AI fallback</strong>
              {warningCopy}
            </div>
          )}
          {ticker.sources.map(([label, copy]) => (
            <div className="source-card" key={label}>
              <strong>{label}</strong>
              {copy}
            </div>
          ))}
        </div>

        <div className="watch-panel">
          <div className="panel-title">
            <span>Trading focus controls</span>
          </div>
          <div>
            <div className="watch-row">
              <span className="symbol">{ticker.symbol}</span>
              <span>{contextCopy}</span>
              <span className={inFocus ? "green" : ""}>{inFocus ? "Active" : "Preview"}</span>
            </div>
            <div className="watch-row">
              <span className="symbol">Risk</span>
              <span>Size from stop distance and ATR expansion</span>
              <span>Check</span>
            </div>
            <div className="watch-row">
              <span className="symbol">Cycle</span>
              <span>Focus can be changed without changing scanner results.</span>
              <span>Ready</span>
            </div>
          </div>
          <div className="action-row">
            <button className={`primary-action focus-toggle-button ${inFocus ? "remove-action" : ""}`} type="button" onClick={() => onToggleFocus(ticker.symbol)}>
              {inFocus ? "Remove from focus" : "Add to focus"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterModal({ open, draft, setDraft, onApply, onClose, onReset }) {
  const catalystOptions = ["Trend", "News", "SEC", "PR", "Market"];

  if (!open) return null;

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  }

  function updateCatalyst(value) {
    setDraft((current) => {
      const exists = current.catalysts.includes(value);
      const catalysts = exists ? current.catalysts.filter((item) => item !== value) : [...current.catalysts, value];
      return { ...current, catalysts };
    });
  }

  return (
    <div className="filter-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="filter-modal" id="scanner-filter-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-filter-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="filter-modal-head">
          <div>
            <span className="modal-kicker">Scanner setup</span>
            <h2 id="scanner-filter-title">Pre-market filters</h2>
          </div>
          <button className="modal-icon-button" type="button" aria-label="Close filter settings" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="filter-modal-body">
          <div className="filter-modal-summary">
            <span>Active expression</span>
            <strong className="filter-modal-preview">{formatFilterSummary(draft)}</strong>
          </div>
          <div className="filter-grid">
            <label className="filter-field">
              <span>Min price</span>
              <input data-filter-field="minPrice" type="number" min="0" step="0.5" value={draft.minPrice} onChange={(event) => updateField("minPrice", event.target.value)} />
            </label>
            <label className="filter-field">
              <span>Max price</span>
              <input data-filter-field="maxPrice" type="number" min="0" step="0.5" value={draft.maxPrice} onChange={(event) => updateField("maxPrice", event.target.value)} />
            </label>
            <label className="filter-field">
              <span>Gap at least</span>
              <input data-filter-field="minGap" type="number" min="0" step="0.5" value={draft.minGap} onChange={(event) => updateField("minGap", event.target.value)} />
            </label>
            <label className="filter-field">
              <span>Rel vol at least</span>
              <input data-filter-field="minRelVol" type="number" min="0" step="0.1" value={draft.minRelVol} onChange={(event) => updateField("minRelVol", event.target.value)} />
            </label>
            <label className="filter-field">
              <span>ATR max</span>
              <input data-filter-field="maxAtr" type="number" min="0" step="0.1" value={draft.maxAtr} onChange={(event) => updateField("maxAtr", event.target.value)} />
            </label>
            <label className="filter-field">
              <span>Float max M</span>
              <input data-filter-field="maxFloat" type="number" min="0" step="1" value={draft.maxFloat} onChange={(event) => updateField("maxFloat", event.target.value)} />
            </label>
          </div>
          <div className="filter-section">
            <span className="filter-section-label">Catalyst types</span>
            <div className="filter-checks">
              {catalystOptions.map((option) => (
                <label className="filter-check" key={option}>
                  <input type="checkbox" checked={draft.catalysts.includes(option)} onChange={() => updateCatalyst(option)} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="filter-modal-actions">
          <button className="modal-action ghost" type="button" onClick={onReset}>
            Reset
          </button>
          <span />
          <button className="modal-action" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-action primary" type="button" onClick={onApply}>
            <Icon name="check" />
            <span>Apply filters</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState("Pre-market");
  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [marketUniverse, setMarketUniverse] = useState([]);
  const [savedWorkspaceTickers, setSavedWorkspaceTickers] = useState([]);
  const [marketStatus, setMarketStatus] = useState("loading");
  const [focusSymbols, setFocusSymbols] = useState(defaultFocus);
  const [activeSymbol, setActiveSymbol] = useState("TSLA");
  const [searchValue, setSearchValue] = useState("TSLA");
  const [searchFocused, setSearchFocused] = useState(false);
  const [lookupTicker, setLookupTicker] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [chartBars, setChartBars] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisCacheLoading, setAnalysisCacheLoading] = useState(false);
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [analysisLastRunAt, setAnalysisLastRunAt] = useState("");
  const [analysisCacheStatus, setAnalysisCacheStatus] = useState("miss");
  const [analysisError, setAnalysisError] = useState("");
  const [toast, setToast] = useState("Ready: real market data loads from Polygon/Massive.");
  const analysisInFlightRef = useRef(false);
  const savedWorkspaceTickersRef = useRef([]);

  const scannerCandidates = useMemo(() => {
    const filtered = marketUniverse.filter((ticker) => matchesScanner(ticker, filters));
    return mergeTickerLists(filtered, savedWorkspaceTickers);
  }, [filters, marketUniverse, savedWorkspaceTickers]);
  const activeTicker = resolveTickerForSymbol(activeSymbol, { universe: marketUniverse, lookupTicker }) || scannerCandidates[0] || marketUniverse[0] || initialTicker;
  const searchSymbol = searchValue.trim().toUpperCase();
  const searchResult = resolveTickerForSymbol(searchSymbol, { universe: marketUniverse, lookupTicker });
  const filterSummary = formatFilterSummary(filters);
  const activeInFocus = focusSymbols.includes(activeTicker.symbol);
  const activeInScanner = scannerCandidates.some((ticker) => ticker.symbol === activeTicker.symbol);

  function showToast(message) {
    setToast(message);
  }

  function rememberWorkspaceTicker(ticker) {
    setSavedWorkspaceTickers((current) => {
      const next = upsertTicker(current, ticker);
      savedWorkspaceTickersRef.current = next;
      return next;
    });
  }

  function saveWorkspaceTicker(ticker, options = {}) {
    if (!ticker?.symbol) return;

    fetchApi("/api/workspace/tickers", {
      method: "POST",
      body: JSON.stringify({
        ticker,
        inFocus: Boolean(options.inFocus),
        savedToScanner: options.savedToScanner !== false,
      }),
    }).catch(() => {
      showToast(`${ticker.symbol} is available in this session, but Supabase did not save the workspace change.`);
    });
  }

  async function loadLatestTicker(symbol) {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized) return null;

    const data = await fetchApi(`/api/market/ticker/${encodeURIComponent(normalized)}`);
    const latestTicker = stampTicker(data.ticker, data.generatedAt);
    setLookupTicker(latestTicker);
    setMarketUniverse((current) => upsertTicker(current, latestTicker));
    return latestTicker;
  }

  async function refreshMarketData(message = true) {
    setMarketStatus("loading");
    try {
      const data = await fetchApi(`/api/market/scanner?${buildScannerQuery(filters)}`);
      const nextUniverse = mergeTickerLists(Array.isArray(data.universe) ? data.universe : [], savedWorkspaceTickersRef.current);
      setMarketUniverse(nextUniverse);
      setMarketStatus(data.live ? "live" : "offline");
      if (message) showToast(`Market data refreshed from ${data.source}. Scanner has ${data.tickers.length} candidates.`);
    } catch (error) {
      setMarketUniverse(savedWorkspaceTickersRef.current);
      setMarketStatus("offline");
      if (message) showToast("Market API offline. No fallback data is loaded.");
    }
  }

  useEffect(() => {
    savedWorkspaceTickersRef.current = savedWorkspaceTickers;
  }, [savedWorkspaceTickers]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceTickers() {
      try {
        const data = await fetchApi("/api/workspace/tickers");
        if (cancelled) return;
        const tickers = Array.isArray(data.tickers) ? data.tickers : [];
        const focus = uniqueSymbols(Array.isArray(data.focusSymbols) ? data.focusSymbols : []);
        savedWorkspaceTickersRef.current = tickers;
        setSavedWorkspaceTickers(tickers);
        setFocusSymbols(focus);
        setMarketUniverse((current) => mergeTickerLists(current, tickers));
        if (tickers.length || focus.length) showToast(`Workspace restored: ${tickers.length} saved scanner ticker${tickers.length === 1 ? "" : "s"}.`);
      } catch {
        if (!cancelled) showToast("Workspace persistence is unavailable. Scanner and focus changes will stay local only.");
      }
    }

    loadWorkspaceTickers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      setMarketStatus("loading");
      try {
        const data = await fetchApi(`/api/market/scanner?${buildScannerQuery(filters)}`);
        if (cancelled) return;
        setMarketUniverse(mergeTickerLists(Array.isArray(data.universe) ? data.universe : [], savedWorkspaceTickersRef.current));
        setMarketStatus(data.live ? "live" : "offline");
      } catch {
        if (cancelled) return;
        setMarketUniverse(savedWorkspaceTickersRef.current);
        setMarketStatus("offline");
      }
    }

    loadMarketData();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    const symbol = searchValue.trim().toUpperCase();

    if (!symbol) {
      setLookupTicker(null);
      setLookupError("");
      setLookupLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLookupLoading(true);
    setLookupError("");
    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchApi(`/api/market/ticker/${encodeURIComponent(symbol)}`);
        if (cancelled) return;
        const latestTicker = stampTicker(data.ticker, data.generatedAt);
        setLookupTicker(latestTicker);
        setMarketUniverse((current) => upsertTicker(current, latestTicker));
      } catch {
        if (cancelled) return;
        setLookupTicker(null);
        setLookupError(`${symbol} was not found or the market API rejected the lookup.`);
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchValue]);

  useEffect(() => {
    let cancelled = false;

    async function loadChart() {
      if (!activeTicker.symbol) return;
      setChartLoading(true);
      setChartError("");
      try {
        const data = await fetchApi(`/api/market/chart/${encodeURIComponent(activeTicker.symbol)}?multiplier=5&timespan=minute`);
        if (!cancelled) setChartBars(Array.isArray(data.bars) ? data.bars : []);
      } catch {
        if (!cancelled) {
          setChartBars([]);
          setChartError(`No real chart data returned for ${activeTicker.symbol}.`);
        }
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    loadChart();
    return () => {
      cancelled = true;
    };
  }, [activeTicker.symbol, activeTicker.lastUpdatedAt]);

  useEffect(() => {
    let cancelled = false;

    analysisInFlightRef.current = false;
    setAnalysis(null);
    setAnalysisRequested(false);
    setAnalysisError("");
    setAnalysisLoading(false);
    setAnalysisLastRunAt("");
    setAnalysisCacheStatus("loading");
    setAnalysisCacheLoading(true);

    async function loadStoredAnalysis() {
      if (!activeTicker.symbol) {
        setAnalysisCacheStatus("miss");
        setAnalysisCacheLoading(false);
        return;
      }
      try {
        const data = await fetchApi(`/api/ai/ticker-analysis/${encodeURIComponent(activeTicker.symbol)}`);
        if (cancelled) return;
        if (data.analysis) {
          setAnalysis(data.analysis);
          setAnalysisRequested(true);
          setAnalysisLastRunAt(data.lastRunAt || data.analysis.generatedAt || "");
        }
        setAnalysisCacheStatus(data.cacheStatus || (data.analysis ? "hit" : "miss"));
        if (data.error) setAnalysisError("Saved AI analysis is unavailable right now.");
      } catch {
        if (!cancelled) {
          setAnalysisCacheStatus("error");
          setAnalysisError("Saved AI analysis is unavailable right now.");
        }
      } finally {
        if (!cancelled) setAnalysisCacheLoading(false);
      }
    }

    loadStoredAnalysis();
    return () => {
      cancelled = true;
    };
  }, [activeTicker.symbol]);

  async function requestAnalysis(symbol = activeTicker.symbol) {
    const ticker = symbol === activeTicker.symbol ? activeTicker : resolveTickerForSymbol(symbol, { universe: marketUniverse, lookupTicker });
    if (!ticker || analysisLoading || analysisInFlightRef.current) return;
    const force = analysis?.symbol === ticker.symbol && analysis.source === "openai";
    if (!shouldRequestAnalysis({ analysis, ticker, force })) {
      setAnalysisRequested(true);
      showToast(`${ticker.symbol} analysis already loaded. No new tokens used.`);
      return;
    }

    analysisInFlightRef.current = true;
    setAnalysisRequested(true);
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisCacheStatus("loading");
    try {
      const data = await fetchApi("/api/ai/ticker-analysis", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          scannerCandidates,
          focusSymbols,
          force,
        }),
      });
      const nextAnalysis = data.analysis || buildLocalAnalysis(ticker);
      setAnalysis(nextAnalysis);
      setAnalysisLastRunAt(data.lastRunAt || nextAnalysis.generatedAt || "");
      setAnalysisCacheStatus(data.cacheStatus || "not-stored");
      if (data.error) setAnalysisError("Analysis was generated, but Supabase could not save it.");
      if (data.cacheStatus === "hit") {
        showToast(`${ticker.symbol} saved AI analysis loaded. No new tokens used.`);
      } else if (data.cacheStatus === "stored") {
        showToast(`${ticker.symbol} AI analysis saved to Supabase.`);
      } else {
        showToast(`${ticker.symbol} AI analysis complete. Supabase cache is not configured.`);
      }
    } catch {
      const fallback = buildLocalAnalysis(ticker);
      setAnalysis(fallback);
      setAnalysisLastRunAt(fallback.generatedAt);
      setAnalysisCacheStatus("not-stored");
      setAnalysisError("AI API offline. Showing local heuristic analysis.");
      showToast(`${ticker.symbol} AI request failed. Showing local analysis.`);
    } finally {
      analysisInFlightRef.current = false;
      setAnalysisLoading(false);
    }
  }

  function openFilters() {
    setDraftFilters(filters);
    setFilterModalOpen(true);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setFilterModalOpen(false);
    showToast("Scanner filters applied. Search results remain separate.");
  }

  function resetDraftFilters() {
    setDraftFilters(defaultFilters);
  }

  async function selectTicker(symbol) {
    const existing = resolveTickerForSymbol(symbol, { universe: marketUniverse, lookupTicker });
    const normalized = String(symbol || existing?.symbol || "").trim().toUpperCase();
    if (!normalized) return;

    setActiveSymbol(normalized);
    try {
      await loadLatestTicker(normalized);
    } catch {
      showToast(`${normalized} opened with saved data. Live refresh failed.`);
    }
  }

  async function toggleFocus(symbol) {
    const existing = resolveTickerForSymbol(symbol, { universe: marketUniverse, lookupTicker });
    if (existing) setActiveSymbol(existing.symbol);

    let ticker = existing;
    try {
      ticker = (await loadLatestTicker(symbol)) || existing;
    } catch {
      if (existing) showToast(`${existing.symbol} focus changed with saved data. Live refresh failed.`);
    }
    if (!ticker) return;
    const inFocus = focusSymbols.includes(ticker.symbol);
    const nextInFocus = !inFocus;
    setMarketUniverse((current) => upsertTicker(current, ticker));
    rememberWorkspaceTicker(ticker);
    setFocusSymbols((current) => (current.includes(ticker.symbol) ? current.filter((item) => item !== ticker.symbol) : uniqueSymbols([ticker.symbol, ...current])));
    setActiveSymbol(ticker.symbol);
    saveWorkspaceTicker(ticker, { inFocus: nextInFocus, savedToScanner: true });
    showToast(`${ticker.symbol} ${inFocus ? "removed from Trading Focus and kept in scanner workspace" : "added to Trading Focus and saved"}.`);
  }

  async function openTicker(symbol) {
    const existing = resolveTickerForSymbol(symbol, { universe: marketUniverse, lookupTicker });
    if (existing) setActiveSymbol(existing.symbol);

    let ticker = existing;
    try {
      ticker = (await loadLatestTicker(symbol)) || existing;
    } catch {
      if (existing) showToast(`${existing.symbol} opened with saved data. Live refresh failed.`);
    }
    if (!ticker) return;
    setMarketUniverse((current) => upsertTicker(current, ticker));
    rememberWorkspaceTicker(ticker);
    setActiveSymbol(ticker.symbol);
    saveWorkspaceTicker(ticker, { inFocus: focusSymbols.includes(ticker.symbol), savedToScanner: true });
    showToast(`${ticker.symbol} refreshed and saved to scanner workspace. Add focus only if you want it on the watchlist.`);
  }

  function moveFocus(direction) {
    if (!focusSymbols.length) {
      showToast("Trading Focus is empty.");
      return;
    }
    const currentIndex = focusSymbols.indexOf(activeTicker.symbol);
    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : focusSymbols.length - 1
        : (currentIndex + direction + focusSymbols.length) % focusSymbols.length;
    selectTicker(focusSymbols[nextIndex]);
  }

  return (
    <div className={`app-shell ${theme}`}>
      <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar
          collapsed={sidebarCollapsed}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          theme={theme}
          onTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          onCollapse={() => setSidebarCollapsed((current) => !current)}
        />
        <TopNav
          filters={filters}
          scannerCount={scannerCandidates.length}
          searchValue={searchValue}
          setSearchValue={setSearchValue}
          searchFocused={searchFocused}
          setSearchFocused={setSearchFocused}
          searchResult={searchResult}
          searchLoading={lookupLoading}
          searchError={lookupError}
          onOpenTicker={openTicker}
          onToggleFocus={toggleFocus}
          focusSymbols={focusSymbols}
          marketStatus={marketStatus}
          onRefreshMarket={() => refreshMarketData(true)}
        />
        <TradingFocus
          focusSymbols={focusSymbols}
          activeSymbol={activeTicker.symbol}
          onSelect={selectTicker}
          onPrev={() => moveFocus(-1)}
          onNext={() => moveFocus(1)}
          universe={marketUniverse}
        />
        <main className="body-shell">
          <div className="main-grid">
            <ScannerPanel
              candidates={scannerCandidates}
              activeSymbol={activeTicker.symbol}
              onSelect={selectTicker}
              filterSummary={filterSummary}
              onOpenFilters={openFilters}
            />
            <ChartPanel ticker={activeTicker} inFocus={activeInFocus} bars={chartBars} chartLoading={chartLoading} chartError={chartError} />
            <CopilotPanel
              ticker={activeTicker}
              inFocus={activeInFocus}
              inScanner={activeInScanner}
              analysis={analysis}
              analysisLoading={analysisLoading}
              analysisRequested={analysisRequested}
              analysisCacheLoading={analysisCacheLoading}
              analysisLastRunAt={analysisLastRunAt}
              analysisCacheStatus={analysisCacheStatus}
              analysisError={analysisError}
              onAnalyze={requestAnalysis}
              onToggleFocus={toggleFocus}
            />
          </div>
        </main>
        <div className="status-toast" role="status">
          {toast}
        </div>
        <FilterModal
          open={filterModalOpen}
          draft={draftFilters}
          setDraft={setDraftFilters}
          onApply={applyFilters}
          onClose={() => setFilterModalOpen(false)}
          onReset={resetDraftFilters}
        />
      </div>
    </div>
  );
}
