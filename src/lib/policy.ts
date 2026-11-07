/**
 * 지원율 정책 분석. 서로 다른 두 질문을 일부러 다른 함수로 나눴습니다.
 *
 * 1. compareSubsidyRates: 사업 규모가 고정이면 지원율은 "누가 내는가"만 바꿉니다.
 *    총사업비와 발전량, 감축량은 지원율과 무관합니다.
 * 2. budgetCapacity: 예산이 고정이면 지원율이 "몇 곳을 지원할 수 있는가"를 바꾸고,
 *    그 결과로 물리적 효과도 달라집니다.
 *
 * 어느 쪽도 공장의 참여 의사는 계산하지 않습니다.
 */
import {
  calculateScenario,
  type ModelInputs,
  type ScenarioId,
} from "./model";

export const COMPARE_SUBSIDY_RATES = [30, 50, 70, 90];

/** 프리셋 예산 (원) */
export const BUDGET_PRESETS_KRW = [1e8, 5e8, 10e8, 30e8];

export interface SubsidyRow {
  subsidyPct: number;
  totalCostKrw: number;
  municipalCostKrw: number;
  ownerCostKrw: number;
  ownerCostPerFactoryKrw: number;
  treatedRoofAreaM2: number;
  coatedAreaM2: number;
  pvAreaM2: number;
  solarGeneratedKwh: number;
  coolingSavedKwh: number;
  co2ReductionT: number;
}

export function compareSubsidyRates(
  inputs: ModelInputs,
  scenarioId: ScenarioId,
  rates: number[] = COMPARE_SUBSIDY_RATES,
): SubsidyRow[] {
  return rates.map((subsidyPct) => {
    const r = calculateScenario({ ...inputs, subsidyPct }, scenarioId);
    return {
      subsidyPct,
      totalCostKrw: r.totalCostKrw,
      municipalCostKrw: r.municipalCostKrw,
      ownerCostKrw: r.ownerCostKrw,
      ownerCostPerFactoryKrw: r.ownerCostKrw / inputs.factoryCount,
      treatedRoofAreaM2: r.treatedRoofAreaM2,
      coatedAreaM2: r.coatedAreaM2,
      pvAreaM2: r.pvAreaM2,
      solarGeneratedKwh: r.solarGeneratedKwh,
      coolingSavedKwh: r.coolingSavedKwh,
      co2ReductionT: r.co2ReductionT,
    };
  });
}

export interface BudgetCapacityRow {
  budgetKrw: number;
  subsidyPct: number;
  /** 평균 공장 1곳에 대전시가 내는 금액 (원) */
  municipalCostPerFactoryKrw: number;
  /** 예산으로 지원할 수 있는 평균 공장 수. 전체 공장 수를 넘지 않습니다. */
  fundedFactories: number;
  /** 입력한 공장 수가 상한이 되었는지 */
  cappedByFactoryCount: boolean;
  municipalCostKrw: number;
  unusedBudgetKrw: number;
  ownerCostKrw: number;
  totalCostKrw: number;
  treatedRoofAreaM2: number;
  solarGeneratedKwh: number;
  coolingSavedKwh: number;
  co2ReductionT: number;
}

/** 모든 공장이 평균 공장과 같다고 단순화한 계산입니다. 공장별 차이는 optimization.ts가 다룹니다. */
export function budgetCapacity(
  inputs: ModelInputs,
  scenarioId: ScenarioId,
  budgetKrw: number,
): BudgetCapacityRow {
  const perFactory = calculateScenario({ ...inputs, factoryCount: 1 }, scenarioId);
  const unitCost = perFactory.municipalCostKrw;
  // 지원액이 0이면 예산이 제약이 되지 않으므로 전체 공장을 지원할 수 있습니다.
  const affordable =
    unitCost > 0 ? Math.floor(budgetKrw / unitCost) : inputs.factoryCount;
  const fundedFactories = Math.min(affordable, inputs.factoryCount);
  const scale = (value: number) => value * fundedFactories;

  return {
    budgetKrw,
    subsidyPct: inputs.subsidyPct,
    municipalCostPerFactoryKrw: unitCost,
    fundedFactories,
    cappedByFactoryCount: affordable >= inputs.factoryCount,
    municipalCostKrw: scale(unitCost),
    unusedBudgetKrw: budgetKrw - scale(unitCost),
    ownerCostKrw: scale(perFactory.ownerCostKrw),
    totalCostKrw: scale(perFactory.totalCostKrw),
    treatedRoofAreaM2: scale(perFactory.treatedRoofAreaM2),
    solarGeneratedKwh: scale(perFactory.solarGeneratedKwh),
    coolingSavedKwh: scale(perFactory.coolingSavedKwh),
    co2ReductionT: scale(perFactory.co2ReductionT),
  };
}
