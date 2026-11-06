import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";
import {
  SCENARIO_IDS,
  SCENARIO_LABELS,
  sweepCo2,
  type ModelInputs,
  type ScenarioId,
  type ScenarioResults,
} from "@/lib/model";
import { DataKindBadge, INPUT_CLASS } from "./ui";

/** 색은 시나리오를 따라갑니다. 어느 차트에서든 같은 시나리오는 같은 색입니다. */
const SCENARIO_COLORS: Record<ScenarioId, string> = {
  coolRoof: "var(--series-cool)",
  solarPv: "var(--series-solar)",
  combined: "var(--series-combined)",
};

const SHORT_LABELS: Record<ScenarioId, string> = {
  coolRoof: "쿨루프",
  solarPv: "태양광",
  combined: "결합",
};

const AXIS_TICK = { fill: "var(--ink-3)", fontSize: 12 };
const AXIS_LINE = { stroke: "var(--line-strong)" };

function chartAxes(unitFormatter: (value: number) => string) {
  return (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis
        dataKey="name"
        tick={AXIS_TICK}
        axisLine={AXIS_LINE}
        tickLine={false}
        interval={0}
      />
      <YAxis
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        width={56}
        tickFormatter={unitFormatter}
      />
    </>
  );
}

function legendText(value: string) {
  return <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{value}</span>;
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string | readonly (number | string)[];
  color?: string;
  fill?: string;
  payload?: { fill?: string };
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  digits = 1,
  labelFormatter,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  unit: string;
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
      <p className="mt-1.5 border-t border-line pt-1 text-ink-3">가정 계산 · 측정값 아님</p>
    </div>
  );
}

function ChartCard({
  title,
  unit,
  summary,
  controls,
  children,
}: {
  title: string;
  unit: string;
  summary: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 rounded-md border border-line p-3">
      <figcaption className="mb-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-sm font-semibold">{title}</span>
          <DataKindBadge kind="hypothetical" />
        </div>
        <p className="text-xs text-ink-3">단위: {unit}</p>
      </figcaption>
      {controls}
      {/* 차트를 볼 수 없는 사용자에게 같은 내용을 글로 전달합니다. 표는 위 결과 표입니다. */}
      <div role="img" aria-label={`${title}. ${summary}`}>
        <ResponsiveContainer width="100%" height={290}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function ScenarioCharts({ results }: { results: ScenarioResults }) {
  const rows = SCENARIO_IDS.map((id) => {
    const r = results[id];
    return {
      id,
      // 좁은 화면에서도 겹치지 않도록 축에는 짧은 이름을 씁니다.
      name: SHORT_LABELS[id],
      cooling: r.coolingSavedKwh / 1000,
      solar: r.solarGeneratedKwh / 1000,
      municipal: r.municipalCostKrw / 1e8,
      owner: r.ownerCostKrw / 1e8,
      co2: r.co2ReductionT,
    };
  });

  const describe = (pick: (row: (typeof rows)[number]) => number, unit: string) =>
    rows.map((row) => `${row.name} ${formatNumber(pick(row), 1)}${unit}`).join(", ");

  return (
    <>
      <ChartCard
        title="연간 전력 효과"
        unit="MWh/년"
        summary={describe((row) => row.cooling + row.solar, " MWh")}
      >
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {chartAxes((v) => formatNumber(v))}
          <Tooltip
            content={<ChartTooltip unit="MWh" />}
            cursor={{ fill: "var(--surface-sunken)" }}
          />
          <Legend formatter={legendText} iconType="square" iconSize={10} itemSorter={null} />
          <Bar
            dataKey="cooling"
            name="절감 냉방 전력"
            stackId="energy"
            fill="var(--series-cool)"
            stroke="var(--surface)"
            strokeWidth={2}
            maxBarSize={64}
            isAnimationActive={false}
          />
          <Bar
            dataKey="solar"
            name="태양광 발전량"
            stackId="energy"
            fill="var(--series-solar)"
            stroke="var(--surface)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="설치비 부담"
        unit="억 원"
        summary={describe((row) => row.municipal + row.owner, "억 원")}
      >
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {chartAxes((v) => formatNumber(v))}
          <Tooltip
            content={<ChartTooltip unit="억 원" digits={2} />}
            cursor={{ fill: "var(--surface-sunken)" }}
          />
          <Legend formatter={legendText} iconType="square" iconSize={10} itemSorter={null} />
          <Bar
            dataKey="municipal"
            name="지자체 부담"
            stackId="cost"
            fill="var(--series-municipal)"
            stroke="var(--surface)"
            strokeWidth={2}
            maxBarSize={64}
            isAnimationActive={false}
          />
          <Bar
            dataKey="owner"
            name="소유주 부담"
            stackId="cost"
            fill="var(--series-owner)"
            stroke="var(--surface)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="추정 CO2 감축량"
        unit="tCO2eq/년"
        summary={describe((row) => row.co2, " tCO2eq")}
      >
        <BarChart data={rows} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          {chartAxes((v) => formatNumber(v))}
          <Tooltip
            content={<ChartTooltip unit="tCO2eq" />}
            cursor={{ fill: "var(--surface-sunken)" }}
          />
          <Bar
            dataKey="co2"
            name="추정 CO2 감축량"
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            isAnimationActive={false}
          >
            {rows.map((row) => (
              <Cell key={row.id} fill={SCENARIO_COLORS[row.id]} />
            ))}
            <LabelList
              dataKey="co2"
              position="top"
              formatter={(value) => formatNumber(Number(value))}
              style={{ fill: "var(--ink-2)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ChartCard>
    </>
  );
}

const SWEEP_OPTIONS: {
  key: keyof ModelInputs;
  label: string;
  unit: string;
  from: number;
  to: number;
  digits: number;
  /** 눈금이 깔끔한 숫자에 떨어지도록 구간을 몇 등분할지 */
  divisions: number;
}[] = [
  { key: "coolingSavingPct", label: "가정 냉방 절감률", unit: "%", from: 0, to: 50, digits: 1, divisions: 5 },
  { key: "coolingBaselineKwhPerM2", label: "가정 냉방 전력 기준값", unit: "kWh/m²·년", from: 0, to: 100, digits: 0, divisions: 5 },
  { key: "usableSolarPct", label: "태양광 설치 가능 면적", unit: "%", from: 0, to: 100, digits: 0, divisions: 5 },
  { key: "solarYieldKwhPerKw", label: "연간 발전량", unit: "kWh/kW·년", from: 900, to: 1700, digits: 0, divisions: 4 },
  { key: "emissionFactorTPerMwh", label: "전력 배출계수", unit: "tCO2eq/MWh", from: 0.2, to: 0.7, digits: 3, divisions: 5 },
];

export function SensitivityChart({ inputs }: { inputs: ModelInputs }) {
  const selectId = useId();
  const [key, setKey] = useState<keyof ModelInputs>("coolingSavingPct");
  const option = SWEEP_OPTIONS.find((o) => o.key === key) ?? SWEEP_OPTIONS[0];
  const current = inputs[option.key];

  const rows = useMemo(() => {
    // 현재 값이 항상 차트 안에 보이도록 구간을 넓힙니다.
    const from = Math.min(option.from, current);
    const to = Math.max(option.to, current);
    return sweepCo2(inputs, option.key, from, to, 20);
  }, [inputs, option, current]);

  const start = rows[0].x;
  const end = rows[rows.length - 1].x;
  const ticks = Array.from(
    { length: option.divisions + 1 },
    (_, i) => start + ((end - start) * i) / option.divisions,
  );

  return (
    <ChartCard
      title="민감도: 입력값 하나를 바꾸면?"
      unit="tCO2eq/년"
      summary={`${option.label}을 바꿀 때 시나리오별 CO2 감축량의 변화. 현재 값은 ${current}${option.unit}입니다.`}
      controls={
        <div className="mb-2">
          <label htmlFor={selectId} className="sr-only">
            바꿔 볼 입력값
          </label>
          <select
            id={selectId}
            className={INPUT_CLASS}
            value={option.key}
            onChange={(event) => setKey(event.target.value as keyof ModelInputs)}
          >
            {SWEEP_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label} ({o.unit})
              </option>
            ))}
          </select>
        </div>
      }
    >
      <LineChart data={rows} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tick={AXIS_TICK}
          axisLine={AXIS_LINE}
          tickLine={false}
          tickFormatter={(v) => formatNumber(Number(v), option.digits)}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => formatNumber(Number(v))}
        />
        <Tooltip
          content={
            <ChartTooltip
              unit="tCO2eq"
              labelFormatter={(value) =>
                `${option.label} ${formatNumber(Number(value), option.digits)} ${option.unit}`
              }
            />
          }
          cursor={{ stroke: "var(--axis)" }}
          itemSorter={(item) => SCENARIO_IDS.indexOf(item.dataKey as ScenarioId)}
        />
        <Legend formatter={legendText} iconType="plainline" itemSorter={null} />
        <ReferenceLine
          x={current}
          stroke="var(--axis)"
          label={{ value: "현재", position: "top", fill: "var(--ink-2)", fontSize: 12 }}
        />
        {SCENARIO_IDS.map((id) => (
          <Line
            key={id}
            dataKey={id}
            name={SCENARIO_LABELS[id]}
            stroke={SCENARIO_COLORS[id]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartCard>
  );
}
