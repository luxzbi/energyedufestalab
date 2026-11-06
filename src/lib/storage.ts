import { DEFAULT_RAW_INPUTS, type RawInputs } from "./fields";
import { isMeasurement, type Measurement } from "./measurements";

/**
 * 모든 데이터는 이 브라우저의 localStorage에만 저장합니다.
 * 테스트에서 가짜 저장소를 넣을 수 있도록 저장소를 인자로 받습니다.
 */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export const INPUTS_KEY = "energy-shield-lab:inputs:v1";
export const MEASUREMENTS_KEY = "energy-shield-lab:measurements:v1";
export const MEASUREMENTS_BACKUP_KEY = "energy-shield-lab:measurements:backup";

export function loadInputs(store: KeyValueStore): RawInputs {
  try {
    const parsed: unknown = JSON.parse(store.getItem(INPUTS_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_RAW_INPUTS };
    }
    const saved = parsed as Record<string, unknown>;
    // 알고 있는 키만 복원합니다. 문자열이 아니면 기본값을 씁니다.
    const merged = { ...DEFAULT_RAW_INPUTS };
    for (const key of Object.keys(merged) as (keyof RawInputs)[]) {
      const value = saved[key];
      if (typeof value === "string") merged[key] = value;
    }
    return merged;
  } catch {
    return { ...DEFAULT_RAW_INPUTS };
  }
}

export function saveInputs(store: KeyValueStore, inputs: RawInputs): boolean {
  try {
    store.setItem(INPUTS_KEY, JSON.stringify(inputs));
    return true;
  } catch {
    return false;
  }
}

export interface LoadedMeasurements {
  records: Measurement[];
  /** 읽지 못한 원본이 있어 백업 키로 옮겼으면 true */
  recovered: boolean;
}

/**
 * 측정 기록은 다시 만들 수 없는 데이터입니다.
 * 손상된 내용을 발견하면 버리지 않고 원본 문자열을 백업 키에 남깁니다.
 */
export function loadMeasurements(store: KeyValueStore): LoadedMeasurements {
  let raw: string | null = null;
  try {
    raw = store.getItem(MEASUREMENTS_KEY);
    if (raw === null) return { records: [], recovered: false };

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");

    const records = parsed.filter(isMeasurement);
    if (records.length !== parsed.length) backUp(store, raw);
    return { records, recovered: records.length !== parsed.length };
  } catch {
    if (raw !== null) backUp(store, raw);
    return { records: [], recovered: raw !== null };
  }
}

function backUp(store: KeyValueStore, raw: string) {
  try {
    store.setItem(MEASUREMENTS_BACKUP_KEY, raw);
  } catch {
    // 저장 공간이 없으면 백업도 할 수 없습니다. 화면에는 복구 경고를 표시합니다.
  }
}

export function saveMeasurements(
  store: KeyValueStore,
  records: Measurement[],
): boolean {
  try {
    store.setItem(MEASUREMENTS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
