/**
 * 계산 엔진: 화면(React)과 분리된 순수 함수만 둡니다.
 * 같은 입력을 넣으면 항상 같은 결과가 나오므로 단위 테스트로 검증하기 쉽습니다.
 *
 * 변수 이름 끝의 단위(M2, Kw, Kwh, Krw, Pct...)를 일부러 남겼습니다.
 * 단위 실수는 계산 모델에서 가장 흔한 오류이기 때문입니다.
 */

export interface ModelInputs {
  /** 공장 수 (개) */
  factoryCount: number;
  /** 공장 1곳의 평균 지붕 면적 (m²) */
  avgRoofAreaM2: number;
  /** 지붕 중 태양광을 설치할 수 있는 면적 비율 (%) */
  usableSolarPct: number;
  /** 설치 면적 1m²당 태양광 설비 용량 (kW/m²) */
  pvDensityKwPerM2: number;
  /** 설비 1kW가 1년에 생산하는 전력량 (kWh/kW·년) */
  solarYieldKwhPerKw: number;
  /** 가정: 지붕 1m²에 대응하는 연간 냉방 전력 (kWh/m²·년) */
  coolingBaselineKwhPerM2: number;
  /** 가정: 지붕 전체에 쿨루프를 시공했을 때의 냉방 전력 절감률 (%) */
  coolingSavingPct: number;
  /** 쿨루프 시공 단가 (원/m²) */
  coolRoofCostKrwPerM2: number;
  /** 태양광 설치 단가 (원/kW) */
  pvCostKrwPerKw: number;
  /** 총사업비 중 지자체가 부담하는 비율 (%) */
  subsidyPct: number;
  /** 전력 배출계수 (tCO2eq/MWh) */
  emissionFactorTPerMwh: number;
}

export type ScenarioId = "coolRoof" | "solarPv" | "combined";

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  coolRoof: "쿨루프 단독",
  solarPv: "태양광 단독",
  combined: "쿨루프 + 태양광",
};

export const SCENARIO_IDS: ScenarioId[] = ["coolRoof", "solarPv", "combined"];

export interface ScenarioResult {
  id: ScenarioId;
  /** 쿨루프를 칠한 면적 (m²) */
  coatedAreaM2: number;
  /** 태양광을 설치한 면적 (m²) */
  pvAreaM2: number;
  /** 태양광 설비 용량 (kW) */
  pvCapacityKw: number;
  /** 절감된 냉방 전력 (kWh/년) */
  coolingSavedKwh: number;
  /** 태양광 발전량 (kWh/년) */
  solarGeneratedKwh: number;
  coolRoofCostKrw: number;
  pvCostKrw: number;
  /** 총사업비 (원) */
  totalCostKrw: number;
  /** 지자체 부담 (원) */
  municipalCostKrw: number;
  /** 공장 소유주 부담 (원) */
  ownerCostKrw: number;
  /** 추정 CO2 감축량 (tCO2eq/년) */
  co2ReductionT: number;
}

export type ScenarioResults = Record<ScenarioId, ScenarioResult>;

/** 시나리오가 달라지는 지점은 "어느 면적에 무엇을 설치하는가"뿐입니다. */
export function scenarioAreas(inputs: ModelInputs, id: ScenarioId) {
  const totalRoofM2 = inputs.factoryCount * inputs.avgRoofAreaM2;
  const solarAreaM2 = totalRoofM2 * (inputs.usableSolarPct / 100);

  switch (id) {
    case "coolRoof":
      return { totalRoofM2, coatedAreaM2: totalRoofM2, pvAreaM2: 0 };
    case "solarPv":
      return { totalRoofM2, coatedAreaM2: 0, pvAreaM2: solarAreaM2 };
    case "combined":
      // 핵심 가정: 패널이 덮은 곳에는 쿨루프를 칠하지 않습니다.
      // 같은 지붕 면적의 효과를 두 번 세는 일을 막기 위한 규칙입니다.
      return {
        totalRoofM2,
        coatedAreaM2: totalRoofM2 - solarAreaM2,
        pvAreaM2: solarAreaM2,
      };
  }
}

export function calculateScenario(
  inputs: ModelInputs,
  id: ScenarioId,
): ScenarioResult {
  const { totalRoofM2, coatedAreaM2, pvAreaM2 } = scenarioAreas(inputs, id);

  // [에너지] 냉방 절감량은 시공 면적에 비례한다고 단순화합니다.
  const coatedShare = totalRoofM2 > 0 ? coatedAreaM2 / totalRoofM2 : 0;
  const baselineKwh = totalRoofM2 * inputs.coolingBaselineKwhPerM2;
  const coolingSavedKwh =
    baselineKwh * (inputs.coolingSavingPct / 100) * coatedShare;

  const pvCapacityKw = pvAreaM2 * inputs.pvDensityKwPerM2;
  const solarGeneratedKwh = pvCapacityKw * inputs.solarYieldKwhPerKw;

  // [비용] 총사업비를 지자체와 소유주가 나눠 냅니다. 둘의 합은 항상 총사업비입니다.
  const coolRoofCostKrw = coatedAreaM2 * inputs.coolRoofCostKrwPerM2;
  const pvCostKrw = pvCapacityKw * inputs.pvCostKrwPerKw;
  const totalCostKrw = coolRoofCostKrw + pvCostKrw;
  const municipalCostKrw = totalCostKrw * (inputs.subsidyPct / 100);
  const ownerCostKrw = totalCostKrw - municipalCostKrw;

  // [탄소] kWh ÷ 1000 = MWh, MWh × (tCO2eq/MWh) = tCO2eq
  const co2ReductionT =
    ((coolingSavedKwh + solarGeneratedKwh) / 1000) *
    inputs.emissionFactorTPerMwh;

  return {
    id,
    coatedAreaM2,
    pvAreaM2,
    pvCapacityKw,
    coolingSavedKwh,
    solarGeneratedKwh,
    coolRoofCostKrw,
    pvCostKrw,
    totalCostKrw,
    municipalCostKrw,
    ownerCostKrw,
    co2ReductionT,
  };
}

export function calculateAll(inputs: ModelInputs): ScenarioResults {
  return {
    coolRoof: calculateScenario(inputs, "coolRoof"),
    solarPv: calculateScenario(inputs, "solarPv"),
    combined: calculateScenario(inputs, "combined"),
  };
}

/**
 * 겹침 규칙의 효과: 두 단독 시나리오를 단순히 더한 값과 결합 시나리오의 차이.
 * 이 값만큼이 "같은 면적을 두 번 세었을 때" 과대평가되는 냉방 절감량입니다.
 */
export function overlapCorrection(results: ScenarioResults) {
  const naiveCoolingKwh =
    results.coolRoof.coolingSavedKwh + results.solarPv.coolingSavedKwh;
  const naiveCostKrw =
    results.coolRoof.totalCostKrw + results.solarPv.totalCostKrw;
  return {
    naiveCoolingKwh,
    coolingOverstatedKwh: naiveCoolingKwh - results.combined.coolingSavedKwh,
    naiveCostKrw,
    costOverstatedKrw: naiveCostKrw - results.combined.totalCostKrw,
  };
}

export interface SweepRow {
  x: number;
  coolRoof: number;
  solarPv: number;
  combined: number;
}

/** 입력값 하나만 바꿔 가며 CO2 감축량이 어떻게 변하는지 계산합니다(민감도 분석). */
export function sweepCo2(
  inputs: ModelInputs,
  key: keyof ModelInputs,
  from: number,
  to: number,
  steps: number,
): SweepRow[] {
  const rows: SweepRow[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = from + ((to - from) * i) / steps;
    const results = calculateAll({ ...inputs, [key]: x });
    rows.push({
      x,
      coolRoof: results.coolRoof.co2ReductionT,
      solarPv: results.solarPv.co2ReductionT,
      combined: results.combined.co2ReductionT,
    });
  }
  return rows;
}
