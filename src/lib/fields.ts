import type { ModelInputs } from "./model";

/** 값의 성격. 출처가 있는 값과 임의로 정한 값을 화면에서 구분하는 데 씁니다. */
export type EvidenceLevel =
  | "reference"
  | "unverified"
  | "weak"
  | "proposal"
  | "arbitrary"
  | "notSet";

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  reference: "참고 출처 있음",
  unverified: "검증 전 참고값",
  weak: "근거 약함",
  proposal: "정책 제안값",
  arbitrary: "임의 가정",
  notSet: "미입력 시 미산정",
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
  /** 비워 둘 수 있는 값. 비우면 null이 됩니다. */
  optional?: boolean;
  /** 벗어나면 계산은 하되 경고하는 일반 범위 */
  typical?: [number, number];
  group: "규모" | "태양광" | "냉방 (가정)" | "비용" | "전력 흐름·탄소";
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
    note: "계산을 보여 주기 위한 임의의 값입니다. 대전 대화동 산업단지의 실제 공장 수가 아닙니다.",
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
    label: "연간 태양광 발전량",
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
        label: "산업통상자원부 보도해명자료(2019-08-12)",
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
    label: "대전시 지원율",
    unit: "%",
    defaultValue: "70",
    min: 0,
    max: 100,
    group: "비용",
    evidence: "proposal",
    note: "이 연구의 정책 제안값이며 실제 운영 중인 대전시 제도가 아닙니다. 쿨루프와 태양광에 같은 비율을 적용합니다. 지원율이 높아도 공장이 참여한다는 보장은 없습니다. 2024년 산업단지공단 조사에서 응답 기업 500곳의 91.6%가 태양광 설치 계획이 없었고, 60.5%는 지원을 늘려도 설치 의향이 없다고 답했습니다. 이 모델에는 참여 의사가 들어 있지 않습니다.",
    sources: [
      {
        label: "아시아경제: 산업단지 지붕 태양광 수요조사(2024)",
        url: "https://www.asiae.co.kr/en/article/2024100709355316824",
      },
    ],
  },
  {
    key: "selfConsumptionPct",
    label: "태양광 자가소비 비율",
    unit: "%",
    defaultValue: "70",
    min: 0,
    max: 100,
    group: "전력 흐름·탄소",
    evidence: "arbitrary",
    note: "한국 공장의 자가소비 비율 통계를 찾지 못해 임의로 둔 값입니다. 조업 시간과 주말 휴무, 공장 부하에 따라 크게 달라지므로 시간별 전력 자료로 확인해야 합니다. 스페인 공장 두 곳에서 90% 사례가 보고됐지만 한국에 그대로 적용할 수 없습니다.",
    sources: [
      {
        label: "Photovoltaic Self-Consumption in Industrial Cooling and Refrigeration",
        url: "https://ruja.ujaen.es/items/1e36704f-e14f-4436-82c8-d1811f2eaa54/full",
      },
    ],
  },
  {
    key: "exportCreditPct",
    label: "역송분 감축 인정 비율",
    unit: "%",
    defaultValue: "100",
    min: 0,
    max: 100,
    group: "전력 흐름·탄소",
    evidence: "arbitrary",
    note: "역송 전력도 전력망의 다른 발전을 대체한다고 보면 100%입니다. 다만 역송분의 감축 실적을 다른 주체가 사 가면 이 사업의 실적으로 다시 세면 안 되므로, 그 경우 낮춰서 비교합니다. 어떤 기준을 쓸지는 인증 제도를 확인해야 합니다.",
  },
  {
    key: "emissionFactorTPerMwh",
    label: "평균 전력 배출계수",
    unit: "tCO2eq/MWh",
    defaultValue: "0.4173",
    min: 0,
    max: 2,
    typical: [0.2, 0.7],
    group: "전력 흐름·탄소",
    evidence: "unverified",
    note: "기후에너지환경부가 2025년 12월 공표한 2023년도 값으로, 언론 보도 2곳의 수치가 일치합니다. 부처 게시판 원문은 열리지 않아 확인하지 못했으니 인용 전에 대조하세요. 갱신 주기가 1년으로 바뀌어 더 새로운 값이 있을 수 있습니다. 전력망 평균값입니다.",
    sources: [
      {
        label: "에너지데일리(2025-12-18)",
        url: "https://www.energydaily.co.kr/news/articleView.html?idxno=163115",
      },
      {
        label: "쿠키뉴스(2025-12-18)",
        url: "https://www.kukinews.com/article/view/kuk202512180131",
      },
    ],
  },
  {
    key: "marginalEmissionFactorTPerMwh",
    label: "비교용 한계 배출계수",
    unit: "tCO2eq/MWh",
    defaultValue: "",
    min: 0,
    max: 2,
    optional: true,
    typical: [0.2, 1.2],
    group: "전력 흐름·탄소",
    evidence: "notSet",
    note: "믿을 만한 한국 값을 찾지 못해 기본값을 비워 두었습니다. 값을 지어내지 않기 위해서입니다. 자료를 찾으면 입력해 평균 계수 결과와 비교하세요. 비워 두면 결과에 미산정으로 표시됩니다.",
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
  const values = {} as Record<keyof ModelInputs, number | null>;

  for (const field of FIELD_SPECS) {
    const text = raw[field.key] ?? "";
    if (text.trim() === "") {
      if (field.optional) values[field.key] = null;
      else errors[field.key] = "값을 입력하세요.";
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
    values:
      Object.keys(errors).length === 0 ? (values as unknown as ModelInputs) : null,
    errors,
    warnings,
  };
}

/** 숫자 입력값을 입력칸용 문자열로 되돌립니다. 실행 기록 복원에 씁니다. */
export function toRawInputs(inputs: ModelInputs): RawInputs {
  return Object.fromEntries(
    FIELD_SPECS.map((field) => {
      const value = inputs[field.key];
      return [field.key, value === null ? "" : String(value)];
    }),
  ) as RawInputs;
}
