import { parseNumber } from "./fields";
import type { DatasetOptions } from "./optimization";
import type { NumericInputKey, ScenarioId } from "./model";
import { SCENARIO_IDS } from "./model";
import { BUDGET_PRESETS_KRW } from "./policy";
import {
  DEFAULT_RANGES,
  METRIC_LABELS,
  SENSITIVITY_KEYS,
  type SensitivityMetric,
  type SensitivityRanges,
} from "./sensitivity";

/** 입력칸의 상태. 입력 중인 문자열을 그대로 보관합니다. */
export interface LabSettings {
  analysisScenario: ScenarioId;
  /** 프리셋 금액(원)의 문자열 또는 "custom" */
  budgetChoice: string;
  customBudgetEok: string;
  datasetCount: string;
  datasetSeed: string;
  unsafeSharePct: string;
  randomSeed: string;
  sensitivityMetric: SensitivityMetric;
  multiKeys: NumericInputKey[];
  ranges: Record<string, { low: string; high: string }>;
}

/** 계산에 쓰는 검증된 숫자 값. 실행 기록에 저장됩니다. */
export interface RunConfig {
  analysisScenario: ScenarioId;
  budgetKrw: number;
  dataset: DatasetOptions;
  randomSeed: number;
  sensitivityMetric: SensitivityMetric;
  multiKeys: NumericInputKey[];
  ranges: SensitivityRanges;
}

export const DEFAULT_SETTINGS: LabSettings = {
  analysisScenario: "combinedSeparate",
  budgetChoice: "1000000000",
  customBudgetEok: "",
  datasetCount: "40",
  datasetSeed: "2026",
  unsafeSharePct: "20",
  randomSeed: "42",
  sensitivityMetric: "co2ReductionT",
  multiKeys: [...SENSITIVITY_KEYS],
  ranges: Object.fromEntries(
    SENSITIVITY_KEYS.map((key) => [
      key,
      {
        low: String(DEFAULT_RANGES[key]!.low),
        high: String(DEFAULT_RANGES[key]!.high),
      },
    ]),
  ),
};

const MAX_SEED = 4294967295;

export function parseSettings(settings: LabSettings): {
  config: RunConfig | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  const integerIn = (
    name: string,
    text: string,
    min: number,
    max: number,
    label: string,
  ) => {
    const value = parseNumber(text);
    if (value === null || !Number.isInteger(value) || value < min || value > max) {
      errors[name] = `${label}: ${min}~${max.toLocaleString("ko-KR")} 사이의 정수를 입력하세요.`;
      return min;
    }
    return value;
  };

  const datasetCount = integerIn("datasetCount", settings.datasetCount, 1, 300, "가상 공장 수");
  const datasetSeed = integerIn("datasetSeed", settings.datasetSeed, 0, MAX_SEED, "데이터 시드");
  const randomSeed = integerIn("randomSeed", settings.randomSeed, 0, MAX_SEED, "무작위 선정 시드");

  const unsafeSharePct = parseNumber(settings.unsafeSharePct);
  if (unsafeSharePct === null || unsafeSharePct < 0 || unsafeSharePct > 100) {
    errors.unsafeSharePct = "구조 부적합 비율: 0~100 사이의 숫자를 입력하세요.";
  }

  let budgetKrw = 0;
  if (settings.budgetChoice === "custom") {
    const eok = parseNumber(settings.customBudgetEok);
    if (eok === null || eok <= 0 || eok > 100000) {
      errors.customBudgetEok = "직접 입력 예산: 0보다 크고 100,000억 원 이하인 값을 입력하세요.";
    } else {
      budgetKrw = Math.floor(eok * 1e8);
    }
  } else {
    budgetKrw = Number(settings.budgetChoice);
    if (!BUDGET_PRESETS_KRW.includes(budgetKrw)) {
      errors.budgetChoice = "예산을 다시 선택하세요.";
    }
  }

  const ranges = {} as SensitivityRanges;
  for (const key of SENSITIVITY_KEYS) {
    const low = parseNumber(settings.ranges[key]?.low ?? "");
    const high = parseNumber(settings.ranges[key]?.high ?? "");
    if (low === null || high === null) {
      errors[`range-${key}`] = "민감도 범위: 낮은 값과 높은 값을 숫자로 입력하세요.";
      ranges[key] = DEFAULT_RANGES[key]!;
    } else {
      ranges[key] = { low, high };
    }
  }

  if (Object.keys(errors).length > 0) return { config: null, errors };

  return {
    config: {
      analysisScenario: settings.analysisScenario,
      budgetKrw,
      dataset: {
        count: datasetCount,
        seed: datasetSeed,
        unsafeSharePct: unsafeSharePct as number,
      },
      randomSeed,
      sensitivityMetric: settings.sensitivityMetric,
      multiKeys: settings.multiKeys,
      ranges,
    },
    errors,
  };
}

/** 실행 기록을 복원할 때 숫자 설정을 입력칸 문자열로 되돌립니다. */
export function configToSettings(config: RunConfig): LabSettings {
  const isPreset = BUDGET_PRESETS_KRW.includes(config.budgetKrw);
  return {
    analysisScenario: config.analysisScenario,
    budgetChoice: isPreset ? String(config.budgetKrw) : "custom",
    customBudgetEok: isPreset ? "" : String(config.budgetKrw / 1e8),
    datasetCount: String(config.dataset.count),
    datasetSeed: String(config.dataset.seed),
    unsafeSharePct: String(config.dataset.unsafeSharePct),
    randomSeed: String(config.randomSeed),
    sensitivityMetric: config.sensitivityMetric,
    multiKeys: [...config.multiKeys],
    ranges: Object.fromEntries(
      SENSITIVITY_KEYS.map((key) => [
        key,
        { low: String(config.ranges[key].low), high: String(config.ranges[key].high) },
      ]),
    ),
  };
}

/** 저장소에서 읽은 값을 믿지 않고, 아는 항목만 형식을 확인해 복원합니다. */
export function normalizeSettings(value: unknown): LabSettings {
  const merged: LabSettings = {
    ...DEFAULT_SETTINGS,
    ranges: { ...DEFAULT_SETTINGS.ranges },
    multiKeys: [...DEFAULT_SETTINGS.multiKeys],
  };
  if (typeof value !== "object" || value === null) return merged;
  const saved = value as Record<string, unknown>;

  for (const key of [
    "budgetChoice",
    "customBudgetEok",
    "datasetCount",
    "datasetSeed",
    "unsafeSharePct",
    "randomSeed",
  ] as const) {
    const text = saved[key];
    if (typeof text === "string") merged[key] = text;
  }
  if (SCENARIO_IDS.includes(saved.analysisScenario as ScenarioId)) {
    merged.analysisScenario = saved.analysisScenario as ScenarioId;
  }
  if (
    typeof saved.sensitivityMetric === "string" &&
    Object.hasOwn(METRIC_LABELS, saved.sensitivityMetric)
  ) {
    merged.sensitivityMetric = saved.sensitivityMetric as SensitivityMetric;
  }
  if (Array.isArray(saved.multiKeys)) {
    merged.multiKeys = SENSITIVITY_KEYS.filter((key) =>
      (saved.multiKeys as unknown[]).includes(key),
    );
  }
  if (typeof saved.ranges === "object" && saved.ranges !== null) {
    const ranges = saved.ranges as Record<string, { low?: unknown; high?: unknown } | null>;
    for (const key of SENSITIVITY_KEYS) {
      const range = ranges[key];
      if (range && typeof range.low === "string" && typeof range.high === "string") {
        merged.ranges[key] = { low: range.low, high: range.high };
      }
    }
  }
  return merged;
}
