"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/strategy";
import type { PositionView, TradeView } from "@/lib/engine";

type Props = {
  candles: Candle[];
  trades: TradeView[];
  position: PositionView | null;
};

const BULL = "#35f2a6";
const BEAR = "#ff4d67";

export default function CandleChart({ candles, trades, position }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fittedRef = useRef(false);
  const linesRef = useRef<IPriceLine[]>([]);

  const data = useMemo(() => {
    const seen = new Set<number>();
    const out: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = [];
    const sorted = [...candles].sort((a, b) => a.t - b.t);
    for (const c of sorted) {
      const sec = Math.floor(c.t / 1000);
      if (seen.has(sec)) continue;
      seen.add(sec);
      out.push({ time: sec as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c });
    }
    return out;
  }, [candles]);

  /* create once */
  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#525b66",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.045)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 9,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(139,124,247,0.35)", labelBackgroundColor: "#1b1e2a" },
        horzLine: { color: "rgba(139,124,247,0.35)", labelBackgroundColor: "#1b1e2a" },
      },
      width: wrapRef.current.clientWidth,
      height: wrapRef.current.clientHeight,
    });

    const series = chart.addCandlestickSeries({
      upColor: BULL,
      downColor: BEAR,
      borderVisible: false,
      wickUpColor: "rgba(53,242,166,0.7)",
      wickDownColor: "rgba(255,77,103,0.7)",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
    });
    ro.observe(wrapRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  /* push data */
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || data.length === 0) return;
    s.setData(data);
    if (!fittedRef.current && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      fittedRef.current = true;
    }
  }, [data]);

  /* markers */
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || data.length === 0) return;
    const validTimes = new Set(data.map((d) => d.time as number));
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const t of trades) {
      const entrySec = Math.floor(t.entryTime / 1000) as UTCTimestamp;
      const exitSec = Math.floor(t.exitTime / 1000) as UTCTimestamp;
      if (validTimes.has(entrySec as number)) {
        markers.push({
          time: entrySec,
          position: t.side === "LONG" ? "belowBar" : "aboveBar",
          color: t.side === "LONG" ? BULL : BEAR,
          shape: t.side === "LONG" ? "arrowUp" : "arrowDown",
          text: t.regime === "CONTINUATION" ? "C" : "",
          size: 1,
        });
      }
      if (validTimes.has(exitSec as number)) {
        markers.push({
          time: exitSec,
          position: t.side === "LONG" ? "aboveBar" : "belowBar",
          color: t.pnl >= 0 ? "rgba(53,242,166,0.85)" : "rgba(255,77,103,0.85)",
          shape: "circle",
          text: t.reason === "REVERSE" ? "REV" : t.reason,
          size: 0.5,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    s.setMarkers(markers);
  }, [trades, data]);

  /* position price lines */
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    linesRef.current.forEach((l) => s.removePriceLine(l));
    linesRef.current = [];
    if (position) {
      const mk = (price: number, color: string, title: string) =>
        s.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        });
      linesRef.current.push(mk(position.entryPrice, "rgba(232,235,238,0.6)", "ENTRY"));
      linesRef.current.push(mk(position.targetPrice, BULL, "TP"));
      linesRef.current.push(mk(position.stopPrice, BEAR, "SL"));
    }
  }, [position]);

  return <div ref={wrapRef} className="h-full w-full" />;
}
