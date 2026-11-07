/**
 * 사람이 직접 측정한 값의 기록과 통계(모드 2).
 * 이 모듈은 계산 엔진(model.ts)을 가져오지 않습니다. 측정값이 가정 계산에 몰래
 * 섞이거나 계산값이 측정값처럼 보이는 일을 구조적으로 막기 위해서입니다.
 *
 * 온도 차이를 연간 냉방 전력 절감률로 바꾸는 함수는 일부러 두지 않습니다.
 * 그 변환에는 건물 열해석이나 전력 계측 자료가 필요합니다.
 * 샘플 데이터도 두지 않습니다. 기록은 사용자가 입력하기 전까지 비어 있습니다.
 */
import { parseNumber } from "./fields";

export const CONDITIONS = [
  "기준 지붕(처리 없음)",
  "쿨루프",
  "태양광",
  "쿨루프 + 태양광",
  "기타",
] as const;

export const PHASES = ["시공 전", "시공 후", "구분 없음"] as const;
export type Phase = (typeof PHASES)[number];

export const METRICS = [
  { label: "지붕 표면 온도", unit: "°C" },
  { label: "실내 온도", unit: "°C" },
  { label: "외기 온도", unit: "°C" },
  { label: "일사량", unit: "W/m²" },
  { label: "냉방 전력량", unit: "kWh" },
  { label: "태양광 발전량", unit: "kWh" },
  { label: "기타(직접 입력)", unit: "" },
] as const;

export const CUSTOM_METRIC = "기타(직접 입력)";

/** 전후 비교의 해석에 꼭 필요한 통제 변수 */
export const CONTROL_METRICS = ["외기 온도", "일사량"];

export interface Measurement {
  id: string;
  /** 측정 일시 (예: 2026-07-15T14:30) */
  measuredAt: string;
  observer: string;
  site: string;
  condition: string;
  phase: Phase;
  metric: string;
  /** 측정에 실패했으면 null(결측). 0으로 바꾸지 않고 통계에서 뺍니다. */
  value: number | null;
  unit: string;
  instrument: string;
  notes: string;
}

export interface MeasurementDraft {
  measuredAt: string;
  observer: string;
  site: string;
  condition: string;
  phase: string;
  metric: string;
  customMetric: string;
  value: string;
  /** "yes"면 결측으로 기록 */
  missing: string;
  unit: string;
  instrument: string;
  notes: string;
}

export const EMPTY_DRAFT: MeasurementDraft = {
  measuredAt: "",
  observer: "",
  site: "",
  condition: "",
  phase: "구분 없음",
  metric: "",
  customMetric: "",
  value: "",
  missing: "",
  unit: "",
  instrument: "",
  notes: "",
};

export type DraftErrors = Partial<Record<keyof MeasurementDraft, string>>;

export function validateDraft(
  draft: MeasurementDraft,
  now: Date,
): { errors: DraftErrors; record: Omit<Measurement, "id"> | null } {
  const errors: DraftErrors = {};
  const measuredTime = new Date(draft.measuredAt).getTime();

  if (!draft.measuredAt) errors.measuredAt = "측정 일시를 입력하세요.";
  else if (Number.isNaN(measuredTime))
    errors.measuredAt = "측정 일시 형식이 올바르지 않습니다.";
  else if (measuredTime > now.getTime())
    errors.measuredAt = "미래 시각은 측정값으로 기록할 수 없습니다.";

  if (!draft.observer.trim()) errors.observer = "측정자를 입력하세요.";
  if (!draft.site.trim()) errors.site = "측정 장소를 입력하세요.";
  if (!(CONDITIONS as readonly string[]).includes(draft.condition))
    errors.condition = "조건을 선택하세요.";
  if (!(PHASES as readonly string[]).includes(draft.phase))
    errors.phase = "측정 시점을 선택하세요.";

  const preset = METRICS.find((metric) => metric.label === draft.metric);
  if (!preset) errors.metric = "측정 항목을 선택하세요.";

  const isCustom = draft.metric === CUSTOM_METRIC;
  if (isCustom && !draft.customMetric.trim())
    errors.customMetric = "항목 이름을 입력하세요.";

  const unit = isCustom ? draft.unit.trim() : (preset?.unit ?? "");
  if (isCustom && !unit) errors.unit = "단위를 입력하세요.";

  const isMissing = draft.missing === "yes";
  const valueText = draft.value.trim();
  if (isMissing) {
    if (valueText) errors.value = "결측으로 기록하려면 측정값을 비워 두세요.";
    if (!draft.notes.trim()) errors.notes = "결측 사유를 메모에 적으세요.";
  } else if (!valueText) {
    errors.value = "측정값을 입력하세요. 측정하지 못했다면 결측을 선택하세요.";
  } else if (parseNumber(valueText) === null) {
    errors.value = "쉼표 없이 숫자만 입력하세요.";
  }

  if (!draft.instrument.trim()) errors.instrument = "측정 기기를 입력하세요.";

  if (Object.keys(errors).length > 0) return { errors, record: null };

  return {
    errors,
    record: {
      measuredAt: draft.measuredAt,
      observer: draft.observer.trim(),
      site: draft.site.trim(),
      condition: draft.condition,
      phase: draft.phase as Phase,
      metric: isCustom ? draft.customMetric.trim() : draft.metric,
      value: isMissing ? null : Number(valueText),
      unit,
      instrument: draft.instrument.trim(),
      notes: draft.notes.trim(),
    },
  };
}

/** 저장소에서 읽은 값이 올바른 기록인지 확인합니다. 이전 버전 기록은 시점이 없어 "구분 없음"으로 채웁니다. */
export function normalizeMeasurement(value: unknown): Measurement | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const stringKeys = [
    "id",
    "measuredAt",
    "observer",
    "site",
    "condition",
    "metric",
    "unit",
    "instrument",
    "notes",
  ] as const;
  if (!stringKeys.every((key) => typeof record[key] === "string")) return null;

  const measured = record.value;
  const validValue =
    measured === null || (typeof measured === "number" && Number.isFinite(measured));
  if (!validValue) return null;

  const phase = (PHASES as readonly unknown[]).includes(record.phase)
    ? (record.phase as Phase)
    : "구분 없음";

  return {
    id: record.id as string,
    measuredAt: record.measuredAt as string,
    observer: record.observer as string,
    site: record.site as string,
    condition: record.condition as string,
    phase,
    metric: record.metric as string,
    value: measured as number | null,
    unit: record.unit as string,
    instrument: record.instrument as string,
    notes: record.notes as string,
  };
}

export interface Stats {
  /** 값이 있는 측정 수 */
  count: number;
  /** 결측 기록 수 */
  missingCount: number;
  mean: number | null;
  /** 표본표준편차(n−1). 측정이 2회 미만이면 계산할 수 없어 null */
  stdDev: number | null;
  min: number | null;
  max: number | null;
}

export function computeStats(values: (number | null)[]): Stats {
  const present = values.filter((value): value is number => value !== null);
  const count = present.length;
  const missingCount = values.length - count;
  if (count === 0) {
    return { count, missingCount, mean: null, stdDev: null, min: null, max: null };
  }
  const mean = present.reduce((sum, n) => sum + n, 0) / count;
  const stdDev =
    count < 2
      ? null
      : Math.sqrt(present.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (count - 1));
  return {
    count,
    missingCount,
    mean,
    stdDev,
    min: Math.min(...present),
    max: Math.max(...present),
  };
}

export interface MeasurementSummary extends Stats {
  metric: string;
  unit: string;
  condition: string;
}

/**
 * 항목·단위·조건이 같은 기록끼리만 요약합니다.
 * 단위가 다른 값을 평균 내는 실수를 막으려고 단위까지 묶음 기준에 넣었습니다.
 */
export function summarize(records: Measurement[]): MeasurementSummary[] {
  const groups = new Map<string, Measurement[]>();
  for (const record of records) {
    const key = JSON.stringify([record.metric, record.unit, record.condition]);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.values()]
    .map((group) => ({
      metric: group[0].metric,
      unit: group[0].unit,
      condition: group[0].condition,
      ...computeStats(group.map((record) => record.value)),
    }))
    .sort(
      (a, b) =>
        a.metric.localeCompare(b.metric, "ko") ||
        a.condition.localeCompare(b.condition, "ko"),
    );
}

export interface PhaseComparison {
  site: string;
  metric: string;
  unit: string;
  before: Stats;
  after: Stats;
  /** 시공 후 평균 − 시공 전 평균. 한쪽이라도 값이 없으면 null */
  meanDifference: number | null;
}

/** 같은 장소·항목·단위에서 시공 전후의 평균 차이를 계산합니다. 결과는 측정값의 차이일 뿐입니다. */
export function comparePhases(records: Measurement[]): PhaseComparison[] {
  const groups = new Map<string, Measurement[]>();
  for (const record of records) {
    if (record.phase === "구분 없음") continue;
    const key = JSON.stringify([record.site, record.metric, record.unit]);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.values()]
    .map((group) => {
      const pick = (phase: Phase) =>
        computeStats(group.filter((r) => r.phase === phase).map((r) => r.value));
      const before = pick("시공 전");
      const after = pick("시공 후");
      return {
        site: group[0].site,
        metric: group[0].metric,
        unit: group[0].unit,
        before,
        after,
        meanDifference:
          before.mean !== null && after.mean !== null ? after.mean - before.mean : null,
      };
    })
    .sort(
      (a, b) =>
        a.site.localeCompare(b.site, "ko") || a.metric.localeCompare(b.metric, "ko"),
    );
}

/**
 * 전후 비교가 있는 장소에서 통제 변수가 전후 모두 측정되지 않았으면 알려 줍니다.
 * 날씨가 달랐다면 온도 차이를 쿨루프 효과로 볼 수 없기 때문입니다.
 */
export function missingControls(comparisons: PhaseComparison[]) {
  const sites = [...new Set(comparisons.map((c) => c.site))];
  return sites.flatMap((site) => {
    const missing = CONTROL_METRICS.filter((metric) => {
      const row = comparisons.find((c) => c.site === site && c.metric === metric);
      return !row || row.before.count === 0 || row.after.count === 0;
    });
    return missing.length > 0 ? [{ site, missing }] : [];
  });
}

export type SeriesGrouping = "condition" | "phase";

export interface TimeSeries {
  groups: string[];
  rows: ({ t: number } & Record<string, number>)[];
}

/** 그래프용 시계열. 결측은 점을 찍지 않고, 항목·단위가 다른 값은 섞지 않습니다. */
export function buildTimeSeries(
  records: Measurement[],
  metric: string,
  unit: string,
  grouping: SeriesGrouping,
): TimeSeries {
  const usable = records.filter(
    (r) =>
      r.metric === metric &&
      r.unit === unit &&
      r.value !== null &&
      !Number.isNaN(new Date(r.measuredAt).getTime()),
  );
  const order: readonly string[] = grouping === "condition" ? CONDITIONS : PHASES;
  const present = new Set(usable.map((r) => r[grouping] as string));
  const groups = order.filter((group) => present.has(group));

  const byTime = new Map<number, { t: number } & Record<string, number>>();
  for (const record of usable) {
    const t = new Date(record.measuredAt).getTime();
    const row = byTime.get(t) ?? ({ t } as { t: number } & Record<string, number>);
    // 같은 시각·같은 묶음의 반복 측정은 그 평균으로 그립니다.
    const key = record[grouping] as string;
    const countKey = `__n_${key}`;
    const n = (row[countKey] ?? 0) + 1;
    row[key] = ((row[key] ?? 0) * (n - 1) + (record.value as number)) / n;
    row[countKey] = n;
    byTime.set(t, row);
  }
  return { groups, rows: [...byTime.values()].sort((a, b) => a.t - b.t) };
}

export interface ExperimentStatus {
  metric: string;
  unit: string;
  recordCount: number;
  observedCount: number;
  status: "기록 있음" | "기록 없음";
}

/** 연구 기록 화면용. 기록이 없는 항목은 "실시함"이라고 표현하지 않습니다. */
export function experimentStatus(records: Measurement[]): ExperimentStatus[] {
  return METRICS.filter((metric) => metric.label !== CUSTOM_METRIC).map((metric) => {
    const matching = records.filter((r) => r.metric === metric.label);
    const observedCount = matching.filter((r) => r.value !== null).length;
    return {
      metric: metric.label,
      unit: metric.unit,
      recordCount: matching.length,
      observedCount,
      status: observedCount > 0 ? "기록 있음" : "기록 없음",
    };
  });
}
