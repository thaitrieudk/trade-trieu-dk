function clampScore(value) {
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function buildHeuristicAnalysis(ticker, source = "heuristic") {
  const score = clampScore(ticker.score || ticker.gap * 0.6 + ticker.relVol * 5);
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
      : weak
        ? "The setup does not yet justify focus without a separate strategy reason."
        : "The ticker is usable as context, but needs cleaner confirmation before becoming a focus name.",
    thesis: ticker.thesis,
    risks: [
      ticker.invalidation,
      ticker.atr > 2 ? "ATR is wide; sizing must allow for larger stop distance." : "Confirm spread and liquidity before entry.",
    ],
    actionPlan: [
      `Mark ${ticker.symbol} only if it holds above VWAP ${ticker.vwap}.`,
      `Use PM high ${ticker.pmHigh} and PM low ${ticker.pmLow} as first decision levels.`,
      "No execution signal is generated here; this is analysis for review only.",
    ],
    source,
    generatedAt: new Date().toISOString(),
  };
}

function extractResponseText(response) {
  if (response.output_text) return response.output_text;

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "text" && content.text) return content.text;
    }
  }

  return "";
}

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["symbol", "score", "rating", "confidence", "headline", "summary", "thesis", "risks", "actionPlan"],
  properties: {
    symbol: { type: "string" },
    score: { type: "number", minimum: 1, maximum: 99 },
    rating: { type: "string", enum: ["watch", "neutral", "avoid"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    headline: { type: "string" },
    summary: { type: "string" },
    thesis: { type: "string" },
    risks: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
    },
    actionPlan: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
    },
  },
};

export async function getTickerAnalysis({ ticker, scannerCandidates = [], focusSymbols = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    return buildHeuristicAnalysis(ticker);
  }

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const payload = {
    model,
    instructions:
      "You are a disciplined daytrading analysis assistant. Return concise structured analysis only. Do not claim certainty, do not provide execution instructions, and always include risk controls.",
    input: JSON.stringify({
      ticker,
      scannerCandidates: scannerCandidates.map((candidate) => ({
        symbol: candidate.symbol,
        gap: candidate.gap,
        relVol: candidate.relVol,
        atr: candidate.atr,
        score: candidate.score,
        catalystType: candidate.catalystType,
        floatM: candidate.floatM,
      })),
      focusSymbols,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "ticker_analysis",
        strict: true,
        schema: analysisSchema,
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OpenAI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(extractResponseText(data));
    return {
      ...parsed,
      score: clampScore(parsed.score),
      source: "openai",
      model,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...buildHeuristicAnalysis(ticker, "heuristic-fallback"),
      error: error.message,
    };
  }
}
