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
    formula: "시공 면적 = 전체 지붕, 효과 인정 면적 = 전체 지붕",
    why: "태양광이 없으므로 지붕 전체가 햇빛에 노출됩니다.",
  },
  solarPv: {
    formula: "시공 면적 = 0, 효과 인정 면적 = 0",
    why: "이 유형에서는 쿨루프를 시공하지 않습니다. 패널 그늘의 냉각 효과도 세지 않습니다.",
  },
  combinedSeparate: {
    formula: "시공 면적 = 전체 지붕 − 태양광 면적, 효과 인정 면적 = 시공 면적",
    why: "패널 영역에는 시공하지 않는다는 설치 방식의 가정입니다. 같은 면적에 함께 설치하는 것이 불가능해서가 아닙니다.",
  },
  combinedFullCoat: {
    formula: "시공 면적 = 전체 지붕, 효과 인정 면적 = 전체 지붕 − 태양광 면적",
    why: "비용은 전체 면적에 들지만, 패널 하부의 열전달을 믿을 만하게 계산할 모델이 없어 그 효과는 미산정합니다. 미산정은 효과가 0이라는 뜻이 아닙니다.",
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
  const hasPv = id !== "coolRoof";
  const creditedExport = result.exportedKwh * (inputs.exportCreditPct / 100);

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
      formula: hasPv
        ? "면적 = 전체 지붕 × 설치 가능 비율, 용량 = 면적 × 용량 밀도"
        : "태양광 면적 = 0, 용량 = 0",
      substituted: hasPv
        ? `${n(totalRoofM2, 2)} × ${n(inputs.usableSolarPct, 2)}% = ${n(fullPvAreaM2, 2)} m², ${n(fullPvAreaM2, 2)} × ${n(inputs.pvDensityKwPerM2, 4)} = ${n(result.pvCapacityKw, 2)} kW`
        : "0 m², 0 kW",
      units: "m² × kW/m² = kW",
      why: hasPv
        ? "지붕 전부에 패널을 놓을 수는 없으므로 설치 가능한 면적만 계산합니다."
        : "이 유형에는 태양광이 없습니다.",
    },
    {
      title: "3. 쿨루프 시공 면적과 효과 인정 면적",
      formula: rule.formula,
      substituted: `시공 ${n(result.coatedAreaM2, 2)} m², 효과 인정 ${n(result.creditedCoolRoofAreaM2, 2)} m², 미산정 ${n(result.uncreditedCoatedAreaM2, 2)} m²`,
      units: "m²",
      why: rule.why,
    },
    {
      title: "4. 태양광 총발전량",
      formula: "총발전량 = 용량 × 연간 발전량",
      substituted: `${n(result.pvCapacityKw, 2)} × ${n(inputs.solarYieldKwhPerKw, 2)} = ${n(result.solarGeneratedKwh)} kWh/년`,
      units: "kW × kWh/kW·년 = kWh/년",
      why: "연간 발전량은 이용률을 kWh/kW로 환산한 값입니다.",
    },
    {
      title: "5. 자가소비와 역송",
      formula: "자가소비 = 총발전량 × 자가소비 비율, 역송 = 총발전량 − 자가소비",
      substituted: `자가소비 ${n(result.selfConsumedKwh)} kWh/년, 역송 ${n(result.exportedKwh)} kWh/년`,
      units: "kWh/년 × % = kWh/년",
      why: "두 값의 합은 항상 총발전량입니다. 시간대별 부하를 맞춰 본 값이 아니라 입력한 비율입니다.",
    },
    {
      title: "6. 냉방 전력 절감량 (가정 기반 추정)",
      formula: "절감량 = 전체 지붕 × 냉방 기준값 × 절감률 × (효과 인정 면적 ÷ 전체 지붕)",
      substituted: `${n(baselineKwh)} kWh × ${n(inputs.coolingSavingPct, 2)}% × (${n(result.creditedCoolRoofAreaM2, 2)} ÷ ${n(totalRoofM2, 2)}) = ${n(result.coolingSavedKwh)} kWh/년`,
      units: "m² × kWh/m²·년 × 비율 = kWh/년",
      why: "기준값과 절감률이 모두 가정이므로 결과도 가정입니다. 실제 절감을 입증하지 않습니다.",
    },
    {
      title: "7. 전력망 구매 감소",
      formula: "구매 감소 = 냉방 절감량 + 자가소비량",
      substituted: `${n(result.coolingSavedKwh)} + ${n(result.selfConsumedKwh)} = ${n(result.gridPurchaseReductionKwh)} kWh/년`,
      units: "kWh/년",
      why: "역송량은 공장이 사지 않게 된 전기가 아니라 내보낸 전기이므로 여기에 넣지 않습니다.",
    },
    {
      title: "8. 총사업비",
      formula: "총사업비 = 시공 면적 × 쿨루프 단가 + 태양광 용량 × 태양광 단가",
      substituted: `${n(result.coatedAreaM2, 2)} × ${n(inputs.coolRoofCostKrwPerM2)} + ${n(result.pvCapacityKw, 2)} × ${n(inputs.pvCostKrwPerKw)} = ${n(result.totalCostKrw)} 원`,
      units: "m² × 원/m² + kW × 원/kW = 원",
      why: "효과를 미산정한 면적의 시공비도 포함합니다. 유지보수비, 구조 보강비, 전기요금 절감 수익은 포함하지 않습니다.",
    },
    {
      title: "9. 대전시·소유주 부담",
      formula: "대전시 = 총사업비 × 지원율, 소유주 = 총사업비 − 대전시",
      substituted: `대전시 ${n(result.municipalCostKrw)} 원, 소유주 ${n(result.ownerCostKrw)} 원`,
      units: "원 × % = 원",
      why: "둘을 더하면 항상 총사업비가 됩니다. 지원율은 물리적 효과를 바꾸지 않습니다.",
    },
    {
      title: "10. 추정 온실가스 감축량",
      formula: "감축량 = (구매 감소 + 역송량 × 인정 비율) ÷ 1,000 × 배출계수",
      substituted: `(${n(result.gridPurchaseReductionKwh)} + ${n(creditedExport)}) ÷ 1,000 × ${n(inputs.emissionFactorTPerMwh, 4)} = ${n(result.co2ReductionT, 1)} tCO2eq/년`,
      units: "kWh ÷ (1,000 kWh/MWh) × tCO2eq/MWh = tCO2eq",
      why: "자가소비와 역송을 나눠 더하므로 같은 전력을 두 번 세지 않습니다. 설비 제조·폐기 배출은 제외했습니다.",
    },
  ];
}
