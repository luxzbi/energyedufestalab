import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  budgetCapacity,
  BUDGET_PRESETS_KRW,
  compareSubsidyRates,
  COMPARE_SUBSIDY_RATES,
  type SubsidyRow,
} from "@/lib/policy";
import type { LabSettings } from "@/lib/settings";
import { AXIS_LINE, AXIS_TICK, ChartCard, ChartTooltip, legendText } from "./ChartKit";
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

const RATE_COLORS: Record<number, string> = {
  30: "var(--rate-1)",
  50: "var(--rate-2)",
  70: "var(--rate-3)",
  90: "var(--rate-4)",
};

const FIXED_ROWS: { label: string; value: (r: SubsidyRow) => string; invariant?: boolean }[] = [
  { label: "총사업비", value: (r) => formatKrw(r.totalCostKrw), invariant: true },
  { label: "대전시 재정 부담", value: (r) => formatKrw(r.municipalCostKrw) },
  { label: "공장 소유주 부담", value: (r) => formatKrw(r.ownerCostKrw) },
  { label: "공장당 평균 소유주 부담", value: (r) => formatKrw(r.ownerCostPerFactoryKrw) },
  { label: "설치 면적(지붕 기준)", value: (r) => `${formatNumber(r.treatedRoofAreaM2)} m²`, invariant: true },
  { label: "예상 연간 발전량", value: (r) => formatKwh(r.solarGeneratedKwh), invariant: true },
  { label: "예상 냉방 전력 절감량", value: (r) => formatKwh(r.coolingSavedKwh), invariant: true },
  { label: "예상 탄소 감축량", value: (r) => formatTon(r.co2ReductionT), invariant: true },
];

/** 대전시 예산 선택. 예산 분석과 최적화가 같은 값을 씁니다. */
export function BudgetPicker({
  settings,
  onChange,
  errors,
}: {
  settings: LabSettings;
  onChange: (change: Partial<LabSettings>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="budget-choice" className="mb-1 block text-sm">
          대전시 예산
        </label>
        <select
          id="budget-choice"
          className={INPUT_CLASS}
          value={settings.budgetChoice}
          onChange={(event) => onChange({ budgetChoice: event.target.value })}
        >
          {BUDGET_PRESETS_KRW.map((budget) => (
            <option key={budget} value={String(budget)}>
              {formatKrw(budget)}
            </option>
          ))}
          <option value="custom">직접 입력</option>
        </select>
      </div>
      {settings.budgetChoice === "custom" && (
        <div>
          <label htmlFor="budget-custom" className="mb-1 block text-sm">
            직접 입력 (억 원)
          </label>
          <input
            id="budget-custom"
            className={`${INPUT_CLASS} w-32 text-right tabular-nums`}
            inputMode="decimal"
            autoComplete="off"
            value={settings.customBudgetEok}
            aria-invalid={Boolean(errors.customBudgetEok)}
            onChange={(event) => onChange({ customBudgetEok: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function PolicyPanel({
  inputs,
  scenario,
  settings,
  budgetKrw,
  errors,
  onSettingsChange,
}: {
  inputs: ModelInputs;
  scenario: ScenarioId;
  settings: LabSettings;
  /** 예산 입력이 잘못되면 null */
  budgetKrw: number | null;
  errors: Record<string, string>;
  onSettingsChange: (change: Partial<LabSettings>) => void;
}) {
  const fixed = useMemo(() => compareSubsidyRates(inputs, scenario), [inputs, scenario]);

  const chosenBudgets = useMemo(() => {
    const budgets = [...BUDGET_PRESETS_KRW];
    if (budgetKrw !== null && !budgets.includes(budgetKrw)) budgets.push(budgetKrw);
    return budgets.sort((a, b) => a - b);
  }, [budgetKrw]);

  const budgetChart = useMemo(
    () =>
      chosenBudgets.map((budget) => {
        const row: Record<string, number | string> = { name: formatKrw(budget) };
        for (const subsidyPct of COMPARE_SUBSIDY_RATES) {
          row[`r${subsidyPct}`] = budgetCapacity(
            { ...inputs, subsidyPct },
            scenario,
            budget,
          ).fundedFactories;
        }
        return row;
      }),
    [chosenBudgets, inputs, scenario],
  );

  const atBudget = useMemo(
    () =>
      budgetKrw === null
        ? []
        : COMPARE_SUBSIDY_RATES.map((subsidyPct) =>
            budgetCapacity({ ...inputs, subsidyPct }, scenario, budgetKrw),
          ),
    [budgetKrw, inputs, scenario],
  );

  const scenarioLabel = SCENARIO_LABELS[scenario];
  const fixedChart = fixed.map((row) => ({
    name: `${row.subsidyPct}%`,
    municipal: row.municipalCostKrw / 1e8,
    owner: row.ownerCostKrw / 1e8,
  }));

  return (
    <div className="space-y-4">
      <Note title="70%는 정책 제안값입니다.">
        실제 운영 중인 대전시 제도가 아닙니다. 현재 입력한 지원율은 {inputs.subsidyPct}%이며, 아래 두 분석은 서로
        다른 질문에 답합니다.
      </Note>

      <Section
        id="policy-fixed"
        title="분석 1. 사업 규모 고정: 누가 얼마를 내는가"
        kind="hypothetical"
        description={`공장 ${formatNumber(inputs.factoryCount)}곳 전체에 ${scenarioLabel}을 적용한다고 가정합니다. 지원율은 부담 주체만 바꿉니다.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <caption className="sr-only">지원율별 부담과 물리적 효과. 가정 기반 추정입니다.</caption>
            <thead>
              <tr className={TABLE_HEAD}>
                <th scope="col" className={TH}>항목</th>
                {fixed.map((row) => (
                  <th key={row.subsidyPct} scope="col" className={TH_NUM}>
                    지원율 {row.subsidyPct}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIXED_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {row.label}
                    {row.invariant && (
                      <span className="ml-1.5 text-xs text-ink-3">지원율과 무관</span>
                    )}
                  </th>
                  {fixed.map((rate) => (
                    <td key={rate.subsidyPct} className={TD_NUM}>
                      {row.value(rate)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Note title="지원율을 바꿔도 물리적 효과는 그대로입니다.">
            사업 규모가 고정이면 총사업비, 설치 면적, 발전량, 절감량, 감축량은 지원율과 무관합니다.
          </Note>
        </div>
        <div className="mt-3">
          <ChartCard
            title="A. 지원율별 대전시 재정 부담 비교"
            unit="억 원"
            conditions={`${scenarioLabel}, 공장 ${formatNumber(inputs.factoryCount)}곳 전체, 사업 규모 고정, 설치비만 포함`}
            source="사용자 입력 가정값. 지원율은 정책 제안값, 단가는 근거가 약한 임시값"
            summary={fixed
              .map((r) => `지원율 ${r.subsidyPct}% 대전시 ${formatKrw(r.municipalCostKrw)}`)
              .join(", ")}
          >
            <BarChart data={fixedChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
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
                    unit="억 원"
                    digits={2}
                    labelFormatter={(value) => `지원율 ${value}`}
                  />
                }
                cursor={{ fill: "var(--surface-sunken)" }}
              />
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
        </div>
      </Section>

      <Section
        id="policy-budget"
        title="분석 2. 대전시 예산 고정: 몇 곳을 지원할 수 있는가"
        kind="hypothetical"
        description="예산이 고정이면 지원율이 지원 가능한 공장 수를 바꾸고, 그 결과로 물리적 효과도 달라집니다. 모든 공장이 평균 공장과 같다고 단순화한 계산입니다."
      >
        <BudgetPicker settings={settings} onChange={onSettingsChange} errors={errors} />
        {budgetKrw === null ? (
          <div className="mt-3">
            <ErrorList errors={errors} />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <caption className="sr-only">
                예산 {formatKrw(budgetKrw)}에서 지원율별 지원 가능 공장 수. 가정 기반 추정입니다.
              </caption>
              <thead>
                <tr className={TABLE_HEAD}>
                  <th scope="col" className={TH}>지원율</th>
                  <th scope="col" className={TH_NUM}>지원 가능 공장</th>
                  <th scope="col" className={TH_NUM}>대전시 집행액</th>
                  <th scope="col" className={TH_NUM}>소유주 부담</th>
                  <th scope="col" className={TH_NUM}>발전량</th>
                  <th scope="col" className={TH_NUM}>감축량</th>
                </tr>
              </thead>
              <tbody>
                {atBudget.map((row) => (
                  <tr key={row.subsidyPct} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {row.subsidyPct}%
                    </th>
                    <td className={TD_NUM}>
                      {formatNumber(row.fundedFactories)}곳
                      {row.cappedByFactoryCount && (
                        <span className="ml-1 text-xs text-ink-3">전체</span>
                      )}
                    </td>
                    <td className={TD_NUM}>{formatKrw(row.municipalCostKrw)}</td>
                    <td className={TD_NUM}>{formatKrw(row.ownerCostKrw)}</td>
                    <td className={TD_NUM}>{formatKwh(row.solarGeneratedKwh)}</td>
                    <td className={TD_NUM}>{formatTon(row.co2ReductionT)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Note title="지원 가능 수는 참여 수가 아닙니다.">
            지원율을 낮추면 계산상 더 많은 공장을 지원할 수 있지만, 그만큼 소유주 부담이 커져 실제 참여가 줄 수
            있습니다. 이 모델에는 참여 의사가 들어 있지 않습니다. 2024년 산업단지공단 조사에서는 응답 기업의 60.5%가
            지원을 늘려도 태양광을 설치할 의향이 없다고 답했습니다.
          </Note>
        </div>
        <div className="mt-3">
          <ChartCard
            title="B. 예산별 설치 가능 공장 수"
            unit="곳"
            conditions={`${scenarioLabel}, 평균 공장 기준, 공장 ${formatNumber(inputs.factoryCount)}곳이 상한, 실제 참여 의사 미반영`}
            source="사용자 입력 가정값. 지원율은 정책 제안값, 단가는 근거가 약한 임시값"
            summary={budgetChart
              .map((row) => `${row.name}: 지원율 70%일 때 ${row.r70}곳`)
              .join(", ")}
          >
            <BarChart data={budgetChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} interval={0} />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                content={<ChartTooltip unit="곳" digits={0} />}
                cursor={{ fill: "var(--surface-sunken)" }}
              />
              <Legend formatter={legendText} iconType="square" iconSize={10} itemSorter={null} />
              {COMPARE_SUBSIDY_RATES.map((rate) => (
                <Bar
                  key={rate}
                  dataKey={`r${rate}`}
                  name={`지원율 ${rate}%`}
                  fill={RATE_COLORS[rate]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartCard>
        </div>
      </Section>
    </div>
  );
}
