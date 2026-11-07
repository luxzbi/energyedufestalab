import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";
import {
  SCENARIO_LABELS,
  type ModelInputs,
  type NumericInputKey,
  type ScenarioId,
} from "@/lib/model";
import {
  METRIC_LABELS,
  runMultiVariable,
  runOneAtATime,
  SENSITIVITY_KEYS,
  type OneAtATimeRow,
  type SensitivityMetric,
} from "@/lib/sensitivity";
import type { LabSettings, RunConfig } from "@/lib/settings";
import { FIELD_SPECS } from "@/lib/fields";
import { AXIS_LINE, AXIS_TICK, ChartCard } from "./ChartKit";
import { SensitivitySweep } from "./Charts";
import {
  ErrorList,
  INPUT_CLASS,
  Note,
  Section,
  TABLE_HEAD,
  TD_NUM,
  TH,
  TH_NUM,
} from "./ui";

const labelOf = (key: NumericInputKey) =>
  FIELD_SPECS.find((field) => field.key === key)?.label ?? key;
const unitOf = (key: NumericInputKey) =>
  FIELD_SPECS.find((field) => field.key === key)?.unit ?? "";

export function SensitivityPanel({
  inputs,
  scenario,
  settings,
  config,
  errors,
  onSettingsChange,
}: {
  inputs: ModelInputs;
  scenario: ScenarioId;
  settings: LabSettings;
  config: RunConfig | null;
  errors: Record<string, string>;
  onSettingsChange: (change: Partial<LabSettings>) => void;
}) {
  const metric = settings.sensitivityMetric;
  const meta = METRIC_LABELS[metric];
  const format = (value: number) =>
    `${formatNumber(value / meta.scale, meta.scale === 1 ? 1 : 2)} ${meta.unit}`;

  const oneAtATime = useMemo(
    () => (config ? runOneAtATime(inputs, scenario, metric, config.ranges) : null),
    [inputs, scenario, metric, config],
  );
  const multi = useMemo(
    () =>
      config
        ? runMultiVariable(inputs, scenario, metric, config.ranges, settings.multiKeys)
        : null,
    [inputs, scenario, metric, config, settings.multiKeys],
  );

  const setRange = (key: NumericInputKey, side: "low" | "high", value: string) =>
    onSettingsChange({
      ranges: {
        ...settings.ranges,
        [key]: { ...settings.ranges[key], [side]: value },
      },
    });

  const toggleKey = (key: NumericInputKey) =>
    onSettingsChange({
      multiKeys: settings.multiKeys.includes(key)
        ? settings.multiKeys.filter((item) => item !== key)
        : SENSITIVITY_KEYS.filter(
            (item) => item === key || settings.multiKeys.includes(item),
          ),
    });

  const rowError = (key: NumericInputKey) =>
    errors[`range-${key}`] ?? oneAtATime?.find((row) => row.key === key)?.error ?? null;

  const ranked = oneAtATime?.filter((row) => !row.error) ?? [];
  const chartRows = ranked.map((row) => ({
    ...row,
    span: [row.minOutput / meta.scale, row.maxOutput / meta.scale] as [number, number],
  }));

  return (
    <div className="space-y-4">
      <Note title="범위는 통계적 신뢰구간이 아닙니다.">
        낮은 값과 높은 값은 사용자가 정한 가정 범위입니다. 이 범위에서 나온 결과 폭은 실제 값이 그 안에 있을 확률을
        뜻하지 않습니다. 순위도 정한 범위에 따라 달라집니다.
      </Note>

      <Section
        id="sensitivity-ranges"
        title="기준값, 낮은 값, 높은 값"
        kind="hypothetical"
        description={`기준값은 왼쪽 입력값입니다. ${SCENARIO_LABELS[scenario]} 기준으로 계산합니다.`}
        actions={
          <div>
            <label htmlFor="sensitivity-metric" className="mb-1 block text-sm">
              비교할 결과
            </label>
            <select
              id="sensitivity-metric"
              className={INPUT_CLASS}
              value={metric}
              onChange={(event) =>
                onSettingsChange({ sensitivityMetric: event.target.value as SensitivityMetric })
              }
            >
              {(Object.keys(METRIC_LABELS) as SensitivityMetric[]).map((key) => (
                <option key={key} value={key}>
                  {METRIC_LABELS[key].label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <caption className="sr-only">민감도 분석의 변수 범위</caption>
            <thead>
              <tr className={TABLE_HEAD}>
                <th scope="col" className={TH}>변수</th>
                <th scope="col" className={TH_NUM}>낮은 값</th>
                <th scope="col" className={TH_NUM}>기준값</th>
                <th scope="col" className={TH_NUM}>높은 값</th>
              </tr>
            </thead>
            <tbody>
              {SENSITIVITY_KEYS.map((key) => {
                const error = rowError(key);
                const label = labelOf(key);
                return (
                  <tr key={key} className="border-b border-line align-top">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {label}
                      <span className="ml-1.5 text-xs text-ink-3">{unitOf(key)}</span>
                      {error && (
                        <span className="mt-0.5 block text-xs text-danger">오류: {error}</span>
                      )}
                    </th>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`${label} 낮은 값`}
                        className={`${INPUT_CLASS} text-right tabular-nums`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={Boolean(error)}
                        value={settings.ranges[key]?.low ?? ""}
                        onChange={(event) => setRange(key, "low", event.target.value)}
                      />
                    </td>
                    <td className={TD_NUM}>{formatNumber(inputs[key], 4)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        aria-label={`${label} 높은 값`}
                        className={`${INPUT_CLASS} text-right tabular-nums`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={Boolean(error)}
                        value={settings.ranges[key]?.high ?? ""}
                        onChange={(event) => setRange(key, "high", event.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {!oneAtATime || !multi ? (
        <ErrorList errors={errors} />
      ) : (
        <>
          <Section
            id="sensitivity-one"
            title="분석 1. 한 번에 하나의 변수만 변경"
            kind="hypothetical"
            description={`다른 변수는 기준값으로 두고, ${meta.label}이 가장 크게 움직이는 변수부터 순위를 매깁니다.`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <caption className="sr-only">변수별 민감도 순위</caption>
                <thead>
                  <tr className={TABLE_HEAD}>
                    <th scope="col" className={TH}>순위</th>
                    <th scope="col" className={TH}>변수</th>
                    <th scope="col" className={TH_NUM}>낮은 값일 때</th>
                    <th scope="col" className={TH_NUM}>높은 값일 때</th>
                    <th scope="col" className={TH_NUM}>변동 폭</th>
                    <th scope="col" className={TH_NUM}>기준 대비</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((row: OneAtATimeRow) => (
                    <tr key={row.key} className="border-b border-line">
                      <td className="py-2 pr-3 tabular-nums">{row.rank}</td>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">{row.label}</th>
                      <td className={TD_NUM}>{format(row.outputAtLow)}</td>
                      <td className={TD_NUM}>{format(row.outputAtHigh)}</td>
                      <td className={TD_NUM}>{row.swing === 0 ? "영향 없음" : format(row.swing)}</td>
                      <td className={TD_NUM}>
                        {row.swingPct === null ? "-" : `${formatNumber(row.swingPct, 1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-2">
              기준 결과: {format(ranked[0]?.outputAtBase ?? 0)}. 범위에 오류가 있는 변수는 순위에서 뺐습니다.
            </p>
            <div className="mt-3 grid gap-3 2xl:grid-cols-2">
              <ChartCard
                title={`E-1. 변수별 결과 범위: ${meta.label}`}
                unit={meta.unit}
                conditions={`${SCENARIO_LABELS[scenario]}, 한 번에 변수 하나만 낮은 값~높은 값으로 변경. 신뢰구간 아님`}
                source="사용자 입력 가정값과 사용자가 정한 범위"
                summary={ranked
                  .slice(0, 3)
                  .map((row) => `${row.rank}위 ${row.label}`)
                  .join(", ")}
                height={Math.max(240, chartRows.length * 32 + 40)}
              >
                <BarChart
                  layout="vertical"
                  data={chartRows}
                  margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--line)" />
                  <XAxis
                    type="number"
                    domain={[
                      (min: number) => Math.min(min, 0),
                      "auto",
                    ]}
                    tick={AXIS_TICK}
                    axisLine={AXIS_LINE}
                    tickLine={false}
                    tickFormatter={(v) => formatNumber(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ ...AXIS_TICK, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={118}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-sunken)" }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload as OneAtATimeRow | undefined;
                      if (!active || !row) return null;
                      return (
                        <div className="rounded-md border border-line-strong bg-surface p-2.5 text-xs shadow-sm">
                          <p className="mb-1 font-semibold">{row.rank}위 {row.label}</p>
                          <p>낮은 값 {formatNumber(row.low, 4)}: {format(row.outputAtLow)}</p>
                          <p>높은 값 {formatNumber(row.high, 4)}: {format(row.outputAtHigh)}</p>
                          <p className="mt-1.5 border-t border-line pt-1 text-ink-3">
                            가정 범위 · 신뢰구간 아님
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    x={(ranked[0]?.outputAtBase ?? 0) / meta.scale}
                    stroke="var(--axis)"
                    label={{ value: "기준", position: "top", fill: "var(--ink-2)", fontSize: 12 }}
                  />
                  <Bar
                    dataKey="span"
                    name="결과 범위"
                    fill="var(--series-cool)"
                    radius={[4, 4, 4, 4]}
                    maxBarSize={18}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartCard>
              <SensitivitySweep inputs={inputs} />
            </div>
          </Section>

          <Section
            id="sensitivity-multi"
            title="분석 2. 여러 변수를 동시에 변경"
            kind="hypothetical"
            description="고른 변수의 낮은 값과 높은 값 조합을 모두 계산합니다. 단일 변수 분석과 달리 효과가 함께 겹치므로 범위가 더 넓습니다."
          >
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">동시에 바꿀 변수</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                {SENSITIVITY_KEYS.map((key) => (
                  <label key={key} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={settings.multiKeys.includes(key)}
                      onChange={() => toggleKey(key)}
                    />
                    {labelOf(key)}
                  </label>
                ))}
              </div>
            </fieldset>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <Stat label="조합에서 나온 최솟값" value={format(multi.minOutput)} />
              <Stat label="기준 결과" value={format(multi.outputAtBase)} />
              <Stat label="조합에서 나온 최댓값" value={format(multi.maxOutput)} />
            </dl>
            <p className="mt-2 text-xs leading-5 text-ink-2">
              {multi.combinations}개 조합을 계산했습니다. 모든 변수가 동시에 양 끝값을 가질 가능성을 뜻하지 않으며,
              이 폭은 신뢰구간이 아닙니다.
            </p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <Settings title="최솟값이 나온 조합" settings={multi.minSettings} />
              <Settings title="최댓값이 나온 조합" settings={multi.maxSettings} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Settings({
  title,
  settings,
}: {
  title: string;
  settings: Partial<Record<NumericInputKey, number>>;
}) {
  const entries = Object.entries(settings) as [NumericInputKey, number][];
  return (
    <div className="rounded-md border border-line p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-ink-2">고른 변수가 없어 기준값과 같습니다.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
          {entries.map(([key, value]) => (
            <li key={key} className="flex justify-between gap-3">
              <span>{labelOf(key)}</span>
              <span className="tabular-nums">
                {formatNumber(value, 4)} {unitOf(key)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
