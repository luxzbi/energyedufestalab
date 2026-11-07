import { describe, expect, it } from "vitest";
import { DEFAULT_RAW_INPUTS, validateInputs } from "./fields";
import type { ModelInputs, NumericInputKey } from "./model";
import {
  compareSelectionMethods,
  evaluateFactories,
  generateVirtualFactories,
  seededRandom,
  SELECTION_METHODS,
  solveKnapsack,
  type KnapsackItem,
} from "./optimization";
import { budgetCapacity, compareSubsidyRates } from "./policy";
import {
  DEFAULT_RANGES,
  runMultiVariable,
  runOneAtATime,
  SENSITIVITY_KEYS,
  validateRange,
  type SensitivityRanges,
} from "./sensitivity";

const defaults = validateInputs(DEFAULT_RAW_INPUTS).values as ModelInputs;
const ranges = DEFAULT_RANGES as SensitivityRanges;

describe("지원율 비교: 사업 규모 고정", () => {
  const rows = compareSubsidyRates(defaults, "combinedSeparate");

  it("30, 50, 70, 90%를 비교한다", () => {
    expect(rows.map((r) => r.subsidyPct)).toEqual([30, 50, 70, 90]);
  });

  it("지원율이 바뀌어도 총사업비, 면적, 발전량, 절감량, 감축량은 같다", () => {
    for (const row of rows) {
      expect(row.totalCostKrw).toBe(rows[0].totalCostKrw);
      expect(row.treatedRoofAreaM2).toBe(rows[0].treatedRoofAreaM2);
      expect(row.solarGeneratedKwh).toBe(rows[0].solarGeneratedKwh);
      expect(row.coolingSavedKwh).toBe(rows[0].coolingSavedKwh);
      expect(row.co2ReductionT).toBe(rows[0].co2ReductionT);
    }
  });

  it("대전시 부담은 늘고 소유주 부담은 줄며 합은 총사업비다", () => {
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].municipalCostKrw).toBeGreaterThan(rows[i - 1].municipalCostKrw);
      expect(rows[i].ownerCostKrw).toBeLessThan(rows[i - 1].ownerCostKrw);
    }
    for (const row of rows) {
      expect(row.municipalCostKrw + row.ownerCostKrw).toBeCloseTo(row.totalCostKrw);
      expect(row.ownerCostPerFactoryKrw * defaults.factoryCount).toBeCloseTo(row.ownerCostKrw);
    }
  });
});

describe("예산 고정 분석", () => {
  it("예산을 넘지 않는 공장 수를 내림으로 계산한다", () => {
    const r = budgetCapacity(defaults, "combinedSeparate", 10e8);
    // 공장당 쿨루프 800m² × 4만 원 + 태양광 144kW × 200만 원 = 3.2억, × 70% = 2.24억 → 10억으로 4곳
    expect(r.municipalCostPerFactoryKrw).toBeCloseTo(224_000_000);
    expect(r.fundedFactories).toBe(4);
    expect(r.municipalCostKrw).toBeLessThanOrEqual(10e8);
  });

  it("예산이 공장 1곳 비용보다 작으면 0곳이다", () => {
    const r = budgetCapacity(defaults, "combinedSeparate", 1e8);
    expect(r.fundedFactories).toBe(0);
    expect(r.co2ReductionT).toBe(0);
  });

  it("예산 고정에서는 지원율을 낮추면 물리적 효과가 커질 수 있다", () => {
    const low = budgetCapacity({ ...defaults, subsidyPct: 30 }, "combinedSeparate", 30e8);
    const high = budgetCapacity({ ...defaults, subsidyPct: 90 }, "combinedSeparate", 30e8);
    expect(low.fundedFactories).toBeGreaterThan(high.fundedFactories);
    expect(low.co2ReductionT).toBeGreaterThan(high.co2ReductionT);
  });

  it("전체 공장 수를 넘지 않는다", () => {
    const r = budgetCapacity({ ...defaults, factoryCount: 3 }, "combinedSeparate", 1e12);
    expect(r.fundedFactories).toBe(3);
    expect(r.cappedByFactoryCount).toBe(true);
  });

  it("지원율 0%면 예산 제약 없이 전체 공장이다", () => {
    const r = budgetCapacity({ ...defaults, subsidyPct: 0 }, "combinedSeparate", 1e8);
    expect(r.fundedFactories).toBe(defaults.factoryCount);
    expect(r.municipalCostKrw).toBe(0);
  });
});

/** 모든 조합을 직접 세어 보는 검증용 정답 */
function bruteForce(items: KnapsackItem[], capacity: number) {
  let best = 0;
  for (let mask = 0; mask < 1 << items.length; mask += 1) {
    let weight = 0;
    let value = 0;
    items.forEach((item, i) => {
      if (mask & (1 << i)) {
        weight += item.weight;
        value += item.value;
      }
    });
    if (weight <= capacity && value > best) best = value;
  }
  return best;
}

describe("0-1 배낭 풀이", () => {
  it("탐욕법이 틀리는 고전 예제에서 정답을 찾는다", () => {
    const items = [
      { weight: 10, value: 60 },
      { weight: 20, value: 100 },
      { weight: 30, value: 120 },
    ];
    const s = solveKnapsack(items, 50);
    expect(s.value).toBe(220);
    expect(s.selected).toEqual([1, 2]);
    expect(s.status).toBe("exact");
  });

  it("무작위 문제 300개에서 전수 조사 결과와 일치한다", () => {
    const random = seededRandom(7);
    for (let t = 0; t < 300; t += 1) {
      const n = 1 + Math.floor(random() * 13);
      const correlated = t % 2 === 0;
      const items = Array.from({ length: n }, () => {
        const weight = 1 + Math.floor(random() * 1000);
        return {
          weight,
          // 절반은 공장 데이터처럼 값과 비용이 강하게 비례하는 어려운 문제입니다.
          value: correlated ? weight * (1 + random() * 0.02) : random() * 1000,
        };
      });
      const capacity = Math.floor(random() * 3000);
      const s = solveKnapsack(items, capacity);
      expect(s.status).toBe("exact");
      expect(s.value).toBeCloseTo(bruteForce(items, capacity), 6);
      expect(s.weight).toBeLessThanOrEqual(capacity);
    }
  });

  it("비용 0인 항목은 항상 담고, 넘치는 항목은 담지 않는다", () => {
    const s = solveKnapsack(
      [
        { weight: 0, value: 5 },
        { weight: 100, value: 1000 },
        { weight: 3, value: 1 },
      ],
      10,
    );
    expect(s.selected).toEqual([0, 2]);
    expect(s.value).toBe(6);
  });

  it("예산이 0이거나 항목이 없어도 동작한다", () => {
    expect(solveKnapsack([], 100).selected).toEqual([]);
    expect(solveKnapsack([{ weight: 5, value: 5 }], 0).selected).toEqual([]);
  });

  it("계산 한도에 걸리면 근사해로 표시하고 예산은 지킨다", () => {
    const random = seededRandom(3);
    const items = Array.from({ length: 40 }, () => {
      const weight = 1000 + Math.floor(random() * 9000);
      return { weight, value: weight * (1 + random() * 0.001) };
    });
    const capacity = 100000;
    const s = solveKnapsack(items, capacity, 10);
    expect(s.status).toBe("approximate");
    expect(s.weight).toBeLessThanOrEqual(capacity);
    expect(s.upperBound).toBeGreaterThanOrEqual(s.value);
  });
});

describe("가상 공장 데이터", () => {
  const options = { count: 40, seed: 2026, unsafeSharePct: 20 };

  it("같은 시드면 같은 데이터, 다른 시드면 다른 데이터다", () => {
    expect(generateVirtualFactories(defaults, options)).toEqual(
      generateVirtualFactories(defaults, options),
    );
    expect(generateVirtualFactories(defaults, { ...options, seed: 1 })).not.toEqual(
      generateVirtualFactories(defaults, options),
    );
  });

  it("이름으로 가상 데이터임을 드러내고 구조 부적합 공장을 포함한다", () => {
    const factories = generateVirtualFactories(defaults, options);
    expect(factories.every((f) => f.id.startsWith("가상-"))).toBe(true);
    expect(factories.some((f) => !f.structurallySafe)).toBe(true);
    expect(factories.every((f) => f.usableSolarPct >= 0 && f.usableSolarPct <= 100)).toBe(true);
  });

  it("공장별 계산에서 대전시 부담은 정수 원이다", () => {
    const evaluated = evaluateFactories(
      generateVirtualFactories(defaults, options),
      defaults,
      "combinedSeparate",
    );
    expect(evaluated.every((f) => Number.isInteger(f.municipalCostKrw))).toBe(true);
  });
});

describe("선정 방식 비교", () => {
  const options = { count: 40, seed: 2026, unsafeSharePct: 20 };
  const evaluated = evaluateFactories(
    generateVirtualFactories(defaults, options),
    defaults,
    "combinedSeparate",
  );
  const unsafeIds = new Set(
    evaluated.filter((f) => !f.factory.structurallySafe).map((f) => f.factory.id),
  );

  for (const budget of [1e8, 5e8, 10e8, 30e8, 100e8]) {
    const result = compareSelectionMethods(evaluated, budget, 42);

    it(`${budget / 1e8}억 원: 모든 방식이 예산 상한을 넘지 않는다`, () => {
      for (const method of SELECTION_METHODS) {
        expect(result.results[method].municipalCostKrw).toBeLessThanOrEqual(budget);
        expect(result.results[method].unusedBudgetKrw).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${budget / 1e8}억 원: 구조 부적합 공장이 선정되지 않는다`, () => {
      for (const method of SELECTION_METHODS) {
        for (const id of result.results[method].selectedIds) {
          expect(unsafeIds.has(id)).toBe(false);
        }
      }
    });

    it(`${budget / 1e8}억 원: 최적화 결과가 다른 방식 이상이고 최적해로 증명된다`, () => {
      const best = result.results.optimal;
      expect(best.solutionType).toBe("exact");
      for (const method of SELECTION_METHODS) {
        expect(best.co2ReductionT).toBeGreaterThanOrEqual(
          result.results[method].co2ReductionT - 1e-9,
        );
      }
    });
  }

  it("같은 시드의 무작위 선정은 재현되고, 시드가 다르면 달라질 수 있다", () => {
    const a = compareSelectionMethods(evaluated, 30e8, 42).results.random;
    const b = compareSelectionMethods(evaluated, 30e8, 42).results.random;
    const c = compareSelectionMethods(evaluated, 30e8, 43).results.random;
    expect(a).toEqual(b);
    expect(a.selectedIds).not.toEqual(c.selectedIds);
  });

  it("작은 데이터에서 전수 조사 결과와 일치한다", () => {
    const small = evaluateFactories(
      generateVirtualFactories(defaults, { count: 14, seed: 9, unsafeSharePct: 20 }),
      defaults,
      "combinedFullCoat",
    );
    const eligible = small.filter((f) => f.factory.structurallySafe);
    const items = eligible.map((f) => ({ weight: f.municipalCostKrw, value: f.co2ReductionT }));
    const result = compareSelectionMethods(small, 15e8, 1).results.optimal;
    expect(result.co2ReductionT).toBeCloseTo(bruteForce(items, 15e8), 6);
  });

  it("최대 규모(300곳)도 시간 안에 최적해 여부를 판정한다", () => {
    const big = evaluateFactories(
      generateVirtualFactories(defaults, { count: 300, seed: 5, unsafeSharePct: 20 }),
      defaults,
      "combinedSeparate",
    );
    const started = performance.now();
    const result = compareSelectionMethods(big, 300e8, 1);
    const elapsed = performance.now() - started;
    expect(result.results.optimal.municipalCostKrw).toBeLessThanOrEqual(300e8);
    expect(["exact", "approximate"]).toContain(result.results.optimal.solutionType);
    expect(elapsed).toBeLessThan(5000);
  });

  it("지원율 0%면 예산과 무관하게 적합 공장을 모두 선정한다", () => {
    const free = evaluateFactories(
      generateVirtualFactories(defaults, options),
      { ...defaults, subsidyPct: 0 },
      "combinedSeparate",
    );
    const result = compareSelectionMethods(free, 1e8, 42);
    for (const method of SELECTION_METHODS) {
      expect(result.results[method].factoryCount).toBe(result.eligibleCount);
    }
  });
});

describe("민감도: 단일 변수", () => {
  const rows = runOneAtATime(defaults, "combinedSeparate", "co2ReductionT", ranges);

  it("9개 변수를 변동 폭이 큰 순서로 순위를 매긴다", () => {
    expect(rows).toHaveLength(9);
    rows.forEach((row, index) => {
      expect(row.rank).toBe(index + 1);
      if (index > 0) expect(row.swing).toBeLessThanOrEqual(rows[index - 1].swing);
    });
  });

  it("지원율과 단가는 물리적 감축량에 영향이 없다", () => {
    for (const key of ["subsidyPct", "coolRoofCostKrwPerM2", "pvCostKrwPerKw"]) {
      expect(rows.find((r) => r.key === key)?.swing).toBe(0);
    }
  });

  it("대전시 부담에서는 지원율이 영향을 준다", () => {
    const cost = runOneAtATime(defaults, "combinedSeparate", "municipalCostKrw", ranges);
    expect(cost.find((r) => r.key === "subsidyPct")?.swing).toBeGreaterThan(0);
    expect(cost.find((r) => r.key === "emissionFactorTPerMwh")?.swing).toBe(0);
  });

  it("값을 직접 계산한 결과와 일치한다: 공장 수 50~150", () => {
    const row = rows.find((r) => r.key === "factoryCount")!;
    expect(row.outputAtLow).toBeCloseTo(row.outputAtBase * 0.5);
    expect(row.outputAtHigh).toBeCloseTo(row.outputAtBase * 1.5);
  });

  it("기준값이 범위 밖이면 순위에서 빼고 오류를 표시한다", () => {
    const bad = runOneAtATime(defaults, "combinedSeparate", "co2ReductionT", {
      ...ranges,
      usableSolarPct: { low: 70, high: 80 },
    });
    const row = bad.find((r) => r.key === "usableSolarPct")!;
    expect(row.error).toContain("기준값");
    expect(row.rank).toBe(0);
  });

  it("범위 검증은 정수와 허용 범위를 확인한다", () => {
    expect(validateRange("factoryCount", 100, 50.5, 150)).toContain("정수");
    expect(validateRange("usableSolarPct", 60, 40, 120)).toContain("허용 범위");
    expect(validateRange("usableSolarPct", 60, 40, 80)).toBeNull();
  });
});

describe("민감도: 동시 변수", () => {
  it("단일 변수 분석과 다르며 모든 조합 수를 센다", () => {
    const keys: NumericInputKey[] = ["factoryCount", "usableSolarPct", "emissionFactorTPerMwh"];
    const result = runMultiVariable(defaults, "combinedSeparate", "co2ReductionT", ranges, keys);
    expect(result.combinations).toBe(8);
    expect(result.minSettings).toEqual({
      factoryCount: 50,
      usableSolarPct: 40,
      emissionFactorTPerMwh: 0.35,
    });
    const single = runOneAtATime(defaults, "combinedSeparate", "co2ReductionT", ranges);
    const widest = Math.max(...single.map((r) => r.maxOutput));
    expect(result.maxOutput).toBeGreaterThan(widest);
  });

  it("모든 변수를 켜도 512개 조합으로 계산하고 기준값이 범위 안에 있다", () => {
    const result = runMultiVariable(
      defaults,
      "combinedSeparate",
      "municipalCostKrw",
      ranges,
      SENSITIVITY_KEYS,
    );
    expect(result.combinations).toBe(512);
    expect(result.minOutput).toBeLessThanOrEqual(result.outputAtBase);
    expect(result.maxOutput).toBeGreaterThanOrEqual(result.outputAtBase);
  });

  it("변수를 하나도 고르지 않으면 기준값과 같다", () => {
    const result = runMultiVariable(defaults, "coolRoof", "co2ReductionT", ranges, []);
    expect(result.combinations).toBe(1);
    expect(result.minOutput).toBe(result.outputAtBase);
    expect(result.maxOutput).toBe(result.outputAtBase);
  });
});
