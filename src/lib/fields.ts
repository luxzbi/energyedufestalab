import type { ModelInputs } from "./model";

/** 값의 성격. 출처가 있는 값과 임의로 정한 값을 화면에서 구분하는 데 씁니다. */
export type EvidenceLevel = "reference" | "weak" | "arbitrary";

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  reference: "참고 출처 있음",
  weak: "근거 약함",
  arbitrary: "임의 가정",
};

export interface SourceLink {
  label: string;
  url: string;
}

export interface FieldSpec {
  key: keyof ModelInputs;
  label: string;
  unit: string;
  defaultValue: string;
  /** 넘으면 계산을 막는 한계 */
  min: number;
  max: number;
  /** min 값 자체를 허용하지 않을 때 true (예: 0으로 두면 의미 없는 값) */
  exclusiveMin?: boolean;
  integer?: boolean;
  /** 벗어나면 계산은 하되 경고하는 일반 범위 */
  typical?: [number, number];
  group: "규모" | "태양광" | "냉방 (가정)" | "비용" | "탄소";
  evidence: EvidenceLevel;
  /** 이 기본값을 왜 골랐고 어디까지 믿을 수 있는지 */
  note: string;
  sources?: SourceLink[];
}

export const FIELD_SPECS: FieldSpec[] = [
  {
    key: "factoryCount",
    label: "공장 수",
    unit: "개",
    defaultValue: "100",
    min: 1,
    max: 100000,
    integer: true,
    group: "규모",
    evidence: "arbitrary",
    note: "계산을 보여 주기 위한 임의의 값입니다. 대전 산업단지의 실제 공장 수가 아닙니다.",
  },
  {
    key: "avgRoofAreaM2",
    label: "평균 지붕 면적",
    unit: "m²",
    defaultValue: "2000",
    min: 0,
    exclusiveMin: true,
    max: 1000000,
    group: "규모",
    evidence: "arbitrary",
    note: "계산을 보여 주기 위한 임의의 값입니다. 건축물대장 등 실제 자료로 바꿔야 합니다.",
  },
  {
    key: "usableSolarPct",
    label: "태양광 설치 가능 면적",
    unit: "%",
    defaultValue: "60",
    min: 0,
    max: 100,
    group: "태양광",
    evidence: "arbitrary",
    note: "구조 하중, 환기 설비, 그늘에 따라 크게 달라지는 값이며 대전 공장을 조사한 값이 아닙니다.",
  },
  {
    key: "pvDensityKwPerM2",
    label: "태양광 용량 밀도",
    unit: "kW/m²",
    defaultValue: "0.12",
    min: 0,
    exclusiveMin: true,
    // 표준 시험 조건의 일사량이 1kW/m²이므로 효율 100%라도 이를 넘을 수 없습니다.
    max: 1,
    typical: [0.08, 0.25],
    group: "태양광",
    evidence: "weak",
    note: "상업용 평지붕의 시스템 밀도 100~140W/m²의 중간값입니다. 패널 자체 밀도(200~230W/m²)보다 낮은 이유는 줄 간격과 통로까지 면적에 포함하기 때문입니다. 태양광 업체의 용어집이 출처이며, 경사 없이 밀착 시공하면 더 높아질 수 있습니다.",
    sources: [
      {
        label: "SurgePV 용어집: Power Density",
        url: "https://www.surgepv.com/glossary/power-density",
      },
    ],
  },
  {
    key: "solarYieldKwhPerKw",
    label: "연간 발전량",
    unit: "kWh/kW·년",
    defaultValue: "1314",
    min: 0,
    exclusiveMin: true,
    // 1kW가 1년 내내(8,760시간) 정격 출력을 내는 것이 물리적 상한입니다.
    max: 8760,
    typical: [900, 1700],
    group: "태양광",
    evidence: "reference",
    note: "이용률 15%를 환산한 값입니다(8,760시간 × 15% = 1,314). 정부 자료의 2016~2018년 이용률은 14.9~16.0%였습니다. 전국 기준이며 대전 값이 아닙니다. 분기 통계(2026년 1분기 14.52%, 2분기 19.18%)는 계절 영향이 커서 연평균으로 쓰면 안 됩니다.",
    sources: [
      {
        label: "산업통상자원부 해명자료(2019)",
        url: "https://www.motir.go.kr/attach/down/095a2dda9c864e1d90d751f7668a1117/8ebc03e2a86f86654463a713c6cb2170",
      },
      {
        label: "한국에너지공단 RPS 통계",
        url: "https://recloud.energy.or.kr/rps/main/main01.do",
      },
    ],
  },
  {
    key: "coolingBaselineKwhPerM2",
    label: "가정 냉방 전력 기준값",
    unit: "kWh/m²·년",
    defaultValue: "30",
    min: 0,
    max: 1000,
    group: "냉방 (가정)",
    evidence: "arbitrary",
    note: "출처 없는 임의의 값입니다. 냉방 절감량이 이 값에 그대로 비례하므로, 공장의 전기요금 자료로 바꾸기 전에는 어떤 결론의 근거로도 쓰면 안 됩니다.",
  },
  {
    key: "coolingSavingPct",
    label: "가정 냉방 절감률",
    unit: "%",
    defaultValue: "10",
    min: 0,
    max: 100,
    typical: [0, 50],
    group: "냉방 (가정)",
    evidence: "arbitrary",
    note: "임의의 값이며 측정값이 아닙니다. 해외 사례와 국내 아파트 실증 결과가 있지만, 대전 공장에 적용할 수 있는 값을 찾지 못했습니다. 단열이 잘된 건물일수록 효과가 작을 수 있습니다. 로마 산업용 건물 내 사무실은 평균 38%, 서울 SH 아파트 실증은 26.4%였습니다.",
    sources: [
      {
        label: "Pisello 외, Clima 2013 (로마 산업용 건물)",
        url: "https://iifiir.org/en/fridoc/analysis-of-a-cool-roof-system-for-reducing-cooling-loads-and-improving-29930",
      },
      {
        label: "서울시 보도자료 (SH 아파트 26.4%)",
        url: "https://www.seoul.go.kr/news/news_report.do?nttNo=458715",
      },
    ],
  },
  {
    key: "coolRoofCostKrwPerM2",
    label: "쿨루프 시공 단가",
    unit: "원/m²",
    defaultValue: "40000",
    min: 0,
    max: 10000000,
    group: "비용",
    evidence: "weak",
    note: "서울시 사업 규모(13억 원 ÷ 31,204m² ≈ 41,700원/m²)를 어림한 값입니다. 노후주택·복지시설 대상이고 예산에 시공비 외 항목이 포함됐을 수 있습니다. 공장 지붕 단가는 찾지 못했으니 견적으로 바꿔야 합니다. 참고로 남해군·창원시(2023, 단독주택)의 지원액은 15,000원/m²이며, 이는 시공비가 아니라 지원 단가입니다.",
    sources: [
      {
        label: "서울시 보도자료",
        url: "https://www.seoul.go.kr/news/news_report.do?nttNo=458715",
      },
      {
        label: "창원시 지원사업 기사(2023)",
        url: "https://newsseoul.co.kr/news/view/1065584424823175",
      },
    ],
  },
  {
    key: "pvCostKrwPerKw",
    label: "태양광 설치 단가",
    unit: "원/kW",
    defaultValue: "2000000",
    min: 0,
    max: 100000000,
    group: "비용",
    evidence: "weak",
    note: "가정용 태양광이 kW당 약 200만 원 내외(2025~2026년 기준)라는 비공식 사이트의 수치를 임시로 쓴 값입니다. 그 사이트가 인용한 한국에너지공단 자료 원문은 확인하지 못했습니다. 공장 규모의 단가와 다를 수 있으니 견적으로 바꿔야 합니다. 구조 보강비는 포함되지 않았습니다.",
    sources: [
      {
        label: "글래스월렛: 태양광 설치비용 (비공식)",
        url: "https://glasswallet.com/calculate/solar-panel-roi/installation-cost",
      },
    ],
  },
  {
    key: "subsidyPct",
    label: "지자체 보조율",
    unit: "%",
    defaultValue: "50",
    min: 0,
    max: 100,
    group: "비용",
    evidence: "arbitrary",
    note: "제안 정책의 조절 변수이며 현행 제도의 보조율이 아닙니다. 쿨루프와 태양광에 같은 비율을 적용합니다.",
  },
  {
    key: "emissionFactorTPerMwh",
    label: "전력 배출계수",
    unit: "tCO2eq/MWh",
    defaultValue: "0.4173",
    min: 0,
    max: 2,
    typical: [0.2, 0.7],
    group: "탄소",
    evidence: "reference",
    note: "기후에너지환경부가 2025년 12월 18일 공표한 2023년도 값으로 보도됐습니다. 언론 기사로만 확인했고 공식 원문은 확인하지 못했으니 인용 전에 대조하세요. 매년 갱신될 예정이라 더 새로운 값이 있을 수 있습니다.",
    sources: [
      {
        label: "쿠키뉴스(2025-12-18)",
        url: "https://www.kukinews.com/article/view/kuk202512180131",
      },
    ],
  },
];

/** 입력칸은 입력 중인 문자열을 그대로 보관합니다("0." 같은 중간 상태 유지). */
export type RawInputs = Record<keyof ModelInputs, string>;

export const DEFAULT_RAW_INPUTS = Object.fromEntries(
  FIELD_SPECS.map((field) => [field.key, field.defaultValue]),
) as RawInputs;

export interface ValidationResult {
  /** 오류가 하나라도 있으면 null. 잘못된 값으로 계산하지 않기 위해서입니다. */
  values: ModelInputs | null;
  errors: Partial<Record<keyof ModelInputs, string>>;
  warnings: Partial<Record<keyof ModelInputs, string>>;
}

const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;

/** 숫자로 볼 수 없으면 null. Number("")가 0이 되는 함정을 피합니다. */
export function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!PLAIN_NUMBER.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function validateInputs(raw: RawInputs): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  const warnings: ValidationResult["warnings"] = {};
  const values = {} as ModelInputs;

  for (const field of FIELD_SPECS) {
    const text = raw[field.key] ?? "";
    if (text.trim() === "") {
      errors[field.key] = "값을 입력하세요.";
      continue;
    }

    const value = parseNumber(text);
    if (value === null) {
      errors[field.key] = "쉼표 없이 숫자만 입력하세요.";
      continue;
    }
    if (field.integer && !Number.isInteger(value)) {
      errors[field.key] = "정수로 입력하세요.";
      continue;
    }
    if (field.exclusiveMin ? value <= field.min : value < field.min) {
      errors[field.key] = field.exclusiveMin
        ? `${field.min}보다 커야 합니다.`
        : `${field.min} 이상이어야 합니다.`;
      continue;
    }
    if (value > field.max) {
      errors[field.key] = `${field.max.toLocaleString("ko-KR")} 이하여야 합니다.`;
      continue;
    }

    if (field.typical && (value < field.typical[0] || value > field.typical[1])) {
      warnings[field.key] =
        `일반 범위(${field.typical[0]}~${field.typical[1]})를 벗어났습니다. 단위를 확인하세요.`;
    }
    values[field.key] = value;
  }

  return {
    values: Object.keys(errors).length === 0 ? values : null,
    errors,
    warnings,
  };
}
