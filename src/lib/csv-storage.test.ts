import { describe, expect, it } from "vitest";
import {
  buildMeasurementsCsv,
  buildResultsCsv,
  escapeCell,
  HYPOTHETICAL_KIND,
  MEASURED_KIND,
} from "./csv";
import { DEFAULT_RAW_INPUTS, FIELD_SPECS, validateInputs } from "./fields";
import type { Measurement } from "./measurements";
import { calculateAll, SCENARIO_IDS, type ModelInputs } from "./model";
import { createRun } from "./runRecord";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";
import {
  INPUTS_KEY,
  INPUTS_KEY_V1,
  loadInputs,
  loadMeasurements,
  loadNotes,
  loadRuns,
  loadSettings,
  MAX_SAVED_RUNS,
  MEASUREMENTS_BACKUP_KEY,
  MEASUREMENTS_KEY,
  NOTES_KEY,
  RUNS_KEY,
  saveInputs,
  saveMeasurements,
  saveNotes,
  saveRuns,
  saveSettings,
  SETTINGS_KEY,
  type KeyValueStore,
} from "./storage";

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  return { store, data };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
};

const record: Measurement = {
  id: "a",
  measuredAt: "2026-07-15T14:30",
  observer: "테스트, 측정자",
  site: "=SUM(A1)",
  condition: "쿨루프",
  phase: "시공 후",
  metric: "실내 온도",
  value: -1.5,
  unit: "°C",
  instrument: "테스트 기기",
  notes: '따옴표 "메모"',
};

const inputs = validateInputs(DEFAULT_RAW_INPUTS).values as ModelInputs;

describe("escapeCell: CSV 내보내기 안전성", () => {
  it("쉼표와 따옴표를 처리한다", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('a"b')).toBe('"a""b"');
    expect(escapeCell("a\nb")).toBe('"a\nb"');
  });

  it("엑셀 수식 실행을 막는다", () => {
    for (const danger of ["=1+1", "+1", "-1+1", "@cmd", "  =1+1", "\t=1"]) {
      expect(escapeCell(danger).startsWith("'")).toBe(true);
    }
  });

  it("수식 차단과 따옴표 처리가 함께 동작한다", () => {
    expect(escapeCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it("숫자 음수는 그대로 두고, 결측은 빈 칸이다", () => {
    expect(escapeCell(-1.5)).toBe("-1.5");
    expect(escapeCell(null)).toBe("");
  });
});

describe("buildResultsCsv", () => {
  const csv = buildResultsCsv(inputs, calculateAll(inputs));
  const lines = csv.trim().split("\r\n");

  it("엑셀용 BOM으로 시작한다", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("입력값 행과 시나리오별 결과 12행씩을 담는다", () => {
    expect(lines).toHaveLength(1 + FIELD_SPECS.length + SCENARIO_IDS.length * 12);
  });

  it("결과 행은 모두 가정 기반으로 표시하고 측정값이라 부르지 않는다", () => {
    const resultLines = lines.slice(1 + FIELD_SPECS.length);
    expect(resultLines.every((line) => line.startsWith(HYPOTHETICAL_KIND))).toBe(true);
    expect(csv).not.toContain(MEASURED_KIND);
  });

  it("한계 계수가 없으면 숫자를 쓰지 않고 미산정으로 표시한다", () => {
    expect(csv).toContain("추정 온실가스 감축량(한계 계수),미산정");
  });
});

describe("buildMeasurementsCsv", () => {
  it("기록이 없으면 머리글만 있고 지어낸 행이 없다", () => {
    expect(buildMeasurementsCsv([]).trim().split("\r\n")).toHaveLength(1);
  });

  it("사람 측정으로 표시하고 특수문자를 지킨다", () => {
    const csv = buildMeasurementsCsv([record]);
    const row = csv.trim().split("\r\n")[1];
    expect(row.startsWith(MEASURED_KIND)).toBe(true);
    expect(row).toContain('"테스트, 측정자"');
    expect(row).toContain("'=SUM(A1)");
    expect(row).toContain(",-1.5,");
    expect(row).toContain(",시공 후,");
    expect(row).toContain('"따옴표 ""메모"""');
    expect(csv).not.toContain(HYPOTHETICAL_KIND);
  });
});

describe("입력값 저장소", () => {
  it("저장한 값을 그대로 복원한다", () => {
    const { store } = fakeStore();
    const edited = { ...DEFAULT_RAW_INPUTS, factoryCount: "7" };
    expect(saveInputs(store, edited)).toBe(true);
    expect(loadInputs(store)).toEqual(edited);
  });

  it("저장된 값이 없거나 깨졌으면 기본값을 쓴다", () => {
    expect(loadInputs(fakeStore().store)).toEqual(DEFAULT_RAW_INPUTS);
    expect(loadInputs(fakeStore({ [INPUTS_KEY]: "{broken" }).store)).toEqual(DEFAULT_RAW_INPUTS);
  });

  it("문자열이 아닌 값과 모르는 키는 무시한다", () => {
    const { store } = fakeStore({
      [INPUTS_KEY]: JSON.stringify({ factoryCount: 5, evil: "x", subsidyPct: "40" }),
    });
    const loaded = loadInputs(store);
    expect(loaded.factoryCount).toBe(DEFAULT_RAW_INPUTS.factoryCount);
    expect(loaded.subsidyPct).toBe("40");
    expect(loaded).not.toHaveProperty("evil");
  });

  it("이전 버전 입력값을 옮긴다: 이전 기본 지원율 50은 새 기본값으로", () => {
    const { store } = fakeStore({
      [INPUTS_KEY_V1]: JSON.stringify({ factoryCount: "7", subsidyPct: "50" }),
    });
    const loaded = loadInputs(store);
    expect(loaded.factoryCount).toBe("7");
    expect(loaded.subsidyPct).toBe("70");
    expect(loaded.selfConsumptionPct).toBe(DEFAULT_RAW_INPUTS.selfConsumptionPct);
  });

  it("사용자가 고른 이전 지원율은 유지한다", () => {
    const { store } = fakeStore({ [INPUTS_KEY_V1]: JSON.stringify({ subsidyPct: "45" }) });
    expect(loadInputs(store).subsidyPct).toBe("45");
  });

  it("저장소를 쓸 수 없어도 앱이 죽지 않는다", () => {
    expect(loadInputs(brokenStore)).toEqual(DEFAULT_RAW_INPUTS);
    expect(saveInputs(brokenStore, DEFAULT_RAW_INPUTS)).toBe(false);
  });
});

describe("측정 기록 저장소", () => {
  it("처음에는 비어 있다: 미리 넣어 둔 관측값이 없다", () => {
    expect(loadMeasurements(fakeStore().store)).toEqual({ records: [], recovered: false });
  });

  it("저장하고 다시 읽는다", () => {
    const { store } = fakeStore();
    expect(saveMeasurements(store, [record])).toBe(true);
    expect(loadMeasurements(store).records).toEqual([record]);
  });

  it("가정 입력값과 다른 키에 저장한다", () => {
    const { store, data } = fakeStore();
    saveMeasurements(store, [record]);
    saveInputs(store, DEFAULT_RAW_INPUTS);
    expect(data.get(INPUTS_KEY)).not.toContain("실내 온도");
    expect(data.get(MEASUREMENTS_KEY)).not.toContain("factoryCount");
  });

  it("손상된 원본은 지우지 않고 백업한다", () => {
    const { store, data } = fakeStore({ [MEASUREMENTS_KEY]: "{broken" });
    expect(loadMeasurements(store)).toEqual({ records: [], recovered: true });
    expect(data.get(MEASUREMENTS_BACKUP_KEY)).toBe("{broken");
  });

  it("일부만 손상되면 정상 기록은 살리고 원본을 백업한다", () => {
    const raw = JSON.stringify([record, { id: "bad" }]);
    const { store, data } = fakeStore({ [MEASUREMENTS_KEY]: raw });
    const loaded = loadMeasurements(store);
    expect(loaded.records).toEqual([record]);
    expect(loaded.recovered).toBe(true);
    expect(data.get(MEASUREMENTS_BACKUP_KEY)).toBe(raw);
  });
});

describe("설정·실행 기록·메모 저장소", () => {
  it("설정을 복원하고 잘못된 값은 기본값으로 둔다", () => {
    const { store } = fakeStore();
    saveSettings(store, { ...DEFAULT_SETTINGS, randomSeed: "7" });
    expect(loadSettings(store).randomSeed).toBe("7");

    const bad = fakeStore({
      [SETTINGS_KEY]: JSON.stringify({ analysisScenario: "evil", sensitivityMetric: "__proto__" }),
    });
    expect(loadSettings(bad.store).analysisScenario).toBe("combinedSeparate");
    expect(loadSettings(bad.store).sensitivityMetric).toBe("co2ReductionT");
  });

  it("실행 기록을 복원하고 손상된 항목은 버리며 개수를 제한한다", () => {
    const config = parseSettings(DEFAULT_SETTINGS).config!;
    const run = createRun(inputs, config, "r1", new Date("2026-11-07T00:00:00Z"));
    const { store, data } = fakeStore();
    saveRuns(store, Array.from({ length: MAX_SAVED_RUNS + 5 }, () => run));
    expect(loadRuns(store)).toHaveLength(MAX_SAVED_RUNS);

    data.set(RUNS_KEY, JSON.stringify([run, { schema: "nope" }]));
    expect(loadRuns(store)).toHaveLength(1);
    expect(loadRuns(fakeStore({ [RUNS_KEY]: "{broken" }).store)).toEqual([]);
  });

  it("연구 메모는 처음에 비어 있다", () => {
    expect(loadNotes(fakeStore().store)).toEqual({ purpose: "", cautions: "", nextExperiments: "" });
  });

  it("연구 메모를 저장하고 문자열이 아닌 값은 버린다", () => {
    const { store } = fakeStore();
    saveNotes(store, { purpose: "직접 쓴 목적", cautions: "", nextExperiments: "" });
    expect(loadNotes(store).purpose).toBe("직접 쓴 목적");
    const bad = fakeStore({ [NOTES_KEY]: JSON.stringify({ purpose: 3 }) });
    expect(loadNotes(bad.store).purpose).toBe("");
  });
});
