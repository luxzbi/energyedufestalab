import { DEFAULT_RAW_INPUTS, type RawInputs } from "./fields";
import { normalizeMeasurement, type Measurement } from "./measurements";
import { parseRun, type RunRecord } from "./runRecord";
import { normalizeSettings, type LabSettings } from "./settings";

/**
 * 모든 데이터는 이 브라우저의 localStorage에만 저장합니다.
 * 가정 입력값, 측정 기록, 실행 기록, 연구 메모는 서로 다른 키에 따로 저장합니다.
 * 테스트에서 가짜 저장소를 넣을 수 있도록 저장소를 인자로 받습니다.
 */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export const INPUTS_KEY_V1 = "energy-shield-lab:inputs:v1";
export const INPUTS_KEY = "energy-shield-lab:inputs:v2";
export const SETTINGS_KEY = "energy-shield-lab:settings:v1";
export const MEASUREMENTS_KEY = "energy-shield-lab:measurements:v1";
export const MEASUREMENTS_BACKUP_KEY = "energy-shield-lab:measurements:backup";
export const RUNS_KEY = "energy-shield-lab:runs:v1";
export const NOTES_KEY = "energy-shield-lab:research-notes:v1";

export const MAX_SAVED_RUNS = 30;

function write(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function read(store: KeyValueStore, key: string): unknown {
  try {
    return JSON.parse(store.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/** 알고 있는 키만 복원합니다. 문자열이 아니면 기본값을 씁니다. */
function mergeInputs(parsed: unknown): RawInputs {
  const merged = { ...DEFAULT_RAW_INPUTS };
  if (typeof parsed !== "object" || parsed === null) return merged;
  const saved = parsed as Record<string, unknown>;
  for (const key of Object.keys(merged) as (keyof RawInputs)[]) {
    const value = saved[key];
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

export function loadInputs(store: KeyValueStore): RawInputs {
  const current = read(store, INPUTS_KEY);
  if (current !== null) return mergeInputs(current);

  // 이전 버전의 입력값을 옮깁니다. 이전 기본 지원율 50은 사용자가 고른 값이 아니므로 새 기본값을 씁니다.
  const old = read(store, INPUTS_KEY_V1);
  const merged = mergeInputs(old);
  if ((old as { subsidyPct?: unknown } | null)?.subsidyPct === "50") {
    merged.subsidyPct = DEFAULT_RAW_INPUTS.subsidyPct;
  }
  return merged;
}

export const saveInputs = (store: KeyValueStore, inputs: RawInputs) =>
  write(store, INPUTS_KEY, inputs);

export const loadSettings = (store: KeyValueStore): LabSettings =>
  normalizeSettings(read(store, SETTINGS_KEY));

export const saveSettings = (store: KeyValueStore, settings: LabSettings) =>
  write(store, SETTINGS_KEY, settings);

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

    const records = parsed
      .map(normalizeMeasurement)
      .filter((record): record is Measurement => record !== null);
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

export const saveMeasurements = (store: KeyValueStore, records: Measurement[]) =>
  write(store, MEASUREMENTS_KEY, records);

export function loadRuns(store: KeyValueStore): RunRecord[] {
  const parsed = read(store, RUNS_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => parseRun(item).run)
    .filter((run): run is RunRecord => run !== null);
}

export const saveRuns = (store: KeyValueStore, runs: RunRecord[]) =>
  write(store, RUNS_KEY, runs.slice(0, MAX_SAVED_RUNS));

/** 사용자가 직접 쓴 연구 메모. 자동으로 내용을 채우지 않습니다. */
export interface ResearchNotes {
  purpose: string;
  cautions: string;
  nextExperiments: string;
}

export const EMPTY_NOTES: ResearchNotes = {
  purpose: "",
  cautions: "",
  nextExperiments: "",
};

export function loadNotes(store: KeyValueStore): ResearchNotes {
  const parsed = read(store, NOTES_KEY);
  if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_NOTES };
  const saved = parsed as Record<string, unknown>;
  const text = (key: keyof ResearchNotes) =>
    typeof saved[key] === "string" ? (saved[key] as string) : "";
  return {
    purpose: text("purpose"),
    cautions: text("cautions"),
    nextExperiments: text("nextExperiments"),
  };
}

export const saveNotes = (store: KeyValueStore, notes: ResearchNotes) =>
  write(store, NOTES_KEY, notes);
