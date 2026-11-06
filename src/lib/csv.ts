import { FIELD_SPECS } from "./fields";
import type { Measurement } from "./measurements";
import {
  SCENARIO_IDS,
  SCENARIO_LABELS,
  type ModelInputs,
  type ScenarioResults,
} from "./model";

export const HYPOTHETICAL_KIND = "가정 계산(측정값 아님)";
export const MEASURED_KIND = "사람 측정";

/**
 * CSV 칸 하나를 안전한 문자열로 바꿉니다.
 * - 쉼표, 따옴표, 줄바꿈이 있으면 따옴표로 감쌉니다.
 * - =, +, -, @ 로 시작하는 글자는 엑셀이 수식으로 실행할 수 있어 앞에 '를 붙입니다.
 *   숫자 칸은 number로 넘어오므로 음수 측정값은 그대로 유지됩니다.
 */
export function escapeCell(cell: string | number): string {
  if (typeof cell === "number") return String(cell);
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** 맨 앞의 BOM은 엑셀이 한글을 UTF-8로 읽게 합니다. */
function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

/** 0.1 + 0.2 같은 부동소수점 잔여 자릿수를 파일에서 지웁니다. */
const clean = (n: number) => Number(n.toFixed(6));

export function buildResultsCsv(
  inputs: ModelInputs,
  results: ScenarioResults,
): string {
  const rows: (string | number)[][] = [
    ["데이터 구분", "시나리오", "항목", "값", "단위"],
  ];

  for (const field of FIELD_SPECS) {
    rows.push([
      "가정 입력값",
      "공통",
      field.label,
      inputs[field.key],
      field.unit,
    ]);
  }

  for (const id of SCENARIO_IDS) {
    const r = results[id];
    const items: [string, number, string][] = [
      ["절감 냉방 전력", r.coolingSavedKwh, "kWh/년"],
      ["태양광 발전량", r.solarGeneratedKwh, "kWh/년"],
      ["총사업비", r.totalCostKrw, "원"],
      ["지자체 부담", r.municipalCostKrw, "원"],
      ["소유주 부담", r.ownerCostKrw, "원"],
      ["추정 CO2 감축량", r.co2ReductionT, "tCO2eq/년"],
    ];
    for (const [label, value, unit] of items) {
      rows.push([HYPOTHETICAL_KIND, SCENARIO_LABELS[id], label, clean(value), unit]);
    }
  }
  return toCsv(rows);
}

export function buildMeasurementsCsv(records: Measurement[]): string {
  const rows: (string | number)[][] = [
    [
      "데이터 구분",
      "측정 일시",
      "측정자",
      "장소",
      "조건",
      "항목",
      "값",
      "단위",
      "기기",
      "메모",
    ],
  ];
  for (const r of records) {
    rows.push([
      MEASURED_KIND,
      r.measuredAt,
      r.observer,
      r.site,
      r.condition,
      r.metric,
      r.value,
      r.unit,
      r.instrument,
      r.notes,
    ]);
  }
  return toCsv(rows);
}
