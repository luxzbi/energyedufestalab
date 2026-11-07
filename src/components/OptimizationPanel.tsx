import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKrw, formatKwh, formatNumber, formatTon } from "@/lib/format";
import {
  SCENARIO_LABELS,
  type ModelInputs,
  type ScenarioId,
} from "@/lib/model";
import {
  compareSelectionMethods,
  evaluateFactories,
  generateVirtualFactories,
  SELECTION_LABELS,
  SELECTION_METHODS,
  type SelectionResult,
} from "@/lib/optimization";
import type { LabSettings, RunConfig } from "@/lib/settings";
import { AXIS_LINE, AXIS_TICK, ChartCard, ChartTooltip } from "./ChartKit";
import { BudgetPicker } from "./PolicyPanel";
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

const SOLUTION_LABELS: Record<SelectionResult["solutionType"], string> = {
  exact: "정확한 최적해",
  approximate: "근사해",
  heuristic: "규칙 기반 (최적 보장 없음)",
};

/** 좁은 화면에서도 축 글자가 겹치지 않도록 줄인 이름. 전체 이름은 위 표에 있습니다. */
const SHORT_METHOD_LABELS: Record<SelectionResult["method"], string> = {
  random: "무작위",
  largestRoof: "면적 순",
  bestEfficiency: "효율 순",
  optimal: "최적화",
};

const SETTING_FIELDS: { key: "datasetCount" | "datasetSeed" | "unsafeSharePct" | "randomSeed"; label: string }[] = [
  { key: "datasetCount", label: "가상 공장 수" },
  { key: "unsafeSharePct", label: "구조 부적합 비율 (%)" },
  { key: "datasetSeed", label: "데이터 시드" },
  { key: "randomSeed", label: "무작위 선정 시드" },
];

export function OptimizationPanel({
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
  const computed = useMemo(() => {
    if (!config) return null;
    const factories = generateVirtualFactories(inputs, config.dataset);
    const evaluated = evaluateFactories(factories, inputs, scenario);
    return {
      evaluated,
      result: compareSelectionMethods(evaluated, config.budgetKrw, config.randomSeed),
    };
  }, [inputs, scenario, config]);

  const controls = (
    <div className="flex flex-wrap items-end gap-3">
      <BudgetPicker settings={settings} onChange={onSettingsChange} errors={errors} />
      {SETTING_FIELDS.map((field) => (
        <div key={field.key}>
          <label htmlFor={`opt-${field.key}`} className="mb-1 block text-sm">
            {field.label}
          </label>
          <input
            id={`opt-${field.key}`}
            className={`${INPUT_CLASS} w-36 text-right tabular-nums`}
            inputMode="numeric"
            autoComplete="off"
            value={settings[field.key]}
            aria-invalid={Boolean(errors[field.key])}
            onChange={(event) => onSettingsChange({ [field.key]: event.target.value })}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <Section
        id="optimization"
        title="고정 예산 정책 최적화"
        kind="virtual"
        description={`입력값을 중심으로 난수로 만든 가상 공장 ${settings.datasetCount}곳에 ${SCENARIO_LABELS[scenario]}을 적용합니다. 대화동 실제 공장의 자료가 아닙니다.`}
      >
        {controls}
        {!computed || !config ? (
          <div className="mt-3">
            <ErrorList errors={errors} />
          </div>
        ) : (
          <Results
            computed={computed}
            config={config}
            scenario={scenario}
            subsidyPct={inputs.subsidyPct}
          />
        )}
      </Section>
    </div>
  );
}

function Results({
  computed,
  config,
  scenario,
  subsidyPct,
}: {
  subsidyPct: number;
  computed: {
    evaluated: ReturnType<typeof evaluateFactories>;
    result: ReturnType<typeof compareSelectionMethods>;
  };
  config: RunConfig;
  scenario: ScenarioId;
}) {
  const { evaluated, result } = computed;
  const optimal = result.results.optimal;
  const selected = new Set(optimal.selectedIds);
  const chartRows = SELECTION_METHODS.map((method) => ({
    method,
    name: SHORT_METHOD_LABELS[method],
    co2: result.results[method].co2ReductionT,
  }));
  const conditions = `예산 ${formatKrw(config.budgetKrw)}, 지원율 ${subsidyPct}%, 구조 적합 공장 ${result.eligibleCount}곳이 후보, 데이터 시드 ${config.dataset.seed}, 무작위 시드 ${config.randomSeed}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <Tile label="후보 공장 (구조 적합)" value={`${result.eligibleCount}곳`} />
        <Tile label="제외 (구조 부적합)" value={`${result.excludedUnsafeCount}곳`} />
        <Tile label="최적화 결과의 종류" value={SOLUTION_LABELS[optimal.solutionType]} />
      </div>

      {optimal.solutionType === "approximate" && (
        <p role="alert" className="rounded-md border border-caution p-3 text-sm text-caution">
          계산 한도에 걸려 최적 여부를 증명하지 못했습니다. 결과는 근사해이며, 최적값은{" "}
          {formatTon(optimal.upperBoundT ?? 0)} 이하입니다.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">선정 방식 비교. 가상 공장 데이터입니다.</caption>
          <thead>
            <tr className={TABLE_HEAD}>
              <th scope="col" className={TH}>선정 방식</th>
              <th scope="col" className={TH_NUM}>공장 수</th>
              <th scope="col" className={TH_NUM}>대전시 집행액</th>
              <th scope="col" className={TH_NUM}>남은 예산</th>
              <th scope="col" className={TH_NUM}>소유주 부담</th>
              <th scope="col" className={TH_NUM}>발전량</th>
              <th scope="col" className={TH_NUM}>감축량</th>
              <th scope="col" className={TH_NUM}>최적 대비</th>
            </tr>
          </thead>
          <tbody>
            {SELECTION_METHODS.map((method) => {
              const row = result.results[method];
              const share =
                optimal.co2ReductionT > 0
                  ? `${formatNumber((row.co2ReductionT / optimal.co2ReductionT) * 100, 1)}%`
                  : "-";
              return (
                <tr key={method} className="border-b border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {SELECTION_LABELS[method]}
                    <span className="block text-xs text-ink-3">
                      {SOLUTION_LABELS[row.solutionType]}
                    </span>
                  </th>
                  <td className={TD_NUM}>{row.factoryCount}곳</td>
                  <td className={TD_NUM}>{formatKrw(row.municipalCostKrw)}</td>
                  <td className={TD_NUM}>{formatKrw(row.unusedBudgetKrw)}</td>
                  <td className={TD_NUM}>{formatKrw(row.ownerCostKrw)}</td>
                  <td className={TD_NUM}>{formatKwh(row.solarGeneratedKwh)}</td>
                  <td className={TD_NUM}>{formatTon(row.co2ReductionT)}</td>
                  <td className={TD_NUM}>{share}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Note title="이 비교로 알 수 있는 것과 없는 것.">
        네 방식 모두 같은 예산과 같은 후보를 씁니다. 이 결과는 정해진 가상 데이터에서 계산 방법을 비교한 것일 뿐,
        실제 대화동 공장에서 같은 차이가 난다는 증거가 아닙니다. 무작위 선정은 시드 하나의 결과이므로 시드를 바꿔
        확인하세요. 감축량만 최대화하므로 형평성이나 공장의 참여 의사는 고려하지 않습니다.
      </Note>

      <ChartCard
        kind="virtual"
        title="C. 선정 방식별 예상 탄소 감축량"
        unit="tCO2eq/년"
        conditions={conditions}
        source={`난수로 만든 가상 공장 + 사용자 입력 가정값, ${SCENARIO_LABELS[scenario]}`}
        summary={chartRows.map((r) => `${r.name} ${formatNumber(r.co2, 1)} tCO2eq`).join(", ")}
      >
        <BarChart data={chartRows} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} interval={0} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => formatNumber(Number(v))}
          />
          <Tooltip
            content={<ChartTooltip unit="tCO2eq" kind="virtual" />}
            cursor={{ fill: "var(--line)" }}
          />
          <Bar dataKey="co2" name="예상 감축량" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
            {chartRows.map((row) => (
              <Cell
                key={row.method}
                fill={row.method === "optimal" ? "var(--series-cool)" : "var(--axis)"}
              />
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

      <details className="rounded-md border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">0-1 정수계획법 설명</summary>
        <div className="mt-2 space-y-2 leading-6 text-ink-2">
          <p className="rounded bg-sunken px-2.5 py-1.5 text-ink">
            최대화 Σ 감축량ᵢ · xᵢ, 조건 Σ 대전시 부담ᵢ · xᵢ ≤ 예산, xᵢ ∈ {"{0, 1}"}, 구조 부적합이면 xᵢ = 0
          </p>
          <p>
            각 공장을 고르거나(1) 고르지 않는(0) 문제입니다. 공장을 하나씩 고려하며 (쓴 예산, 감축량) 조합을 모으고,
            예산을 더 쓰면서 감축량이 같거나 적은 조합과, 남은 공장을 모두 담아도 현재 최선을 넘지 못하는 조합을
            버립니다. 버린 조합은 최적이 될 수 없으므로 끝까지 돌면 정확한 최적해입니다. 조합이 300만 개를 넘으면
            멈추고 근사해로 표시합니다.
          </p>
          <p>
            이 계산은 전수 조사와 일치하는지 단위 테스트로 확인했습니다(공장 14곳 이하의 작은 문제 기준). 대전시 부담은
            원 단위로 올림한 정수로 비교합니다.
          </p>
        </div>
      </details>

      <details className="rounded-md border-2 border-dotted border-ink-3 bg-sunken p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          가상 공장 데이터 {evaluated.length}곳 보기 (실제 공장 아님)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <caption className="sr-only">난수로 만든 가상 공장 데이터</caption>
            <thead>
              <tr className={TABLE_HEAD}>
                <th scope="col" className={TH}>가상 공장</th>
                <th scope="col" className={TH_NUM}>지붕 면적</th>
                <th scope="col" className={TH_NUM}>구조 안전</th>
                <th scope="col" className={TH_NUM}>설치 비용</th>
                <th scope="col" className={TH_NUM}>대전시 부담</th>
                <th scope="col" className={TH_NUM}>발전량</th>
                <th scope="col" className={TH_NUM}>냉방 절감</th>
                <th scope="col" className={TH_NUM}>감축량</th>
                <th scope="col" className={TH_NUM}>최적 선정</th>
              </tr>
            </thead>
            <tbody>
              {evaluated.map((f) => (
                <tr key={f.factory.id} className="border-b border-line">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">{f.factory.id}</th>
                  <td className={TD_NUM}>{formatNumber(f.factory.roofAreaM2)} m²</td>
                  <td className={TD_NUM}>{f.factory.structurallySafe ? "적합" : "부적합(제외)"}</td>
                  <td className={TD_NUM}>{formatKrw(f.totalCostKrw)}</td>
                  <td className={TD_NUM}>{formatKrw(f.municipalCostKrw)}</td>
                  <td className={TD_NUM}>{formatKwh(f.solarGeneratedKwh)}</td>
                  <td className={TD_NUM}>{formatKwh(f.coolingSavedKwh)}</td>
                  <td className={TD_NUM}>{formatTon(f.co2ReductionT)}</td>
                  <td className={TD_NUM}>{selected.has(f.factory.id) ? "선정" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
