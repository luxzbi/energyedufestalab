import { describe, expect, it } from "vitest";
import {
  buildMeasurementsCsv,
  buildResultsCsv,
  escapeCell,
  HYPOTHETICAL_KIND,
  MEASURED_KIND,
} from "./csv";
import { DEFAULT_RAW_INPUTS, validateInputs } from "./fields";
import type { Measurement } from "./measurements";
import { calculateAll } from "./model";
import {
  INPUTS_KEY,
  loadInputs,
  loadMeasurements,
  MEASUREMENTS_BACKUP_KEY,
  MEASUREMENTS_KEY,
  saveInputs,
  saveMeasurements,
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
  metric: "실내 온도",
  value: -1.5,
  unit: "°C",
  instrument: "테스트 기기",
  notes: '따옴표 "메모"',
};

describe("escapeCell", () => {
  it("쉼표와 따옴표를 처리한다", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('a"b')).toBe('"a""b"');
    expect(escapeCell("a\nb")).toBe('"a\nb"');
  });

  it("엑셀 수식 실행을 막는다", () => {
    expect(escapeCell("=1+1")).toBe("'=1+1");
    expect(escapeCell("@cmd")).toBe("'@cmd");
  });

  it("숫자 음수는 그대로 둔다", () => {
    expect(escapeCell(-1.5)).toBe("-1.5");
  });
});

describe("buildResultsCsv", () => {
  const inputs = validateInputs(DEFAULT_RAW_INPUTS).values!;
  const csv = buildResultsCsv(inputs, calculateAll(inputs));
  const lines = csv.trim().split("\r\n");

  it("엑셀용 BOM으로 시작한다", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("입력값 11행과 시나리오별 결과 6행씩을 담는다", () => {
    expect(lines).toHaveLength(1 + 11 + 3 * 6);
  });

  it("결과 행은 모두 가정 계산으로 표시하고 측정값이라 부르지 않는다", () => {
    const resultLines = lines.slice(12);
    expect(resultLines.every((line) => line.startsWith(HYPOTHETICAL_KIND))).toBe(true);
    expect(csv).not.toContain(MEASURED_KIND);
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
