import { describe, expect, it } from "vitest";
import { DEFAULT_RAW_INPUTS, validateInputs } from "./fields";
import { buildFormulaSteps } from "./formulas";
import {
  calculateAll,
  calculateScenario,
  installationAreaDifference,
  SCENARIO_IDS,
  sweepCo2,
  type ModelInputs,
} from "./model";

/** 손으로 검산하기 쉬운 숫자들입니다. */
export const inputs: ModelInputs = {
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
  selfConsumptionPct: 80,
  exportCreditPct: 100,
  emissionFactorTPerMwh: 0.5,
  marginalEmissionFactorTPerMwh: null,
};

describe("C-1 쿨루프 단독", () => {
  const r = calculateAll(inputs).coolRoof;

  it("지붕 전체를 시공하고 태양광은 없다", () => {
    expect(r.coatedAreaM2).toBe(10000);
    expect(r.creditedCoolRoofAreaM2).toBe(10000);
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

describe("C-2 태양광 단독", () => {
  const r = calculateAll(inputs).solarPv;

  it("면적 → 용량 → 발전량 순서로 계산한다. 단위: m² × kW/m² × kWh/kW = kWh", () => {
    expect(r.pvAreaM2).toBe(5000);
    expect(r.pvCapacityKw).toBeCloseTo(500);
    expect(r.solarGeneratedKwh).toBeCloseTo(500000);
  });

  it("쿨루프 효과와 비용은 0이다", () => {
    expect(r.coolingSavedKwh).toBe(0);
    expect(r.coolRoofCostKrw).toBe(0);
  });

  it("배출계수 단위: 500MWh × 0.5tCO2eq/MWh = 250tCO2eq (kWh를 1,000으로 나눔)", () => {
    expect(r.co2ReductionT).toBeCloseTo(250);
  });
});

describe("A 분리 설치형", () => {
  const r = calculateAll(inputs).combinedSeparate;

  it("쿨루프는 패널이 없는 면적에만 시공한다", () => {
    expect(r.coatedAreaM2).toBe(5000);
    expect(r.creditedCoolRoofAreaM2).toBe(5000);
    expect(r.uncreditedCoatedAreaM2).toBe(0);
    expect(r.coolingSavedKwh).toBeCloseTo(10000);
    expect(r.coolRoofCostKrw).toBe(50_000_000);
  });

  it("쿨루프 면적과 태양광 면적의 합은 전체 지붕과 같다", () => {
    expect(r.coatedAreaM2 + r.pvAreaM2).toBe(10000);
  });

  it("설치 가능 면적이 100%이면 태양광 단독과 같아진다", () => {
    const full = calculateAll({ ...inputs, usableSolarPct: 100 });
    expect(full.combinedSeparate.coatedAreaM2).toBe(0);
    expect(full.combinedSeparate.co2ReductionT).toBeCloseTo(full.solarPv.co2ReductionT);
    expect(full.combinedSeparate.totalCostKrw).toBeCloseTo(full.solarPv.totalCostKrw);
  });

  it("설치 가능 면적이 0%이면 쿨루프 단독과 같아진다", () => {
    const none = calculateAll({ ...inputs, usableSolarPct: 0 });
    expect(none.combinedSeparate.co2ReductionT).toBeCloseTo(none.coolRoof.co2ReductionT);
    expect(none.combinedSeparate.totalCostKrw).toBe(none.coolRoof.totalCostKrw);
  });
});

describe("B 전체 쿨루프 + 태양광형", () => {
  const all = calculateAll(inputs);
  const b = all.combinedFullCoat;

  it("시공비는 지붕 전체로 계산한다", () => {
    expect(b.coatedAreaM2).toBe(10000);
    expect(b.coolRoofCostKrw).toBe(100_000_000);
  });

  it("패널 하부 효과를 노출 지붕과 같게 계산하지 않고 미산정한다", () => {
    expect(b.uncreditedCoatedAreaM2).toBe(5000);
    expect(b.creditedCoolRoofAreaM2).toBe(5000);
    expect(b.coolingSavedKwh).toBeCloseTo(10000);
    expect(b.coolingSavedKwh).toBeLessThan(all.coolRoof.coolingSavedKwh);
  });

  it("에너지 효과는 A와 같고 비용만 더 든다", () => {
    expect(b.coolingSavedKwh).toBeCloseTo(all.combinedSeparate.coolingSavedKwh);
    expect(b.solarGeneratedKwh).toBeCloseTo(all.combinedSeparate.solarGeneratedKwh);
    expect(b.totalCostKrw).toBeGreaterThan(all.combinedSeparate.totalCostKrw);
  });

  it("시공 면적 = 효과 인정 면적 + 미산정 면적", () => {
    expect(b.creditedCoolRoofAreaM2 + b.uncreditedCoatedAreaM2).toBe(b.coatedAreaM2);
  });
});

describe("설치 면적 가정에 따른 차이", () => {
  it("단독 합과 A, B의 차이를 각각 계산한다", () => {
    const diff = installationAreaDifference(calculateAll(inputs));
    expect(diff.sumCoolingKwh).toBeCloseTo(20000);
    expect(diff.separate.coolingDiffKwh).toBeCloseTo(10000);
    expect(diff.separate.costDiffKrw).toBe(50_000_000);
    expect(diff.fullCoat.coolingDiffKwh).toBeCloseTo(10000);
    expect(diff.fullCoat.costDiffKrw).toBeCloseTo(0);
  });
});

describe("전력 흐름과 탄소: 중복 계산 없음", () => {
  const r = calculateAll(inputs).combinedSeparate;

  it("자가소비 + 역송 = 총발전량", () => {
    expect(r.selfConsumedKwh).toBeCloseTo(400000);
    expect(r.exportedKwh).toBeCloseTo(100000);
    expect(r.selfConsumedKwh + r.exportedKwh).toBeCloseTo(r.solarGeneratedKwh);
  });

  it("구매 감소에는 역송량이 들어가지 않는다", () => {
    expect(r.gridPurchaseReductionKwh).toBeCloseTo(10000 + 400000);
  });

  it("감축량은 각 kWh를 한 번만 센다", () => {
    const totalKwh = r.coolingSavedKwh + r.solarGeneratedKwh;
    expect(r.co2ReductionT).toBeCloseTo((totalKwh / 1000) * 0.5);
    expect(r.co2GridPurchaseT + r.co2ExportT).toBeCloseTo(r.co2ReductionT);
  });

  it("역송을 모두 인정하면 자가소비 비율이 감축량을 바꾸지 않는다", () => {
    const a = calculateScenario({ ...inputs, selfConsumptionPct: 0 }, "solarPv");
    const b = calculateScenario({ ...inputs, selfConsumptionPct: 100 }, "solarPv");
    expect(a.co2ReductionT).toBeCloseTo(b.co2ReductionT);
    expect(a.gridPurchaseReductionKwh).not.toBeCloseTo(b.gridPurchaseReductionKwh);
  });

  it("역송 인정 비율이 0이면 역송분을 뺀다", () => {
    const none = calculateScenario({ ...inputs, exportCreditPct: 0 }, "solarPv");
    expect(none.co2ExportT).toBe(0);
    expect(none.co2ReductionT).toBeCloseTo((400000 / 1000) * 0.5);
  });

  it("한계 계수가 없으면 지어내지 않고 null이다", () => {
    expect(r.co2MarginalT).toBeNull();
  });

  it("한계 계수를 넣으면 같은 전력량으로 따로 계산한다", () => {
    const withMarginal = calculateScenario(
      { ...inputs, marginalEmissionFactorTPerMwh: 1 },
      "solarPv",
    );
    expect(withMarginal.co2MarginalT).toBeCloseTo(500);
    expect(withMarginal.co2ReductionT).toBeCloseTo(250);
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

  it("대전시 부담 + 소유주 부담 = 총사업비", () => {
    for (const change of variants) {
      for (const r of Object.values(calculateAll({ ...inputs, ...change }))) {
        expect(r.municipalCostKrw + r.ownerCostKrw).toBeCloseTo(r.totalCostKrw);
      }
    }
  });

  it("배출계수를 2배로 하면 CO2 감축량도 2배다", () => {
    const base = calculateAll(inputs).combinedSeparate.co2ReductionT;
    const doubled = calculateAll({ ...inputs, emissionFactorTPerMwh: 1 }).combinedSeparate
      .co2ReductionT;
    expect(doubled).toBeCloseTo(base * 2);
  });

  it("공장 수를 2배로 하면 면적, 발전량, 비용도 2배다", () => {
    for (const id of SCENARIO_IDS) {
      const base = calculateScenario(inputs, id);
      const doubled = calculateScenario({ ...inputs, factoryCount: 20 }, id);
      expect(doubled.coatedAreaM2).toBeCloseTo(base.coatedAreaM2 * 2);
      expect(doubled.pvAreaM2).toBeCloseTo(base.pvAreaM2 * 2);
      expect(doubled.solarGeneratedKwh).toBeCloseTo(base.solarGeneratedKwh * 2);
      expect(doubled.coolingSavedKwh).toBeCloseTo(base.coolingSavedKwh * 2);
      expect(doubled.totalCostKrw).toBeCloseTo(base.totalCostKrw * 2);
    }
  });

  it("지원율은 부담 배분만 바꾸고 총사업비와 물리적 효과는 바꾸지 않는다", () => {
    for (const id of SCENARIO_IDS) {
      const low = calculateScenario({ ...inputs, subsidyPct: 10 }, id);
      const high = calculateScenario({ ...inputs, subsidyPct: 90 }, id);
      expect(high.totalCostKrw).toBeCloseTo(low.totalCostKrw);
      expect(high.solarGeneratedKwh).toBe(low.solarGeneratedKwh);
      expect(high.coolingSavedKwh).toBe(low.coolingSavedKwh);
      expect(high.co2ReductionT).toBe(low.co2ReductionT);
      if (low.totalCostKrw > 0) expect(high.ownerCostKrw).toBeLessThan(low.ownerCostKrw);
    }
  });
});

describe("민감도 스윕", () => {
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

  it("공장 수는 정수로만 계산한다", () => {
    for (const row of sweepCo2(inputs, "factoryCount", 3, 8, 7)) {
      expect(Number.isInteger(row.x)).toBe(true);
    }
  });

  it("원래 입력값을 변경하지 않는다", () => {
    expect(inputs.coolingSavingPct).toBe(10);
  });
});

describe("계산 과정 표시", () => {
  it("표시되는 최종 수치가 계산 엔진의 결과와 일치한다", () => {
    const result = calculateAll(inputs).combinedSeparate;
    const steps = buildFormulaSteps(inputs, "combinedSeparate", result);
    expect(steps).toHaveLength(10);
    expect(steps[2].substituted).toContain("5,000");
    expect(steps[9].substituted).toContain("255");
  });

  it("B 유형 풀이는 미산정을 명시한다", () => {
    const result = calculateAll(inputs).combinedFullCoat;
    const steps = buildFormulaSteps(inputs, "combinedFullCoat", result);
    expect(steps[2].why).toContain("미산정");
  });

  it("'중복 계산 보정'이라는 표현을 쓰지 않는다", () => {
    const all = calculateAll(inputs);
    for (const id of SCENARIO_IDS) {
      const text = JSON.stringify(buildFormulaSteps(inputs, id, all[id]));
      expect(text).not.toContain("보정");
    }
  });
});

describe("기본값", () => {
  it("모두 검증을 통과한다", () => {
    const { values, errors } = validateInputs(DEFAULT_RAW_INPUTS);
    expect(errors).toEqual({});
    expect(values).not.toBeNull();
  });

  it("기본 지원율은 정책 제안값 70%다", () => {
    expect(DEFAULT_RAW_INPUTS.subsidyPct).toBe("70");
  });

  it("한계 배출계수 기본값은 비어 있다", () => {
    expect(validateInputs(DEFAULT_RAW_INPUTS).values?.marginalEmissionFactorTPerMwh).toBeNull();
  });

  it("태양광 환산식과 일치한다: 8,760시간 × 15%", () => {
    expect(Number(DEFAULT_RAW_INPUTS.solarYieldKwhPerKw)).toBeCloseTo(8760 * 0.15);
  });
});
