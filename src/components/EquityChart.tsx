"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Snapshot } from "@/lib/strategy";
import { CFG } from "@/lib/strategy";

export default function EquityChart({ curve }: { curve: Snapshot[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const fittedRef = useRef(false);

  const data = useMemo(() => {
    const seen = new Set<number>();
    const out: { time: UTCTimestamp; value: number }[] = [];
    for (const s of [...curve].sort((a, b) => a.t - b.t)) {
      const sec = Math.floor(s.t / 1000);
      if (seen.has(sec)) continue;
      seen.add(sec);
      out.push({ time: sec as UTCTimestamp, value: s.equity });
    }
    return out;
  }, [curve]);

  const up = useMemo(() => {
    if (data.length < 2) return true;
    return data[data.length - 1].value >= data[0].value;
  }, [data]);

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
        vertLines: { visible: false },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      width: wrapRef.current.clientWidth,
      height: wrapRef.current.clientHeight,
    });

    const series = chart.addAreaSeries({
      lineColor: up ? "#35f2a6" : "#ff4d67",
      topColor: up ? "rgba(53,242,166,0.22)" : "rgba(255,77,103,0.22)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerRadius: 3,
    });

    series.createPriceLine({
      price: CFG.initialCapital,
      color: "rgba(255,255,255,0.25)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: "",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s || data.length === 0) return;
    s.applyOptions({
      lineColor: up ? "#35f2a6" : "#ff4d67",
      topColor: up ? "rgba(53,242,166,0.22)" : "rgba(255,77,103,0.22)",
    });
    s.setData(data);
    if (!fittedRef.current && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      fittedRef.current = true;
    }
  }, [data, up]);

  return <div ref={wrapRef} className="h-full w-full" />;
}
