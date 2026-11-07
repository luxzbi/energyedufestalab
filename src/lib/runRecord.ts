/**
 * 재현 가능한 실행 기록.
 * 기록에는 입력값과 결과를 함께 저장하고, 불러올 때 입력값으로 다시 계산해 결과와 비교합니다.
 * 측정 기록은 별도 구조이므로 여기에 넣지 않습니다.
 */
import {
  ASSUMPTIONS,
  collectSources,
  LIMITATIONS,
} from "./assumptions";
import { toCsv } from "./csv";
import { FIELD_SPECS, toRawInputs, validateInputs } from "./fields";
import {
  calculateAll,
  MODEL_VERSION,
  SCENARIO_IDS,
  SCENARIO_LABELS,
  type ModelInputs,
  type ScenarioId,
  type ScenarioResults,
} from "./model";
import {
  compareSelectionMethods,
  evaluateFactories,
  generateVirtualFactories,
  SELECTION_LABELS,
  SELECTION_METHODS,
  type OptimizationResult,
} from "./optimization";
import {
  budgetCapacity,
  compareSubsidyRates,
  COMPARE_SUBSIDY_RATES,
  type BudgetCapacityRow,
  type SubsidyRow,
} from "./policy";
import {
  METRIC_LABELS,
  runMultiVariable,
  runOneAtATime,
  SENSITIVITY_KEYS,
  type MultiVariableResult,
  type OneAtATimeRow,
  type SensitivityRanges,
} from "./sensitivity";
import type { RunConfig } from "./settings";

export const RUN_SCHEMA = "energy-shield-lab/run";
export const RUN_SCHEMA_VERSION = 1;

/** 실행 결과 전체. 같은 입력이면 항상 같은 값이 나옵니다. */
export interface RunResults {
  scenarios: ScenarioResults;
  subsidyComparison: SubsidyRow[];
  /** 정해진 예산에서 지원율별 평균 공장 수 */
  budgetCapacity: BudgetCapacityRow[];
  optimization: OptimizationResult;
  sensitivity: {
    oneAtATime: OneAtATimeRow[];
    multiVariable: MultiVariableResult;
  };
}

export function computeRunResults(
  inputs: ModelInputs,
  config: RunConfig,
): RunResults {
  const scenario = config.analysisScenario;
  const factories = generateVirtualFactories(inputs, config.dataset);
  const evaluated = evaluateFactories(factories, inputs, scenario);
  return {
    scenarios: calculateAll(inputs),
    subsidyComparison: compareSubsidyRates(inputs, scenario),
    budgetCapacity: COMPARE_SUBSIDY_RATES.map((subsidyPct) =>
      budgetCapacity({ ...inputs, subsidyPct }, scenario, config.budgetKrw),
    ),
    optimization: compareSelectionMethods(evaluated, config.budgetKrw, config.randomSeed),
    sensitivity: {
      oneAtATime: runOneAtATime(inputs, scenario, config.sensitivityMetric, config.ranges),
      multiVariable: runMultiVariable(
        inputs,
        scenario,
        config.sensitivityMetric,
        config.ranges,
        config.multiKeys,
      ),
    },
  };
}

export interface RunRecord {
  schema: typeof RUN_SCHEMA;
  schemaVersion: number;
  id: string;
  executedAt: string;
  modelVersion: string;
  /** 이 기록의 모든 수치는 가정 기반 추정입니다. */
  dataKind: "가정 기반 추정";
  measurementsIncluded: false;
  scenarioType: string;
  inputs: ModelInputs;
  config: RunConfig;
  results: RunResults;
  sources: string[];
  assumptions: string[];
  limitations: string[];
}

export function createRun(
  inputs: ModelInputs,
  config: RunConfig,
  id: string,
  now: Date,
): RunRecord {
  return {
    schema: RUN_SCHEMA,
    schemaVersion: RUN_SCHEMA_VERSION,
    id,
    executedAt: now.toISOString(),
    modelVersion: MODEL_VERSION,
    dataKind: "가정 기반 추정",
    measurementsIncluded: false,
    scenarioType: SCENARIO_LABELS[config.analysisScenario],
    inputs,
    config,
    results: computeRunResults(inputs, config),
    sources: collectSources(),
    assumptions: [...ASSUMPTIONS],
    limitations: [...LIMITATIONS],
  };
}

/** 값이 다른 곳의 경로를 모읍니다. 숫자는 브라우저 간 미세 차이를 고려해 상대 오차 10⁻⁹까지 같다고 봅니다. */
export function findDifferences(
  expected: unknown,
  actual: unknown,
  path = "results",
  found: string[] = [],
): string[] {
  if (found.length >= 50) return found;
  if (typeof expected === "number" && typeof actual === "number") {
    const scale = Math.max(1, Math.abs(expected), Math.abs(actual));
    if (Math.abs(expected - actual) > scale * 1e-9) found.push(path);
    return found;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      found.push(path);
      return found;
    }
    expected.forEach((item, i) => findDifferences(item, actual[i], `${path}[${i}]`, found));
    return found;
  }
  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) {
      found.push(path);
      return found;
    }
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    for (const key of new Set([...Object.keys(e), ...Object.keys(a)])) {
      findDifferences(e[key], a[key], `${path}.${key}`, found);
    }
    return found;
  }
  if (expected !== actual) found.push(path);
  return found;
}

export interface RunVerification {
  /** 다시 계산한 결과가 저장된 결과와 일치하는지 */
  reproduced: boolean;
  modelVersionMatches: boolean;
  differences: string[];
  recomputed: RunResults;
}

export function verifyRun(run: RunRecord): RunVerification {
  // JSON을 거치며 undefined 항목이 사라지므로, 같은 형태로 맞춘 뒤 비교합니다.
  const recomputed = JSON.parse(
    JSON.stringify(computeRunResults(run.inputs, run.config)),
  ) as RunResults;
  const differences = findDifferences(recomputed, run.results);
  return {
    reproduced: differences.length === 0,
    modelVersionMatches: run.modelVersion === MODEL_VERSION,
    differences,
    recomputed,
  };
}

const MAX_RUN_FILE_CHARS = 5_000_000;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** 불러온 값을 믿지 않습니다. 형식과 범위를 확인한 항목만 새 객체로 옮깁니다. */
export function parseRun(value: unknown): { run: RunRecord | null; error: string | null } {
  const fail = (error: string) => ({ run: null, error });
  if (typeof value !== "object" || value === null) return fail("JSON 객체가 아닙니다.");
  const r = value as Record<string, unknown>;

  if (r.schema !== RUN_SCHEMA) return fail("Energy Shield Lab 실행 기록 파일이 아닙니다.");
  if (r.schemaVersion !== RUN_SCHEMA_VERSION) return fail("지원하지 않는 기록 형식 버전입니다.");
  if (typeof r.id !== "string" || typeof r.modelVersion !== "string") {
    return fail("기록의 식별 정보가 없습니다.");
  }
  if (typeof r.executedAt !== "string" || Number.isNaN(new Date(r.executedAt).getTime())) {
    return fail("실행 일시가 올바르지 않습니다.");
  }
  if (!isStringArray(r.sources) || !isStringArray(r.assumptions) || !isStringArray(r.limitations)) {
    return fail("출처·가정·한계 목록이 올바르지 않습니다.");
  }

  // 입력값
  if (typeof r.inputs !== "object" || r.inputs === null) return fail("입력값이 없습니다.");
  const rawInputs = r.inputs as Record<string, unknown>;
  const picked = {} as Record<string, number | null>;
  for (const field of FIELD_SPECS) {
    const item = rawInputs[field.key];
    if (typeof item === "number" || (field.optional && item === null)) picked[field.key] = item;
    else return fail(`입력값 '${field.label}'이 올바르지 않습니다.`);
  }
  const validated = validateInputs(toRawInputs(picked as unknown as ModelInputs));
  if (!validated.values) return fail("입력값이 허용 범위를 벗어났습니다.");

  const config = parseConfig(r.config);
  if (!config) return fail("계산 설정이 올바르지 않습니다.");

  if (typeof r.results !== "object" || r.results === null) return fail("결과가 없습니다.");

  return {
    run: {
      schema: RUN_SCHEMA,
      schemaVersion: RUN_SCHEMA_VERSION,
      id: r.id,
      executedAt: r.executedAt,
      modelVersion: r.modelVersion,
      dataKind: "가정 기반 추정",
      measurementsIncluded: false,
      scenarioType: SCENARIO_LABELS[config.analysisScenario],
      inputs: validated.values,
      config,
      results: r.results as RunResults,
      sources: r.sources,
      assumptions: r.assumptions,
      limitations: r.limitations,
    },
    error: null,
  };
}

function parseConfig(value: unknown): RunConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  const dataset = c.dataset as Record<string, unknown> | null | undefined;

  const isInt = (n: unknown, min: number, max: number): n is number =>
    typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

  if (!SCENARIO_IDS.includes(c.analysisScenario as ScenarioId)) return null;
  if (typeof c.budgetKrw !== "number" || !(c.budgetKrw > 0) || c.budgetKrw > 1e13) return null;
  if (!dataset || !isInt(dataset.count, 1, 300) || !isInt(dataset.seed, 0, 4294967295)) return null;
  if (typeof dataset.unsafeSharePct !== "number" || dataset.unsafeSharePct < 0 || dataset.unsafeSharePct > 100) return null;
  if (!isInt(c.randomSeed, 0, 4294967295)) return null;
  if (typeof c.sensitivityMetric !== "string" || !Object.hasOwn(METRIC_LABELS, c.sensitivityMetric)) return null;
  if (!Array.isArray(c.multiKeys)) return null;

  const rawRanges = c.ranges as Record<string, { low?: unknown; high?: unknown } | null> | null | undefined;
  if (!rawRanges) return null;
  const ranges = {} as SensitivityRanges;
  for (const key of SENSITIVITY_KEYS) {
    const range = rawRanges[key];
    if (!range || typeof range.low !== "number" || typeof range.high !== "number") return null;
    ranges[key] = { low: range.low, high: range.high };
  }

  return {
    analysisScenario: c.analysisScenario as ScenarioId,
    budgetKrw: c.budgetKrw,
    dataset: {
      count: dataset.count,
      seed: dataset.seed,
      unsafeSharePct: dataset.unsafeSharePct,
    },
    randomSeed: c.randomSeed,
    sensitivityMetric: c.sensitivityMetric as RunConfig["sensitivityMetric"],
    multiKeys: SENSITIVITY_KEYS.filter((key) => (c.multiKeys as unknown[]).includes(key)),
    ranges,
  };
}

export function parseRunJson(text: string): { run: RunRecord | null; error: string | null } {
  if (text.length > MAX_RUN_FILE_CHARS) {
    return { run: null, error: "파일이 너무 큽니다." };
  }
  try {
    return parseRun(JSON.parse(text));
  } catch {
    return { run: null, error: "JSON 형식이 아닙니다." };
  }
}

export function buildRunJson(run: RunRecord): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

/** 실행 기록을 표 프로그램에서 볼 수 있게 펼칩니다. 다시 불러오기는 JSON으로 합니다. */
export function buildRunCsv(run: RunRecord): string {
  const rows: (string | number | null)[][] = [["구분", "대상", "항목", "값", "단위"]];
  const meta = (item: string, value: string) => rows.push(["기록 정보", "", item, value, ""]);

  meta("실행 일시", run.executedAt);
  meta("계산 모델 버전", run.modelVersion);
  meta("데이터 구분", run.dataKind);
  meta("실측 자료 포함", "아니요");
  meta("시나리오 유형", run.scenarioType);

  for (const field of FIELD_SPECS) {
    rows.push(["입력 변수", "공통", field.label, run.inputs[field.key] ?? "미산정", field.unit]);
  }
  rows.push(["입력 변수", "최적화", "대전시 예산", run.config.budgetKrw, "원"]);
  rows.push(["입력 변수", "최적화", "가상 공장 수", run.config.dataset.count, "개"]);
  rows.push(["입력 변수", "최적화", "데이터 시드", run.config.dataset.seed, ""]);
  rows.push(["입력 변수", "최적화", "구조 부적합 비율", run.config.dataset.unsafeSharePct, "%"]);
  rows.push(["입력 변수", "최적화", "무작위 선정 시드", run.config.randomSeed, ""]);

  for (const id of SCENARIO_IDS) {
    const r = run.results.scenarios[id];
    const label = SCENARIO_LABELS[id];
    const add = (item: string, value: number | null, unit: string) =>
      rows.push(["가정 기반 결과", label, item, value ?? "미산정", unit]);
    add("쿨루프 시공 면적", r.coatedAreaM2, "m²");
    add("쿨루프 효과 인정 면적", r.creditedCoolRoofAreaM2, "m²");
    add("쿨루프 효과 미산정 면적", r.uncreditedCoatedAreaM2, "m²");
    add("태양광 면적", r.pvAreaM2, "m²");
    add("냉방 전력 절감량", r.coolingSavedKwh, "kWh/년");
    add("태양광 총발전량", r.solarGeneratedKwh, "kWh/년");
    add("태양광 자가소비량", r.selfConsumedKwh, "kWh/년");
    add("전력망 역송량", r.exportedKwh, "kWh/년");
    add("전력망 구매 감소", r.gridPurchaseReductionKwh, "kWh/년");
    add("총사업비", r.totalCostKrw, "원");
    add("대전시 부담", r.municipalCostKrw, "원");
    add("소유주 부담", r.ownerCostKrw, "원");
    add("추정 온실가스 감축량(평균 계수)", r.co2ReductionT, "tCO2eq/년");
    add("추정 온실가스 감축량(한계 계수)", r.co2MarginalT, "tCO2eq/년");
  }

  for (const row of run.results.subsidyComparison) {
    const label = `지원율 ${row.subsidyPct}% (사업 규모 고정)`;
    rows.push(["지원율 비교", label, "대전시 부담", row.municipalCostKrw, "원"]);
    rows.push(["지원율 비교", label, "소유주 부담", row.ownerCostKrw, "원"]);
    rows.push(["지원율 비교", label, "공장당 평균 소유주 부담", row.ownerCostPerFactoryKrw, "원"]);
  }
  for (const row of run.results.budgetCapacity) {
    const label = `지원율 ${row.subsidyPct}% (예산 고정)`;
    rows.push(["예산 분석", label, "지원 가능 공장 수", row.fundedFactories, "개"]);
    rows.push(["예산 분석", label, "추정 온실가스 감축량", row.co2ReductionT, "tCO2eq/년"]);
  }
  for (const method of SELECTION_METHODS) {
    const r = run.results.optimization.results[method];
    const label = `가상 데이터: ${SELECTION_LABELS[method]}`;
    rows.push(["예산 최적화", label, "해의 종류", r.solutionType, ""]);
    rows.push(["예산 최적화", label, "선정 공장 수", r.factoryCount, "개"]);
    rows.push(["예산 최적화", label, "대전시 부담", r.municipalCostKrw, "원"]);
    rows.push(["예산 최적화", label, "추정 온실가스 감축량", r.co2ReductionT, "tCO2eq/년"]);
  }
  for (const row of run.results.sensitivity.oneAtATime) {
    const label = `단일 변수: ${row.label}`;
    const output = METRIC_LABELS[run.config.sensitivityMetric].label;
    rows.push(["민감도(신뢰구간 아님)", label, `순위 (${output})`, row.rank || "범위 오류", ""]);
    rows.push(["민감도(신뢰구간 아님)", label, "변동 폭", row.swing, ""]);
  }

  for (const source of run.sources) rows.push(["자료 출처", "", source, "", ""]);
  for (const item of run.assumptions) rows.push(["적용 가정", "", item, "", ""]);
  for (const item of run.limitations) rows.push(["모델 한계", "", item, "", ""]);

  return toCsv(rows);
}
