import { describe, expect, it } from "vitest";
import { buildMeasurementsCsv } from "./csv";
import {
  buildTimeSeries,
  comparePhases,
  computeStats,
  EMPTY_DRAFT,
  experimentStatus,
  missingControls,
  normalizeMeasurement,
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
  phase: "구분 없음",
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
    expect(validateDraft({ ...draft, metric: "일사량" }, now).record?.unit).toBe("W/m²");
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

describe("결측 측정값", () => {
  const missing = { ...draft, value: "", missing: "yes", notes: "센서 고장" };

  it("결측은 0이 아니라 null로 저장한다", () => {
    expect(validateDraft(missing, now).record?.value).toBeNull();
  });

  it("결측에는 사유가 필요하고 값을 함께 쓸 수 없다", () => {
    expect(validateDraft({ ...missing, notes: "" }, now).errors.notes).toBeDefined();
    expect(validateDraft({ ...missing, value: "3" }, now).errors.value).toBeDefined();
  });

  it("통계에서 빼고 개수만 따로 센다", () => {
    expect(computeStats([1, null, 3])).toMatchObject({
      count: 2,
      missingCount: 1,
      mean: 2,
      min: 1,
      max: 3,
    });
  });

  it("모두 결측이면 평균을 지어내지 않는다", () => {
    expect(computeStats([null, null])).toEqual({
      count: 0,
      missingCount: 2,
      mean: null,
      stdDev: null,
      min: null,
      max: null,
    });
  });

  it("그래프에 점을 찍지 않는다", () => {
    const series = buildTimeSeries(
      [record({ value: null }), record({ value: 5, measuredAt: "2026-07-16T14:30" })],
      "지붕 표면 온도",
      "°C",
      "condition",
    );
    expect(series.rows).toHaveLength(1);
    expect(series.rows[0]["쿨루프"]).toBe(5);
  });

  it("CSV에는 빈 칸과 결측 표시로 나간다", () => {
    const row = buildMeasurementsCsv([record({ value: null, notes: "센서 고장" })])
      .trim()
      .split("\r\n")[1];
    expect(row).toContain("°C,결측,");
    expect(row).toContain("지붕 표면 온도,,°C");
  });
});

describe("표준편차", () => {
  it("표본표준편차(n−1)를 쓴다", () => {
    // 2, 4, 4, 4, 5, 5, 7, 9의 표본표준편차 = √(32/7)
    expect(computeStats([2, 4, 4, 4, 5, 5, 7, 9]).stdDev).toBeCloseTo(Math.sqrt(32 / 7));
  });

  it("측정이 1회면 표준편차를 계산하지 않는다", () => {
    expect(computeStats([5]).stdDev).toBeNull();
    expect(computeStats([5]).mean).toBe(5);
  });
});

describe("normalizeMeasurement", () => {
  it("형식이 맞는 기록만 통과시킨다", () => {
    expect(normalizeMeasurement(record({}))).toEqual(record({}));
    expect(normalizeMeasurement(null)).toBeNull();
    expect(normalizeMeasurement({ id: "x" })).toBeNull();
    expect(normalizeMeasurement({ ...record({}), value: "1" })).toBeNull();
    expect(normalizeMeasurement({ ...record({}), value: Number.NaN })).toBeNull();
  });

  it("이전 버전 기록은 시점이 없어도 살리고 '구분 없음'으로 둔다", () => {
    const old: Partial<Measurement> = record({ value: 3 });
    delete old.phase;
    expect(normalizeMeasurement(old)?.phase).toBe("구분 없음");
    expect(normalizeMeasurement(old)?.value).toBe(3);
  });

  it("모르는 필드는 버린다", () => {
    expect(normalizeMeasurement({ ...record({}), injected: "x" })).not.toHaveProperty("injected");
  });
});

describe("summarize", () => {
  it("기록이 없으면 요약도 없다", () => {
    expect(summarize([])).toEqual([]);
  });

  it("같은 항목·단위·조건끼리 평균과 표준편차를 낸다", () => {
    const [summary] = summarize([record({ value: 1 }), record({ value: 3 })]);
    expect(summary).toMatchObject({ count: 2, mean: 2, min: 1, max: 3 });
    expect(summary.stdDev).toBeCloseTo(Math.SQRT2);
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

describe("시공 전후 비교", () => {
  const rows = comparePhases([
    record({ phase: "시공 전", value: 10 }),
    record({ phase: "시공 전", value: 12 }),
    record({ phase: "시공 후", value: 7 }),
    record({ phase: "구분 없음", value: 100 }),
  ]);

  it("평균 차이 = 시공 후 평균 − 시공 전 평균", () => {
    expect(rows).toHaveLength(1);
    expect(rows[0].before.mean).toBe(11);
    expect(rows[0].after.mean).toBe(7);
    expect(rows[0].meanDifference).toBe(-4);
  });

  it("한쪽 시점 값이 없으면 차이를 계산하지 않는다", () => {
    const [row] = comparePhases([record({ phase: "시공 전", value: 10 })]);
    expect(row.meanDifference).toBeNull();
    const [allMissing] = comparePhases([
      record({ phase: "시공 전", value: 10 }),
      record({ phase: "시공 후", value: null }),
    ]);
    expect(allMissing.meanDifference).toBeNull();
    expect(allMissing.after.missingCount).toBe(1);
  });

  it("장소나 단위가 다르면 비교하지 않는다", () => {
    const separated = comparePhases([
      record({ phase: "시공 전", site: "A" }),
      record({ phase: "시공 후", site: "B" }),
    ]);
    expect(separated).toHaveLength(2);
    expect(separated.every((row) => row.meanDifference === null)).toBe(true);
  });

  it("외기 온도와 일사량이 전후로 없으면 알린다", () => {
    expect(missingControls(rows)).toEqual([{ site: "s", missing: ["외기 온도", "일사량"] }]);
    const controlled = comparePhases([
      record({ phase: "시공 전", value: 10 }),
      record({ phase: "시공 후", value: 8 }),
      record({ phase: "시공 전", metric: "외기 온도" }),
      record({ phase: "시공 후", metric: "외기 온도" }),
      record({ phase: "시공 전", metric: "일사량", unit: "W/m²" }),
      record({ phase: "시공 후", metric: "일사량", unit: "W/m²" }),
    ]);
    expect(missingControls(controlled)).toEqual([]);
  });

  it("결과에 냉방 절감률이나 전력량을 만들어 넣지 않는다", () => {
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["after", "before", "meanDifference", "metric", "site", "unit"].sort(),
    );
    expect(JSON.stringify(rows)).not.toMatch(/saving|kwh|절감/i);
  });
});

describe("시계열", () => {
  it("항목과 단위가 맞는 기록만 시간순으로 놓는다", () => {
    const series = buildTimeSeries(
      [
        record({ measuredAt: "2026-07-16T10:00", value: 2, condition: "기준 지붕(처리 없음)" }),
        record({ measuredAt: "2026-07-15T10:00", value: 1 }),
        record({ measuredAt: "2026-07-15T10:00", value: 50, metric: "실내 온도" }),
      ],
      "지붕 표면 온도",
      "°C",
      "condition",
    );
    expect(series.groups).toEqual(["기준 지붕(처리 없음)", "쿨루프"]);
    expect(series.rows).toHaveLength(2);
    expect(series.rows[0]["쿨루프"]).toBe(1);
  });

  it("같은 시각의 반복 측정은 평균으로 그린다", () => {
    const series = buildTimeSeries(
      [record({ value: 2 }), record({ value: 4 })],
      "지붕 표면 온도",
      "°C",
      "condition",
    );
    expect(series.rows[0]["쿨루프"]).toBe(3);
  });
});

describe("실험 상태", () => {
  it("기록이 없으면 '기록 없음'이고 실시했다고 표시하지 않는다", () => {
    const status = experimentStatus([]);
    expect(status.every((item) => item.status === "기록 없음")).toBe(true);
    expect(JSON.stringify(status)).not.toContain("실시");
  });

  it("결측만 있는 항목은 값이 없으므로 기록 없음이다", () => {
    const status = experimentStatus([record({ value: null })]);
    const item = status.find((s) => s.metric === "지붕 표면 온도");
    expect(item?.recordCount).toBe(1);
    expect(item?.status).toBe("기록 없음");
  });

  it("값이 있으면 기록 있음이다", () => {
    const status = experimentStatus([record({ value: 1 })]);
    expect(status.find((s) => s.metric === "지붕 표면 온도")?.status).toBe("기록 있음");
  });
});
