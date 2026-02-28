import { useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

type DataPoint = {
  date: string;
  actual: number | null;
  predicted: number | null;
};

type ZoomableAreaChartProps = {
  data: DataPoint[];
  actualColor: string;
  actualFill: string;
  predictedFill: string;
  limitValue?: number | null;
  limitLabel?: string;
  actualLabel: string;
  predictedLabel: string;
  height?: number;
  granularity: "daily" | "weekly" | "monthly";
  totalDataLength: number;
  resetLabel: string;
  zoomHintLabel: string;
};

export function ZoomableAreaChart({
  data,
  actualColor,
  actualFill,
  predictedFill,
  limitValue,
  limitLabel,
  actualLabel,
  predictedLabel,
  height = 280,
  granularity,
  totalDataLength,
  resetLabel,
  zoomHintLabel,
}: ZoomableAreaChartProps) {
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  const zoomedData = useMemo(() => {
    if (!zoomLeft || !zoomRight) return data;
    const leftIdx = data.findIndex((d) => d.date === zoomLeft);
    const rightIdx = data.findIndex((d) => d.date === zoomRight);
    if (leftIdx === -1 || rightIdx === -1) return data;
    const start = Math.min(leftIdx, rightIdx);
    const end = Math.max(leftIdx, rightIdx);
    return data.slice(start, end + 1);
  }, [data, zoomLeft, zoomRight]);

  const isZoomed = zoomLeft !== null && zoomRight !== null;

  const handleMouseDown = useCallback((e: any) => {
    if (e && e.activeLabel) {
      setIsDragging(true);
      setDragStart(e.activeLabel);
      setDragEnd(null);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: any) => {
      if (isDragging && e && e.activeLabel) {
        setDragEnd(e.activeLabel);
      }
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart && dragEnd && dragStart !== dragEnd) {
      const startIdx = data.findIndex((d) => d.date === dragStart);
      const endIdx = data.findIndex((d) => d.date === dragEnd);
      if (startIdx !== -1 && endIdx !== -1) {
        const left = Math.min(startIdx, endIdx);
        const right = Math.max(startIdx, endIdx);
        if (right - left >= 1) {
          setZoomLeft(data[left].date);
          setZoomRight(data[right].date);
        }
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, data]);

  const handleReset = useCallback(() => {
    setZoomLeft(null);
    setZoomRight(null);
  }, []);

  const xAxisInterval =
    granularity !== "daily"
      ? 0
      : Math.max(0, Math.floor(zoomedData.length / 10));
  const xAxisAngle = granularity !== "daily" ? -25 : 0;
  const xAxisTextAnchor = granularity !== "daily" ? "end" : "middle";
  const xAxisHeight = granularity !== "daily" ? 50 : 30;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <ZoomIn className="h-3 w-3" />
          {zoomHintLabel}
        </span>
        {isZoomed && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-6 px-2 text-xs gap-1"
          >
            <ZoomOut className="h-3 w-3" />
            {resetLabel}
          </Button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={zoomedData}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDragging) {
              handleMouseUp();
            }
          }}
          style={{ cursor: isDragging ? "col-resize" : "crosshair" }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            className="text-xs"
            interval={xAxisInterval}
            angle={xAxisAngle}
            textAnchor={xAxisTextAnchor}
            height={xAxisHeight}
          />
          <YAxis className="text-xs" />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              border: "none",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              padding: "12px 16px",
            }}
            itemStyle={{ color: "#fff", fontSize: "14px", padding: "4px 0" }}
            labelStyle={{
              color: "#fff",
              fontWeight: "bold",
              fontSize: "14px",
              marginBottom: "8px",
            }}
          />
          {limitValue && limitLabel && (
            <ReferenceLine
              y={limitValue}
              stroke="oklch(0.65 0.25 25)"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: limitLabel,
                position: "insideTopRight",
                fill: "oklch(0.65 0.25 25)",
                fontSize: 12,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="actual"
            name={actualLabel}
            stroke={actualColor}
            fill={actualFill}
            strokeWidth={2}
            dot={{ fill: actualColor, strokeWidth: 0, r: 2 }}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="predicted"
            name={predictedLabel}
            stroke={actualColor}
            fill={predictedFill}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ fill: actualColor, strokeWidth: 0, r: 2 }}
            connectNulls={false}
          />
          {isDragging && dragStart && dragEnd && (
            <ReferenceArea
              x1={dragStart}
              x2={dragEnd}
              strokeOpacity={0.3}
              fill="oklch(0.55 0.22 250 / 0.2)"
              fillOpacity={0.3}
            />
          )}
          <Legend />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
