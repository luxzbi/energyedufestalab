import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  isMeasurement,
  summarize,
  validateDraft,
  type Measurement,
  type MeasurementDraft,
} from "./measurements";

const now = new Date("2026-08-01T12:00:00");

/** 검증 로직용 형식 데이터입니다. 실제 관측값이 아닙니다. */
const draft: MeasurementDraft = {
  ...EMPTY_DRAFT,
  measuredAt: "2026-07-15T14:30",
  observer: "테스트 측정자",
  site: "테스트 장소",
  condition: "쿨루프",
  metric: "지붕 표면 온도",
  value: "1",
  instrument: "테스트 기기",
};

const record = (over: Partial<Measurement>): Measurement => ({
  id: "x",
  measuredAt: "2026-07-15T14:30",
  observer: "o",
  site: "s",
  condition: "쿨루프",
  metric: "지붕 표면 온도",
  value: 1,
  unit: "°C",
  instrument: "i",
  notes: "",
  ...over,
});

describe("validateDraft", () => {
  it("빈 양식은 통과할 수 없다", () => {
    const { errors, record: saved } = validateDraft(EMPTY_DRAFT, now);
    expect(saved).toBeNull();
    for (const key of ["measuredAt", "observer", "site", "condition", "metric", "value", "instrument"]) {
      expect(errors).toHaveProperty(key);
    }
  });

  it("미래 시각을 거부한다", () => {
    const { errors } = validateDraft({ ...draft, measuredAt: "2026-08-02T00:00" }, now);
    expect(errors.measuredAt).toContain("미래");
  });

  it("숫자가 아닌 측정값을 거부한다", () => {
    expect(validateDraft({ ...draft, value: "약 30" }, now).errors.value).toBeDefined();
  });

  it("음수와 0은 올바른 측정값이다", () => {
    expect(validateDraft({ ...draft, value: "-2.5" }, now).record?.value).toBe(-2.5);
    expect(validateDraft({ ...draft, value: "0" }, now).record?.value).toBe(0);
  });

  it("정해진 항목의 단위는 항목에서 가져온다", () => {
    expect(validateDraft(draft, now).record?.unit).toBe("°C");
  });

  it("직접 입력 항목은 이름과 단위가 있어야 한다", () => {
    const custom = { ...draft, metric: "기타(직접 입력)" };
    const { errors } = validateDraft(custom, now);
    expect(errors.customMetric).toBeDefined();
    expect(errors.unit).toBeDefined();

    const { record: saved } = validateDraft(
      { ...custom, customMetric: "조도", unit: "lx" },
      now,
    );
    expect(saved?.metric).toBe("조도");
    expect(saved?.unit).toBe("lx");
  });
});

describe("isMeasurement", () => {
  it("형식이 맞는 기록만 통과시킨다", () => {
    expect(isMeasurement(record({}))).toBe(true);
    expect(isMeasurement(null)).toBe(false);
    expect(isMeasurement({ id: "x" })).toBe(false);
    expect(isMeasurement({ ...record({}), value: "1" })).toBe(false);
  });
});

describe("summarize", () => {
  it("기록이 없으면 요약도 없다", () => {
    expect(summarize([])).toEqual([]);
  });

  it("같은 항목·단위·조건끼리 평균을 낸다", () => {
    const [summary] = summarize([record({ value: 1 }), record({ value: 3 })]);
    expect(summary).toMatchObject({ count: 2, mean: 2, min: 1, max: 3 });
  });

  it("단위나 조건이 다르면 섞지 않는다", () => {
    const summaries = summarize([
      record({ unit: "°C" }),
      record({ unit: "K" }),
      record({ condition: "기타" }),
    ]);
    expect(summaries).toHaveLength(3);
  });
});
