import { formatNumber as n } from "./format";
import {
  scenarioAreas,
  type ModelInputs,
  type ScenarioId,
  type ScenarioResult,
} from "./model";

export interface FormulaStep {
  title: string;
  /** 기호로 쓴 식 */
  formula: string;
  /** 현재 입력값을 넣은 식 */
  substituted: string;
  /** 단위가 어떻게 약분되는지 */
  units: string;
  /** 왜 이렇게 계산하는지 */
  why: string;
}

const COATED_RULE: Record<ScenarioId, { formula: string; why: string }> = {
  coolRoof: {
    formula: "쿨루프 면적 = 전체 지붕",
    why: "태양광이 없으므로 지붕 전체를 시공합니다.",
  },
  solarPv: {
    formula: "쿨루프 면적 = 0",
    why: "이 시나리오에서는 쿨루프를 시공하지 않습니다.",
  },
  combined: {
    formula: "쿨루프 면적 = 전체 지붕 − 태양광 면적",
    why: "패널 아래는 햇빛이 직접 닿지 않으므로 쿨루프 효과를 세지 않고, 시공비도 넣지 않습니다.",
  },
};

/** 계산 과정을 숫자와 함께 펼칩니다. 값은 계산 엔진의 결과를 그대로 씁니다. */
export function buildFormulaSteps(
  inputs: ModelInputs,
  id: ScenarioId,
  result: ScenarioResult,
): FormulaStep[] {
  const { totalRoofM2 } = scenarioAreas(inputs, id);
  const baselineKwh = totalRoofM2 * inputs.coolingBaselineKwhPerM2;
  const fullPvAreaM2 = totalRoofM2 * (inputs.usableSolarPct / 100);
  const rule = COATED_RULE[id];

  return [
    {
      title: "1. 전체 지붕 면적",
      formula: "전체 지붕 = 공장 수 × 평균 지붕 면적",
      substituted: `${n(inputs.factoryCount)} × ${n(inputs.avgRoofAreaM2, 2)} = ${n(totalRoofM2, 2)} m²`,
      units: "개 × m²/개 = m²",
      why: "모든 계산의 출발점입니다.",
    },
    {
      title: "2. 태양광 면적과 용량",
      formula:
        id === "coolRoof"
          ? "태양광 면적 = 0, 용량 = 0"
          : "면적 = 전체 지붕 × 설치 가능 비율, 용량 = 면적 × 용량 밀도",
      substituted:
        id === "coolRoof"
          ? "0 m², 0 kW"
          : `${n(totalRoofM2, 2)} × ${n(inputs.usableSolarPct, 2)}% = ${n(fullPvAreaM2, 2)} m², ${n(fullPvAreaM2, 2)} × ${n(inputs.pvDensityKwPerM2, 4)} = ${n(result.pvCapacityKw, 2)} kW`,
      units: "m² × kW/m² = kW",
      why:
        id === "coolRoof"
          ? "이 시나리오에는 태양광이 없습니다."
          : "지붕 전부에 패널을 놓을 수는 없으므로 설치 가능한 면적만 계산합니다.",
    },
    {
      title: "3. 쿨루프 시공 면적",
      formula: rule.formula,
      substituted: `${n(result.coatedAreaM2, 2)} m²`,
      units: "m²",
      why: rule.why,
    },
    {
      title: "4. 태양광 발전량",
      formula: "발전량 = 용량 × 연간 발전량",
      substituted: `${n(result.pvCapacityKw, 2)} × ${n(inputs.solarYieldKwhPerKw, 2)} = ${n(result.solarGeneratedKwh)} kWh/년`,
      units: "kW × kWh/kW·년 = kWh/년",
      why: "연간 발전량은 이용률을 kWh/kW로 환산한 값입니다.",
    },
    {
      title: "5. 절감 냉방 전력",
      formula: "절감량 = 전체 지붕 × 냉방 기준값 × 절감률 × (쿨루프 면적 ÷ 전체 지붕)",
      substituted: `${n(baselineKwh)} kWh × ${n(inputs.coolingSavingPct, 2)}% × (${n(result.coatedAreaM2, 2)} ÷ ${n(totalRoofM2, 2)}) = ${n(result.coolingSavedKwh)} kWh/년`,
      units: "m² × kWh/m²·년 × 비율 = kWh/년",
      why: "절감량이 시공 면적에 비례한다고 단순화합니다. 기준값과 절감률이 모두 가정이므로 결과도 가정입니다.",
    },
    {
      title: "6. 총사업비",
      formula: "총사업비 = 쿨루프 면적 × 쿨루프 단가 + 태양광 용량 × 태양광 단가",
      substituted: `${n(result.coatedAreaM2, 2)} × ${n(inputs.coolRoofCostKrwPerM2)} + ${n(result.pvCapacityKw, 2)} × ${n(inputs.pvCostKrwPerKw)} = ${n(result.totalCostKrw)} 원`,
      units: "m² × 원/m² + kW × 원/kW = 원",
      why: "설치비만 계산합니다. 유지보수비, 구조 보강비, 전기요금 절감 수익은 포함하지 않습니다.",
    },
    {
      title: "7. 지자체·소유주 부담",
      formula: "지자체 = 총사업비 × 보조율, 소유주 = 총사업비 − 지자체",
      substituted: `지자체 ${n(result.municipalCostKrw)} 원, 소유주 ${n(result.ownerCostKrw)} 원`,
      units: "원 × % = 원",
      why: "둘을 더하면 항상 총사업비가 됩니다.",
    },
    {
      title: "8. 추정 CO2 감축량",
      formula: "감축량 = (절감 전력 + 발전량) ÷ 1,000 × 배출계수",
      substituted: `(${n(result.coolingSavedKwh)} + ${n(result.solarGeneratedKwh)}) ÷ 1,000 × ${n(inputs.emissionFactorTPerMwh, 4)} = ${n(result.co2ReductionT, 1)} tCO2eq/년`,
      units: "kWh ÷ (1,000 kWh/MWh) × tCO2eq/MWh = tCO2eq",
      why: "절감·발전한 전기만큼 전력망 전기를 덜 쓴다고 가정합니다. 설비 제조 과정의 배출은 제외했습니다.",
    },
  ];
}
