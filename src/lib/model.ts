/**
 * 계산 엔진: 화면(React)과 분리된 순수 함수만 둡니다.
 * 같은 입력을 넣으면 항상 같은 결과가 나오므로 단위 테스트와 재현 검증이 가능합니다.
 *
 * 변수 이름 끝의 단위(M2, Kw, Kwh, Krw, Pct...)를 일부러 남겼습니다.
 * 단위 실수는 계산 모델에서 가장 흔한 오류이기 때문입니다.
 *
 * 이 모델의 냉방 절감량은 "기준값 × 절감률"이라는 가정 기반 추정입니다(모드 1).
 * 실측 자료는 measurements.ts에 따로 있고, 이 파일은 그것을 읽지 않습니다.
 */

/** 계산식이 바뀌면 올립니다. 실행 기록의 재현 검증에 쓰입니다. */
export const MODEL_VERSION = "2.0.0";

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
  /** 가정: 노출된 지붕 전체에 쿨루프를 시공했을 때의 냉방 전력 절감률 (%) */
  coolingSavingPct: number;
  /** 쿨루프 시공 단가 (원/m²) */
  coolRoofCostKrwPerM2: number;
  /** 태양광 설치 단가 (원/kW) */
  pvCostKrwPerKw: number;
  /** 총사업비 중 대전시가 부담하는 비율 (%) */
  subsidyPct: number;
  /** 발전량 중 공장에서 바로 쓰는 비율 (%) */
  selfConsumptionPct: number;
  /** 역송 전력의 감축 효과를 이 사업의 실적으로 인정하는 비율 (%) */
  exportCreditPct: number;
  /** 평균 전력 배출계수 (tCO2eq/MWh) */
  emissionFactorTPerMwh: number;
  /** 비교용 한계 배출계수 (tCO2eq/MWh). 값이 없으면 null이고 미산정으로 표시합니다. */
  marginalEmissionFactorTPerMwh: number | null;
}

export type NumericInputKey = Exclude<
  keyof ModelInputs,
  "marginalEmissionFactorTPerMwh"
>;

/**
 * 설치 유형
 * - C. coolRoof, solarPv: 각 기술의 독립적인 효과
 * - A. combinedSeparate: 패널 영역을 빼고 나머지에만 쿨루프 시공
 * - B. combinedFullCoat: 지붕 전체 시공 후 일부에 패널 설치
 */
export type ScenarioId =
  | "coolRoof"
  | "solarPv"
  | "combinedSeparate"
  | "combinedFullCoat";

export const SCENARIO_IDS: ScenarioId[] = [
  "coolRoof",
  "solarPv",
  "combinedSeparate",
  "combinedFullCoat",
];

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  coolRoof: "C-1. 쿨루프 단독",
  solarPv: "C-2. 태양광 단독",
  combinedSeparate: "A. 분리 설치형",
  combinedFullCoat: "B. 전체 쿨루프 + 태양광",
};

export interface ScenarioResult {
  id: ScenarioId;
  /** 쿨루프를 실제로 시공한 면적. 시공비는 이 면적으로 계산합니다 (m²) */
  coatedAreaM2: number;
  /** 냉방 효과를 계산에 넣은 쿨루프 면적 = 패널이 덮지 않은 시공 면적 (m²) */
  creditedCoolRoofAreaM2: number;
  /** 시공했지만 효과를 미산정한 패널 하부 면적 (m²). 효과가 0이라는 뜻은 아닙니다. */
  uncreditedCoatedAreaM2: number;
  /** 태양광을 설치한 면적 (m²) */
  pvAreaM2: number;
  /** 쿨루프나 태양광 중 하나라도 설치한 지붕 면적 (m²) */
  treatedRoofAreaM2: number;
  /** 태양광 설비 용량 (kW) */
  pvCapacityKw: number;
  /** 절감된 냉방 전력 (kWh/년) */
  coolingSavedKwh: number;
  /** 태양광 총발전량 (kWh/년) */
  solarGeneratedKwh: number;
  /** 총발전량 중 공장에서 쓰는 양 (kWh/년) */
  selfConsumedKwh: number;
  /** 총발전량 중 전력망으로 보내는 양 (kWh/년) */
  exportedKwh: number;
  /** 공장의 전력망 구매 감소량 = 냉방 절감 + 자가소비 (kWh/년) */
  gridPurchaseReductionKwh: number;
  coolRoofCostKrw: number;
  pvCostKrw: number;
  /** 총사업비 (원) */
  totalCostKrw: number;
  /** 대전시 부담 (원) */
  municipalCostKrw: number;
  /** 공장 소유주 부담 (원) */
  ownerCostKrw: number;
  /** 구매 감소분의 감축량 (tCO2eq/년) */
  co2GridPurchaseT: number;
  /** 역송분 중 인정된 감축량 (tCO2eq/년) */
  co2ExportT: number;
  /** 추정 온실가스 감축량 = 구매 감소분 + 인정된 역송분 (tCO2eq/년) */
  co2ReductionT: number;
  /** 한계 배출계수로 다시 계산한 값 (tCO2eq/년). 계수가 없으면 null */
  co2MarginalT: number | null;
}

export type ScenarioResults = Record<ScenarioId, ScenarioResult>;

/** 시나리오가 달라지는 지점은 "어느 면적에 무엇을 설치하고, 어느 효과를 세는가"입니다. */
export function scenarioAreas(inputs: ModelInputs, id: ScenarioId) {
  const totalRoofM2 = inputs.factoryCount * inputs.avgRoofAreaM2;
  const solarAreaM2 = totalRoofM2 * (inputs.usableSolarPct / 100);
  const exposedM2 = totalRoofM2 - solarAreaM2;

  switch (id) {
    case "coolRoof":
      return {
        totalRoofM2,
        coatedAreaM2: totalRoofM2,
        creditedCoolRoofAreaM2: totalRoofM2,
        uncreditedCoatedAreaM2: 0,
        pvAreaM2: 0,
        treatedRoofAreaM2: totalRoofM2,
      };
    case "solarPv":
      return {
        totalRoofM2,
        coatedAreaM2: 0,
        creditedCoolRoofAreaM2: 0,
        uncreditedCoatedAreaM2: 0,
        pvAreaM2: solarAreaM2,
        treatedRoofAreaM2: solarAreaM2,
      };
    case "combinedSeparate":
      return {
        totalRoofM2,
        coatedAreaM2: exposedM2,
        creditedCoolRoofAreaM2: exposedM2,
        uncreditedCoatedAreaM2: 0,
        pvAreaM2: solarAreaM2,
        treatedRoofAreaM2: totalRoofM2,
      };
    case "combinedFullCoat":
      // 같은 면적에 둘 다 설치하는 것은 물리적으로 가능합니다.
      // 다만 패널 하부의 열전달을 믿을 만하게 계산할 모델이 없어 그 효과는 세지 않습니다.
      // 비용은 전체 면적으로, 효과는 노출 면적으로 계산합니다.
      return {
        totalRoofM2,
        coatedAreaM2: totalRoofM2,
        creditedCoolRoofAreaM2: exposedM2,
        uncreditedCoatedAreaM2: solarAreaM2,
        pvAreaM2: solarAreaM2,
        treatedRoofAreaM2: totalRoofM2,
      };
  }
}

export function calculateScenario(
  inputs: ModelInputs,
  id: ScenarioId,
): ScenarioResult {
  const areas = scenarioAreas(inputs, id);
  const { totalRoofM2, coatedAreaM2, creditedCoolRoofAreaM2, pvAreaM2 } = areas;

  // [에너지] 냉방 절감량은 효과를 인정한 면적에 비례한다고 단순화합니다.
  const creditedShare = totalRoofM2 > 0 ? creditedCoolRoofAreaM2 / totalRoofM2 : 0;
  const baselineKwh = totalRoofM2 * inputs.coolingBaselineKwhPerM2;
  const coolingSavedKwh =
    baselineKwh * (inputs.coolingSavingPct / 100) * creditedShare;

  const pvCapacityKw = pvAreaM2 * inputs.pvDensityKwPerM2;
  const solarGeneratedKwh = pvCapacityKw * inputs.solarYieldKwhPerKw;

  // [전력 흐름] 발전량은 자가소비와 역송으로 나뉘며, 어느 1kWh도 두 번 세지 않습니다.
  const selfConsumedKwh = solarGeneratedKwh * (inputs.selfConsumptionPct / 100);
  const exportedKwh = solarGeneratedKwh - selfConsumedKwh;
  const gridPurchaseReductionKwh = coolingSavedKwh + selfConsumedKwh;

  // [비용] 총사업비를 대전시와 소유주가 나눠 냅니다. 둘의 합은 항상 총사업비입니다.
  const coolRoofCostKrw = coatedAreaM2 * inputs.coolRoofCostKrwPerM2;
  const pvCostKrw = pvCapacityKw * inputs.pvCostKrwPerKw;
  const totalCostKrw = coolRoofCostKrw + pvCostKrw;
  const municipalCostKrw = totalCostKrw * (inputs.subsidyPct / 100);
  const ownerCostKrw = totalCostKrw - municipalCostKrw;

  // [탄소] kWh ÷ 1000 = MWh, MWh × (tCO2eq/MWh) = tCO2eq
  const creditedExportKwh = exportedKwh * (inputs.exportCreditPct / 100);
  const toTon = (kwh: number, factor: number) => (kwh / 1000) * factor;
  const co2GridPurchaseT = toTon(
    gridPurchaseReductionKwh,
    inputs.emissionFactorTPerMwh,
  );
  const co2ExportT = toTon(creditedExportKwh, inputs.emissionFactorTPerMwh);
  const marginal = inputs.marginalEmissionFactorTPerMwh;

  return {
    id,
    coatedAreaM2,
    creditedCoolRoofAreaM2,
    uncreditedCoatedAreaM2: areas.uncreditedCoatedAreaM2,
    pvAreaM2,
    treatedRoofAreaM2: areas.treatedRoofAreaM2,
    pvCapacityKw,
    coolingSavedKwh,
    solarGeneratedKwh,
    selfConsumedKwh,
    exportedKwh,
    gridPurchaseReductionKwh,
    coolRoofCostKrw,
    pvCostKrw,
    totalCostKrw,
    municipalCostKrw,
    ownerCostKrw,
    co2GridPurchaseT,
    co2ExportT,
    co2ReductionT: co2GridPurchaseT + co2ExportT,
    co2MarginalT:
      marginal === null
        ? null
        : toTon(gridPurchaseReductionKwh + creditedExportKwh, marginal),
  };
}

export function calculateAll(inputs: ModelInputs): ScenarioResults {
  return {
    coolRoof: calculateScenario(inputs, "coolRoof"),
    solarPv: calculateScenario(inputs, "solarPv"),
    combinedSeparate: calculateScenario(inputs, "combinedSeparate"),
    combinedFullCoat: calculateScenario(inputs, "combinedFullCoat"),
  };
}

/**
 * 설치 면적 가정에 따른 차이.
 * 두 단독 시나리오의 합은 "모든 면적에 두 기술의 전체 효과가 온전히 나타난다"는 가정이고,
 * A와 B는 패널 영역의 쿨루프 시공·효과를 다르게 가정합니다.
 */
export function installationAreaDifference(results: ScenarioResults) {
  const sumCoolingKwh =
    results.coolRoof.coolingSavedKwh + results.solarPv.coolingSavedKwh;
  const sumCostKrw = results.coolRoof.totalCostKrw + results.solarPv.totalCostKrw;
  const compare = (id: "combinedSeparate" | "combinedFullCoat") => ({
    coolingDiffKwh: sumCoolingKwh - results[id].coolingSavedKwh,
    costDiffKrw: sumCostKrw - results[id].totalCostKrw,
  });
  return {
    sumCoolingKwh,
    sumCostKrw,
    separate: compare("combinedSeparate"),
    fullCoat: compare("combinedFullCoat"),
  };
}

export type SweepRow = { x: number } & Record<ScenarioId, number>;

/** 입력값 하나만 바꿔 가며 CO2 감축량이 어떻게 변하는지 계산합니다(민감도 분석). */
export function sweepCo2(
  inputs: ModelInputs,
  key: NumericInputKey,
  from: number,
  to: number,
  steps: number,
): SweepRow[] {
  const rows: SweepRow[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const raw = from + ((to - from) * i) / steps;
    // 공장 수는 정수만 의미가 있습니다.
    const x = key === "factoryCount" ? Math.round(raw) : raw;
    const results = calculateAll({ ...inputs, [key]: x });
    rows.push({
      x,
      coolRoof: results.coolRoof.co2ReductionT,
      solarPv: results.solarPv.co2ReductionT,
      combinedSeparate: results.combinedSeparate.co2ReductionT,
      combinedFullCoat: results.combinedFullCoat.co2ReductionT,
    });
  }
  return rows;
}
