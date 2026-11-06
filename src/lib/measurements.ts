/**
 * 사람이 직접 측정한 값의 기록.
 * 이 모듈은 계산 엔진(model.ts)을 가져오지 않습니다. 측정값이 가정 계산에 몰래
 * 섞이거나 계산값이 측정값처럼 보이는 일을 구조적으로 막기 위해서입니다.
 * 샘플 데이터도 일부러 두지 않습니다. 기록은 사용자가 입력하기 전까지 비어 있습니다.
 */
import { parseNumber } from "./fields";

export const CONDITIONS = [
  "기준 지붕(처리 없음)",
  "쿨루프",
  "태양광",
  "쿨루프 + 태양광",
  "기타",
] as const;

export const METRICS = [
  { label: "지붕 표면 온도", unit: "°C" },
  { label: "실내 온도", unit: "°C" },
  { label: "외기 온도", unit: "°C" },
  { label: "냉방 전력량", unit: "kWh" },
  { label: "태양광 발전량", unit: "kWh" },
  { label: "기타(직접 입력)", unit: "" },
] as const;

export const CUSTOM_METRIC = "기타(직접 입력)";

export interface Measurement {
  id: string;
  /** 측정 일시 (예: 2026-07-15T14:30) */
  measuredAt: string;
  observer: string;
  site: string;
  condition: string;
  metric: string;
  value: number;
  unit: string;
  instrument: string;
  notes: string;
}

export interface MeasurementDraft {
  measuredAt: string;
  observer: string;
  site: string;
  condition: string;
  metric: string;
  customMetric: string;
  value: string;
  unit: string;
  instrument: string;
  notes: string;
}

export const EMPTY_DRAFT: MeasurementDraft = {
  measuredAt: "",
  observer: "",
  site: "",
  condition: "",
  metric: "",
  customMetric: "",
  value: "",
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

  const preset = METRICS.find((metric) => metric.label === draft.metric);
  if (!preset) errors.metric = "측정 항목을 선택하세요.";

  const isCustom = draft.metric === CUSTOM_METRIC;
  if (isCustom && !draft.customMetric.trim())
    errors.customMetric = "항목 이름을 입력하세요.";

  const unit = isCustom ? draft.unit.trim() : (preset?.unit ?? "");
  if (isCustom && !unit) errors.unit = "단위를 입력하세요.";

  const valueText = draft.value.trim();
  if (!valueText) errors.value = "측정값을 입력하세요.";
  else if (parseNumber(valueText) === null)
    errors.value = "쉼표 없이 숫자만 입력하세요.";

  if (!draft.instrument.trim()) errors.instrument = "측정 기기를 입력하세요.";

  if (Object.keys(errors).length > 0) return { errors, record: null };

  return {
    errors,
    record: {
      measuredAt: draft.measuredAt,
      observer: draft.observer.trim(),
      site: draft.site.trim(),
      condition: draft.condition,
      metric: isCustom ? draft.customMetric.trim() : draft.metric,
      value: Number(valueText),
      unit,
      instrument: draft.instrument.trim(),
      notes: draft.notes.trim(),
    },
  };
}

/** 저장소에서 읽은 알 수 없는 값이 올바른 기록인지 확인합니다. */
export function isMeasurement(value: unknown): value is Measurement {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.value === "number" &&
    Number.isFinite(record.value) &&
    [
      "id",
      "measuredAt",
      "observer",
      "site",
      "condition",
      "metric",
      "unit",
      "instrument",
      "notes",
    ].every((key) => typeof record[key] === "string")
  );
}

export interface MeasurementSummary {
  metric: string;
  unit: string;
  condition: string;
  count: number;
  mean: number;
  min: number;
  max: number;
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
    .map((group) => {
      const numbers = group.map((record) => record.value);
      return {
        metric: group[0].metric,
        unit: group[0].unit,
        condition: group[0].condition,
        count: group.length,
        mean: numbers.reduce((sum, n) => sum + n, 0) / numbers.length,
        min: Math.min(...numbers),
        max: Math.max(...numbers),
      };
    })
    .sort(
      (a, b) =>
        a.metric.localeCompare(b.metric, "ko") ||
        a.condition.localeCompare(b.condition, "ko"),
    );
}
