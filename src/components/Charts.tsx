import { useId, useMemo, useState } from "react";
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
  type NumericInputKey,
  type ScenarioId,
  type ScenarioResults,
} from "@/lib/model";
import { AXIS_LINE, AXIS_TICK, ChartCard, ChartTooltip, legendText } from "./ChartKit";
import { INPUT_CLASS } from "./ui";

/** 색은 설치 유형을 따라갑니다. 어느 차트에서든 같은 유형은 같은 색입니다. */
export const SCENARIO_COLORS: Record<ScenarioId, string> = {
  coolRoof: "var(--series-cool)",
  solarPv: "var(--series-solar)",
  combinedSeparate: "var(--series-combined)",
  combinedFullCoat: "var(--series-fullcoat)",
};

/** 좁은 화면에서도 겹치지 않도록 축에는 짧은 이름을 씁니다. */
export const SHORT_LABELS: Record<ScenarioId, string> = {
  coolRoof: "C-1 쿨루프",
  solarPv: "C-2 태양광",
  combinedSeparate: "A 분리",
  combinedFullCoat: "B 전체",
};

const INPUT_SOURCE = "사용자 입력 가정값 (‘출처와 가정’ 탭 참고)";

function barAxes(format: (value: number) => string) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke="var(--line)" />,
    <XAxis
      key="x"
      dataKey="name"
      tick={AXIS_TICK}
      axisLine={AXIS_LINE}
      tickLine={false}
      interval={0}
    />,
    <YAxis
      key="y"
      tick={AXIS_TICK}
      axisLine={false}
      tickLine={false}
      width={56}
      tickFormatter={format}
    />,
  ];
}

const whole = (value: number) => formatNumber(value);
const CURSOR = { fill: "var(--surface-sunken)" };

export function ScenarioCharts({
  inputs,
  results,
}: {
  inputs: ModelInputs;
  results: ScenarioResults;
}) {
  const rows = SCENARIO_IDS.map((id) => {
    const r = results[id];
    return {
      id,
      name: SHORT_LABELS[id],
      cooling: r.coolingSavedKwh / 1000,
      selfConsumed: r.selfConsumedKwh / 1000,
      exported: r.exportedKwh / 1000,
      solar: r.solarGeneratedKwh / 1000,
      municipal: r.municipalCostKrw / 1e8,
      owner: r.ownerCostKrw / 1e8,
      co2: r.co2ReductionT,
    };
  });

  const describe = (pick: (row: (typeof rows)[number]) => number, unit: string) =>
    rows.map((row) => `${row.name} ${formatNumber(pick(row), 1)}${unit}`).join(", ");
  const scale = `공장 ${formatNumber(inputs.factoryCount)}곳, 평균 지붕 ${formatNumber(inputs.avgRoofAreaM2)} m²`;

  return (
    <>
      <ChartCard
        title="D. 설치 유형별 추정 온실가스 감축량"
        unit="tCO2eq/년"
        conditions={`${scale}, 평균 배출계수 ${inputs.emissionFactorTPerMwh} tCO2eq/MWh, 역송 인정 ${inputs.exportCreditPct}%`}
        source={`${INPUT_SOURCE}. 배출계수는 검증 전 참고값`}
        summary={describe((row) => row.co2, " tCO2eq")}
      >
        <BarChart data={rows} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          {barAxes(whole)}
          <Tooltip content={<ChartTooltip unit="tCO2eq" />} cursor={CURSOR} />
          <Bar
            dataKey="co2"
            name="추정 감축량"
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

      <ChartCard
        title="설치비 부담 (유형별)"
        unit="억 원"
        conditions={`${scale}, 대전시 지원율 ${inputs.subsidyPct}% (정책 제안값), 설치비만 포함`}
        source={`${INPUT_SOURCE}. 단가는 근거가 약한 임시값`}
        summary={describe((row) => row.municipal + row.owner, "억 원")}
      >
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {barAxes(whole)}
          <Tooltip content={<ChartTooltip unit="억 원" digits={2} />} cursor={CURSOR} />
          <Legend formatter={legendText} iconType="square" iconSize={10} itemSorter={null} />
          <Bar
            dataKey="municipal"
            name="대전시 부담"
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
        title="F-1. 연간 태양광 발전량 (자가소비·역송)"
        unit="MWh/년"
        conditions={`연간 발전량 ${formatNumber(inputs.solarYieldKwhPerKw)} kWh/kW, 자가소비 ${inputs.selfConsumptionPct}%. 오른쪽 냉방 그래프와 축 범위가 다릅니다.`}
        source={`${INPUT_SOURCE}. 자가소비 비율은 임의 가정`}
        summary={describe((row) => row.solar, " MWh")}
      >
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {barAxes(whole)}
          <Tooltip content={<ChartTooltip unit="MWh" />} cursor={CURSOR} />
          <Legend formatter={legendText} iconType="square" iconSize={10} itemSorter={null} />
          <Bar
            dataKey="selfConsumed"
            name="자가소비"
            stackId="solar"
            fill="var(--series-self)"
            stroke="var(--surface)"
            strokeWidth={2}
            maxBarSize={64}
            isAnimationActive={false}
          />
          <Bar
            dataKey="exported"
            name="전력망 역송"
            stackId="solar"
            fill="var(--series-export)"
            stroke="var(--surface)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="F-2. 연간 냉방 전력 절감량"
        unit="MWh/년"
        conditions={`냉방 기준값 ${inputs.coolingBaselineKwhPerM2} kWh/m²·년, 절감률 ${inputs.coolingSavingPct}%. 왼쪽 발전량 그래프와 축 범위가 다릅니다.`}
        source="임의 가정값. 실측으로 입증된 절감량이 아닙니다."
        summary={describe((row) => row.cooling, " MWh")}
      >
        <BarChart data={rows} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          {barAxes(whole)}
          <Tooltip content={<ChartTooltip unit="MWh" />} cursor={CURSOR} />
          <Bar
            dataKey="cooling"
            name="냉방 전력 절감량"
            fill="var(--series-cool)"
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="cooling"
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
  key: NumericInputKey;
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
  { key: "factoryCount", label: "공장 수", unit: "개", from: 20, to: 220, digits: 0, divisions: 5 },
  { key: "avgRoofAreaM2", label: "평균 지붕 면적", unit: "m²", from: 500, to: 4500, digits: 0, divisions: 4 },
  { key: "usableSolarPct", label: "태양광 설치 가능 면적", unit: "%", from: 0, to: 100, digits: 0, divisions: 5 },
  { key: "solarYieldKwhPerKw", label: "연간 태양광 발전량", unit: "kWh/kW·년", from: 900, to: 1700, digits: 0, divisions: 4 },
  { key: "exportCreditPct", label: "역송분 감축 인정 비율", unit: "%", from: 0, to: 100, digits: 0, divisions: 5 },
  { key: "emissionFactorTPerMwh", label: "평균 전력 배출계수", unit: "tCO2eq/MWh", from: 0.2, to: 0.7, digits: 3, divisions: 5 },
];

/** 입력값 하나를 넓은 구간에서 바꿔 보는 곡선. 낮은 값·높은 값 표와 함께 봅니다. */
export function SensitivitySweep({ inputs }: { inputs: ModelInputs }) {
  const selectId = useId();
  const [key, setKey] = useState<NumericInputKey>("coolingSavingPct");
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
      title="E-2. 입력값 하나를 넓게 바꿔 보기"
      unit="tCO2eq/년"
      conditions={`${option.label} 외 나머지는 현재 입력값으로 고정. A와 B는 패널 하부 효과를 미산정해 감축량이 같으므로 선이 겹칩니다. 곡선은 계산값이며 신뢰구간이 아닙니다.`}
      source={INPUT_SOURCE}
      summary={`${option.label}을 바꿀 때 설치 유형별 감축량의 변화. 현재 값은 ${current}${option.unit}입니다.`}
      controls={
        <div className="mb-2">
          <label htmlFor={selectId} className="sr-only">
            바꿔 볼 입력값
          </label>
          <select
            id={selectId}
            className={INPUT_CLASS}
            value={option.key}
            onChange={(event) => setKey(event.target.value as NumericInputKey)}
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
