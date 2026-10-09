/*
 * TradingView Chart Component
 * ===========================
 * Gráficos profesionales de TradingView
 */

import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';

export interface ChartProps {
  data: Array<{ time: string; open: number; high: number; low: number; close: number; volume?: number }>;
  width?: number;
  height?: number;
  theme?: 'light' | 'dark';
  autoResize?: boolean;
}

export const TradingChart: React.FC<ChartProps> = ({
  data,
  width = 800,
  height = 400,
  theme = 'dark',
  autoResize = true,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width,
      height,
      layout: {
        background: { type: 'solid', color: theme === 'dark' ? '#1a1a1a' : '#ffffff' },
        textColor: theme === 'dark' ? '#d1d4dc' : '#333333',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#2b2b43' : '#f0f3fa' },
        horzLines: { color: theme === 'dark' ? '#2b2b43' : '#f0f3fa' },
      },
      crosshair: {
        mode: 0,
        vertLine: { width: 1, color: '#758696', style: 0, labelBackground: '#758696' },
        horzLine: { width: 1, color: '#758696', style: 0, labelBackground: '#758696' },
      },
      timeScale: {
        borderColor: theme === 'dark' ? '#2b2b43' : '#e1e4e8',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: theme === 'dark' ? '#2b2b43' : '#e1e4e8',
      },
    });

    // Candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    chart.priceScale().applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.2 },
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Auto resize
    if (autoResize) {
      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      };

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    }

    return () => {
      chart.remove();
    };
  }, [width, height, theme, autoResize]);

  // Update data
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !data.length) return;

    const chartData: CandlestickData[] = data.map(d => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candlestickSeriesRef.current.setData(chartData);

    // Volume
    if (volumeSeriesRef.current) {
      const volumeData: HistogramData[] = data.map(d => ({
        time: d.time as any,
        value: d.volume || 0,
        color: d.close >= d.open ? '#26a69a40' : '#ef535040',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    // Fit content
    chartRef.current.timeScale().fitContent();
  }, [data]);

  return (
    <div
      ref={chartContainerRef}
      style={{
        width: '100%',
        height: height,
        position: 'relative',
      }}
    />
  );
};

export default TradingChart;