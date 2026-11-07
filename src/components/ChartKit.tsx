import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { formatNumber } from "@/lib/format";
import { DataKindBadge, type DataKind } from "./ui";

export const AXIS_TICK = { fill: "var(--ink-3)", fontSize: 12 };
export const AXIS_LINE = { stroke: "var(--line-strong)" };

export function legendText(value: string) {
  return <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{value}</span>;
}

const KIND_NOTE: Record<DataKind, string> = {
  hypothetical: "가정 기반 추정 · 측정값 아님",
  virtual: "가상 공장 데이터 · 실제 공장 아님",
  measured: "사람 측정 값",
};

interface TooltipEntry {
  name?: string | number;
  value?: number | string | readonly (number | string)[];
  color?: string;
  fill?: string;
  payload?: { fill?: string };
}

export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  kind = "hypothetical",
  digits = 1,
  labelFormatter,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  unit: string;
  kind?: DataKind;
  digits?: number;
  labelFormatter?: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-surface p-2.5 text-xs shadow-sm">
      <p className="mb-1 font-semibold">
        {label !== undefined && labelFormatter ? labelFormatter(label) : label}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.name)} className="flex items-center gap-1.5 text-ink-2">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: entry.payload?.fill ?? entry.color ?? entry.fill }}
            />
            <span>{entry.name}</span>
            <span className="ml-auto pl-3 text-ink tabular-nums">
              {formatNumber(Number(entry.value), digits)} {unit}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-line pt-1 text-ink-3">{KIND_NOTE[kind]}</p>
    </div>
  );
}

/** 데이터 종류에 따라 테두리와 배경이 달라, 스크린샷만 봐도 구별할 수 있습니다. */
const FIGURE_STYLE: Record<DataKind, string> = {
  hypothetical: "border border-dashed border-line-strong",
  virtual: "border-2 border-dotted border-ink-3 bg-sunken",
  measured: "border-2 border-solid border-ink",
};

export function ChartCard({
  title,
  unit,
  conditions,
  source,
  summary,
  kind = "hypothetical",
  controls,
  height = 290,
  children,
}: {
  title: string;
  unit: string;
  /** 어떤 조건으로 계산했는지 */
  conditions: string;
  /** 어떤 자료를 썼는지 */
  source: string;
  summary: string;
  kind?: DataKind;
  controls?: ReactNode;
  height?: number;
  children: ReactElement;
}) {
  return (
    <figure className={`min-w-0 rounded-md p-3 ${FIGURE_STYLE[kind]}`}>
      <div className="mb-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-sm font-semibold">{title}</span>
          <DataKindBadge kind={kind} />
        </div>
        <p className="text-xs text-ink-3">단위: {unit}</p>
      </div>
      {controls}
      {/* 차트를 볼 수 없는 사용자에게 같은 내용을 글로 전달합니다. 값은 각 구역의 표에도 있습니다. */}
      <div role="img" aria-label={`${title}. ${summary}`}>
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs leading-5 text-ink-2">
        <p>
          <span className="font-medium">계산 조건</span> {conditions}
        </p>
        <p>
          <span className="font-medium">자료</span> {source}
        </p>
      </figcaption>
    </figure>
  );
}
