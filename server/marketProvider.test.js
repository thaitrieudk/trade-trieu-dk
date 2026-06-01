import assert from "node:assert/strict";
import test from "node:test";
import { mergePolygonSnapshot } from "./marketProvider.js";

test("mergePolygonSnapshot keeps scanner metrics when Polygon snapshot needs previous-bar fallback", () => {
  const ticker = mergePolygonSnapshot(
    "GNTA",
    {
      ticker: "GNTA",
      todaysChangePerc: 18.42,
      prevDay: {
        c: 5,
        v: 2_000_000,
      },
    },
    {
      c: 5.92,
      h: 6.1,
      l: 5.83,
      v: 8_000_000,
      vw: 5.97,
    },
    { name: "Genenta Science S.p.A." },
  );

  assert.equal(ticker.company, "Genenta Science S.p.A.");
  assert.equal(ticker.price, 5.92);
  assert.equal(ticker.gap, 18.4);
  assert.equal(ticker.relVol, 4);
  assert.equal(ticker.atr, 0.27);
  assert.equal(ticker.volumeM, 8);
  assert.ok(ticker.score > 13);
});

test("mergePolygonSnapshot compares fallback volume to recent average volume when available", () => {
  const ticker = mergePolygonSnapshot(
    "HKIT",
    {
      ticker: "HKIT",
      prevDay: {
        c: 2,
        v: 9_000_000,
      },
    },
    {
      c: 2.4,
      h: 2.61,
      l: 2.08,
      v: 9_000_000,
      vw: 2.33,
    },
    null,
    {
      averageVolume: 3_000_000,
      previousClose: 2,
    },
  );

  assert.equal(ticker.gap, 20);
  assert.equal(ticker.relVol, 3);
  assert.ok(ticker.score > 20);
});
