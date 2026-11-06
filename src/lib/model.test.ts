import { describe, expect, it } from "vitest";
import { DEFAULT_RAW_INPUTS, validateInputs } from "./fields";
import { buildFormulaSteps } from "./formulas";
import {
  calculateAll,
  overlapCorrection,
  sweepCo2,
  type ModelInputs,
} from "./model";

/** 손으로 검산하기 쉬운 숫자들입니다. */
const inputs: ModelInputs = {
  factoryCount: 10,
  avgRoofAreaM2: 1000,
  usableSolarPct: 50,
  pvDensityKwPerM2: 0.1,
  solarYieldKwhPerKw: 1000,
  coolingBaselineKwhPerM2: 20,
  coolingSavingPct: 10,
  coolRoofCostKrwPerM2: 10000,
  pvCostKrwPerKw: 1000000,
  subsidyPct: 25,
  emissionFactorTPerMwh: 0.5,
};

describe("쿨루프 단독", () => {
  const r = calculateAll(inputs).coolRoof;

  it("지붕 전체를 시공하고 태양광은 없다", () => {
    expect(r.coatedAreaM2).toBe(10000);
    expect(r.pvCapacityKw).toBe(0);
    expect(r.solarGeneratedKwh).toBe(0);
  });

  it("냉방 절감량 = 10,000m² × 20kWh/m² × 10%", () => {
    expect(r.coolingSavedKwh).toBeCloseTo(20000);
  });

  it("비용과 CO2를 손 계산과 맞춘다", () => {
    expect(r.totalCostKrw).toBe(100_000_000);
    expect(r.municipalCostKrw).toBe(25_000_000);
    expect(r.ownerCostKrw).toBe(75_000_000);
    expect(r.co2ReductionT).toBeCloseTo(10); // 20 MWh × 0.5
  });
});

describe("태양광 단독", () => {
  const r = calculateAll(inputs).solarPv;

  it("면적 → 용량 → 발전량 순서로 계산한다", () => {
    expect(r.pvAreaM2).toBe(5000);
    expect(r.pvCapacityKw).toBeCloseTo(500);
    expect(r.solarGeneratedKwh).toBeCloseTo(500000);
  });

  it("쿨루프 효과와 비용은 0이다", () => {
    expect(r.coolingSavedKwh).toBe(0);
    expect(r.coolRoofCostKrw).toBe(0);
  });

  it("CO2 감축량 = 500MWh × 0.5", () => {
    expect(r.co2ReductionT).toBeCloseTo(250);
  });
});

describe("결합: 같은 면적을 두 번 세지 않는다", () => {
  const all = calculateAll(inputs);
  const r = all.combined;

  it("쿨루프는 패널이 없는 면적에만 시공한다", () => {
    expect(r.coatedAreaM2).toBe(5000);
    expect(r.coolingSavedKwh).toBeCloseTo(10000);
    expect(r.coolRoofCostKrw).toBe(50_000_000);
  });

  it("쿨루프 면적과 태양광 면적의 합은 전체 지붕과 같다", () => {
    expect(r.coatedAreaM2 + r.pvAreaM2).toBe(10000);
  });

  it("단순 합산이 과대평가하는 만큼을 계산한다", () => {
    const overlap = overlapCorrection(all);
    expect(overlap.naiveCoolingKwh).toBeCloseTo(20000);
    expect(overlap.coolingOverstatedKwh).toBeCloseTo(10000);
    expect(overlap.costOverstatedKrw).toBe(50_000_000);
  });

  it("설치 가능 면적이 100%이면 태양광 단독과 같아진다", () => {
    const full = calculateAll({ ...inputs, usableSolarPct: 100 });
    expect(full.combined.coatedAreaM2).toBe(0);
    expect(full.combined.co2ReductionT).toBeCloseTo(full.solarPv.co2ReductionT);
    expect(full.combined.totalCostKrw).toBeCloseTo(full.solarPv.totalCostKrw);
  });

  it("설치 가능 면적이 0%이면 쿨루프 단독과 같아진다", () => {
    const none = calculateAll({ ...inputs, usableSolarPct: 0 });
    expect(none.combined.co2ReductionT).toBeCloseTo(none.coolRoof.co2ReductionT);
    expect(none.combined.totalCostKrw).toBe(none.coolRoof.totalCostKrw);
  });
});

describe("항상 성립해야 하는 관계", () => {
  const variants: Partial<ModelInputs>[] = [
    {},
    { subsidyPct: 0 },
    { subsidyPct: 100 },
    { subsidyPct: 33.3, usableSolarPct: 37.5 },
    { coolingSavingPct: 0 },
  ];

  it("지자체 부담 + 소유주 부담 = 총사업비", () => {
    for (const change of variants) {
      for (const r of Object.values(calculateAll({ ...inputs, ...change }))) {
        expect(r.municipalCostKrw + r.ownerCostKrw).toBeCloseTo(r.totalCostKrw);
      }
    }
  });

  it("배출계수를 2배로 하면 CO2 감축량도 2배다", () => {
    const base = calculateAll(inputs).combined.co2ReductionT;
    const doubled = calculateAll({ ...inputs, emissionFactorTPerMwh: 1 }).combined
      .co2ReductionT;
    expect(doubled).toBeCloseTo(base * 2);
  });

  it("공장 수를 2배로 하면 에너지와 비용도 2배다", () => {
    const base = calculateAll(inputs).combined;
    const doubled = calculateAll({ ...inputs, factoryCount: 20 }).combined;
    expect(doubled.solarGeneratedKwh).toBeCloseTo(base.solarGeneratedKwh * 2);
    expect(doubled.coolingSavedKwh).toBeCloseTo(base.coolingSavedKwh * 2);
    expect(doubled.totalCostKrw).toBeCloseTo(base.totalCostKrw * 2);
  });

  it("보조율은 부담 배분만 바꾸고 총사업비와 CO2는 바꾸지 않는다", () => {
    const low = calculateAll({ ...inputs, subsidyPct: 10 }).combined;
    const high = calculateAll({ ...inputs, subsidyPct: 90 }).combined;
    expect(high.totalCostKrw).toBeCloseTo(low.totalCostKrw);
    expect(high.co2ReductionT).toBeCloseTo(low.co2ReductionT);
    expect(high.ownerCostKrw).toBeLessThan(low.ownerCostKrw);
  });
});

describe("민감도 분석", () => {
  const rows = sweepCo2(inputs, "coolingSavingPct", 0, 50, 5);

  it("구간 양 끝을 포함한다", () => {
    expect(rows).toHaveLength(6);
    expect(rows[0].x).toBe(0);
    expect(rows[5].x).toBe(50);
  });

  it("절감률이 바뀌어도 태양광 단독 값은 그대로다", () => {
    expect(rows[0].solarPv).toBeCloseTo(rows[5].solarPv);
    expect(rows[5].coolRoof).toBeGreaterThan(rows[0].coolRoof);
  });

  it("원래 입력값을 변경하지 않는다", () => {
    expect(inputs.coolingSavingPct).toBe(10);
  });
});

describe("계산 과정 표시", () => {
  it("표시되는 최종 수치가 계산 엔진의 결과와 일치한다", () => {
    const result = calculateAll(inputs).combined;
    const steps = buildFormulaSteps(inputs, "combined", result);
    expect(steps).toHaveLength(8);
    expect(steps[2].substituted).toContain("5,000");
    expect(steps[7].substituted).toContain("255");
  });
});

describe("기본값", () => {
  it("모두 검증을 통과한다", () => {
    const { values, errors } = validateInputs(DEFAULT_RAW_INPUTS);
    expect(errors).toEqual({});
    expect(values).not.toBeNull();
  });

  it("문서에 적은 태양광 환산식과 일치한다: 8,760시간 × 15%", () => {
    expect(Number(DEFAULT_RAW_INPUTS.solarYieldKwhPerKw)).toBeCloseTo(8760 * 0.15);
  });
});
