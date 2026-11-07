/**
 * 민감도 분석. 범위는 사용자가 정한 가정이며 통계적 신뢰구간이 아닙니다.
 * - 단일 변수: 한 번에 하나만 낮은 값·높은 값으로 바꿉니다.
 * - 동시 변수: 고른 변수를 함께 바꾼 모든 조합(2^k)에서 최솟값과 최댓값을 찾습니다.
 */
import { FIELD_SPECS } from "./fields";
import {
  calculateScenario,
  type ModelInputs,
  type NumericInputKey,
  type ScenarioId,
  type ScenarioResult,
} from "./model";

export const SENSITIVITY_KEYS: NumericInputKey[] = [
  "factoryCount",
  "avgRoofAreaM2",
  "usableSolarPct",
  "solarYieldKwhPerKw",
  "coolingSavingPct",
  "coolRoofCostKrwPerM2",
  "pvCostKrwPerKw",
  "subsidyPct",
  "emissionFactorTPerMwh",
];

export type SensitivityRanges = Record<
  (typeof SENSITIVITY_KEYS)[number],
  { low: number; high: number }
>;

/** 기본 범위도 임의 가정입니다. 공장 수·면적은 ±50%, 나머지는 출처에 나온 값의 폭을 참고했습니다. */
export const DEFAULT_RANGES: Partial<SensitivityRanges> = {
  factoryCount: { low: 50, high: 150 },
  avgRoofAreaM2: { low: 1000, high: 3000 },
  usableSolarPct: { low: 40, high: 80 },
  solarYieldKwhPerKw: { low: 1200, high: 1450 },
  coolingSavingPct: { low: 3, high: 30 },
  coolRoofCostKrwPerM2: { low: 15000, high: 60000 },
  pvCostKrwPerKw: { low: 1200000, high: 2500000 },
  subsidyPct: { low: 30, high: 90 },
  emissionFactorTPerMwh: { low: 0.35, high: 0.5 },
};

export type SensitivityMetric =
  | "co2ReductionT"
  | "totalCostKrw"
  | "municipalCostKrw"
  | "ownerCostKrw"
  | "solarGeneratedKwh"
  | "coolingSavedKwh";

export const METRIC_LABELS: Record<SensitivityMetric, { label: string; unit: string; scale: number }> = {
  co2ReductionT: { label: "추정 온실가스 감축량", unit: "tCO2eq/년", scale: 1 },
  totalCostKrw: { label: "총사업비", unit: "억 원", scale: 1e8 },
  municipalCostKrw: { label: "대전시 재정 부담", unit: "억 원", scale: 1e8 },
  ownerCostKrw: { label: "공장 소유주 부담", unit: "억 원", scale: 1e8 },
  solarGeneratedKwh: { label: "태양광 총발전량", unit: "MWh/년", scale: 1e3 },
  coolingSavedKwh: { label: "냉방 전력 절감량", unit: "MWh/년", scale: 1e3 },
};

const specOf = (key: NumericInputKey) =>
  FIELD_SPECS.find((field) => field.key === key)!;

export function validateRange(
  key: NumericInputKey,
  base: number,
  low: number,
  high: number,
): string | null {
  const spec = specOf(key);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "숫자를 입력하세요.";
  if (spec.integer && (!Number.isInteger(low) || !Number.isInteger(high)))
    return "정수로 입력하세요.";
  if (low > base) return "낮은 값이 기준값보다 큽니다.";
  if (high < base) return "높은 값이 기준값보다 작습니다.";
  if (low < spec.min || (spec.exclusiveMin && low <= spec.min))
    return "낮은 값이 허용 범위를 벗어났습니다.";
  if (high > spec.max) return "높은 값이 허용 범위를 벗어났습니다.";
  return null;
}

export interface OneAtATimeRow {
  key: NumericInputKey;
  label: string;
  unit: string;
  low: number;
  base: number;
  high: number;
  outputAtLow: number;
  outputAtBase: number;
  outputAtHigh: number;
  minOutput: number;
  maxOutput: number;
  /** 결과의 변동 폭 */
  swing: number;
  /** 기준 결과 대비 변동 폭 (%). 기준 결과가 0이면 null */
  swingPct: number | null;
  /** 1위부터. 변동이 없는 변수도 순위에 포함합니다. */
  rank: number;
  error: string | null;
}

function output(
  inputs: ModelInputs,
  scenarioId: ScenarioId,
  metric: SensitivityMetric,
): number {
  const result: ScenarioResult = calculateScenario(inputs, scenarioId);
  return result[metric];
}

/** 변동 폭이 큰 순서로 정렬해 돌려줍니다. 범위가 잘못된 변수는 맨 뒤로 보내고 순위를 주지 않습니다. */
export function runOneAtATime(
  inputs: ModelInputs,
  scenarioId: ScenarioId,
  metric: SensitivityMetric,
  ranges: SensitivityRanges,
): OneAtATimeRow[] {
  const outputAtBase = output(inputs, scenarioId, metric);
  const rows = SENSITIVITY_KEYS.map((key): OneAtATimeRow => {
    const { low, high } = ranges[key];
    const base = inputs[key];
    const error = validateRange(key, base, low, high);
    const outputAtLow = error ? outputAtBase : output({ ...inputs, [key]: low }, scenarioId, metric);
    const outputAtHigh = error ? outputAtBase : output({ ...inputs, [key]: high }, scenarioId, metric);
    const minOutput = Math.min(outputAtLow, outputAtBase, outputAtHigh);
    const maxOutput = Math.max(outputAtLow, outputAtBase, outputAtHigh);
    const swing = maxOutput - minOutput;
    return {
      key,
      label: specOf(key).label,
      unit: specOf(key).unit,
      low,
      base,
      high,
      outputAtLow,
      outputAtBase,
      outputAtHigh,
      minOutput,
      maxOutput,
      swing,
      swingPct: outputAtBase !== 0 ? (swing / Math.abs(outputAtBase)) * 100 : null,
      rank: 0,
      error,
    };
  });

  const valid = rows.filter((row) => !row.error);
  // 부동소수점 잔여 오차가 순위를 바꾸지 않도록 아주 작은 차이는 없는 것으로 봅니다.
  const tolerance = Math.max(1e-9, Math.abs(outputAtBase) * 1e-12);
  for (const row of valid) if (row.swing < tolerance) row.swing = 0;
  valid.sort((a, b) => b.swing - a.swing || SENSITIVITY_KEYS.indexOf(a.key) - SENSITIVITY_KEYS.indexOf(b.key));
  valid.forEach((row, index) => {
    row.rank = index + 1;
  });
  return [...valid, ...rows.filter((row) => row.error)];
}

export interface MultiVariableResult {
  keys: NumericInputKey[];
  combinations: number;
  outputAtBase: number;
  minOutput: number;
  maxOutput: number;
  minSettings: Partial<Record<NumericInputKey, number>>;
  maxSettings: Partial<Record<NumericInputKey, number>>;
}

/**
 * 고른 변수의 낮은 값·높은 값 조합을 전부 계산합니다.
 * 이 모델의 출력은 각 변수에 대해 단조이므로 범위의 양 끝 조합에서 최솟값과 최댓값이 나옵니다.
 */
export function runMultiVariable(
  inputs: ModelInputs,
  scenarioId: ScenarioId,
  metric: SensitivityMetric,
  ranges: SensitivityRanges,
  selectedKeys: NumericInputKey[],
): MultiVariableResult {
  const keys = selectedKeys.filter(
    (key) => !validateRange(key, inputs[key], ranges[key].low, ranges[key].high),
  );
  const outputAtBase = output(inputs, scenarioId, metric);
  let minOutput = Infinity;
  let maxOutput = -Infinity;
  let minSettings: MultiVariableResult["minSettings"] = {};
  let maxSettings: MultiVariableResult["maxSettings"] = {};
  const combinations = 2 ** keys.length;

  for (let mask = 0; mask < combinations; mask += 1) {
    const settings: Partial<Record<NumericInputKey, number>> = {};
    keys.forEach((key, bit) => {
      settings[key] = mask & (1 << bit) ? ranges[key].high : ranges[key].low;
    });
    const value = output({ ...inputs, ...settings }, scenarioId, metric);
    if (value < minOutput) {
      minOutput = value;
      minSettings = settings;
    }
    if (value > maxOutput) {
      maxOutput = value;
      maxSettings = settings;
    }
  }

  return {
    keys,
    combinations,
    outputAtBase,
    minOutput,
    maxOutput,
    minSettings,
    maxSettings,
  };
}
