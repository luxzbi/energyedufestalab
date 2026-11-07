import { formatKrw, formatKwh, formatNumber, formatTon } from "@/lib/format";
import {
  installationAreaDifference,
  SCENARIO_IDS,
  SCENARIO_LABELS,
  type ScenarioResult,
  type ScenarioResults,
} from "@/lib/model";
import { Note, TABLE_HEAD, TD_NUM, TH, TH_NUM } from "./ui";

const area = (m2: number) => `${formatNumber(m2)} m²`;

const ROWS: {
  label: string;
  unit: string;
  value: (r: ScenarioResult) => string;
}[] = [
  { label: "쿨루프 시공 면적", unit: "", value: (r) => area(r.coatedAreaM2) },
  {
    label: "쿨루프 효과 미산정 면적",
    unit: "패널 하부",
    value: (r) => (r.uncreditedCoatedAreaM2 > 0 ? area(r.uncreditedCoatedAreaM2) : "해당 없음"),
  },
  { label: "태양광 면적", unit: "", value: (r) => area(r.pvAreaM2) },
  { label: "냉방 전력 절감량", unit: "연간", value: (r) => formatKwh(r.coolingSavedKwh) },
  { label: "태양광 총발전량", unit: "연간", value: (r) => formatKwh(r.solarGeneratedKwh) },
  { label: "태양광 자가소비량", unit: "연간", value: (r) => formatKwh(r.selfConsumedKwh) },
  { label: "전력망 역송량", unit: "연간", value: (r) => formatKwh(r.exportedKwh) },
  { label: "전력망 구매 감소", unit: "연간", value: (r) => formatKwh(r.gridPurchaseReductionKwh) },
  { label: "총사업비", unit: "설치 1회", value: (r) => formatKrw(r.totalCostKrw) },
  { label: "대전시 부담", unit: "설치 1회", value: (r) => formatKrw(r.municipalCostKrw) },
  { label: "소유주 부담", unit: "설치 1회", value: (r) => formatKrw(r.ownerCostKrw) },
  { label: "감축량: 구매 감소분", unit: "연간", value: (r) => formatTon(r.co2GridPurchaseT) },
  { label: "감축량: 인정된 역송분", unit: "연간", value: (r) => formatTon(r.co2ExportT) },
  { label: "추정 온실가스 감축량", unit: "평균 계수", value: (r) => formatTon(r.co2ReductionT) },
  {
    label: "추정 온실가스 감축량",
    unit: "한계 계수",
    value: (r) => (r.co2MarginalT === null ? "미산정" : formatTon(r.co2MarginalT)),
  },
];

export function ResultsTable({ results }: { results: ScenarioResults }) {
  const diff = installationAreaDifference(results);

  return (
    <>
      {/* 작은 화면: 다섯 열이 들어가지 않으므로 유형별 목록으로 보여 줍니다. */}
      <div className="space-y-3 lg:hidden">
        {SCENARIO_IDS.map((id) => (
          <div key={id} className="rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold">{SCENARIO_LABELS[id]}</h3>
            <dl className="mt-1 text-sm">
              {ROWS.map((row) => (
                <div
                  key={`${row.label}${row.unit}`}
                  className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 first:border-0"
                >
                  <dt>
                    {row.label}
                    {row.unit && <span className="ml-1 text-xs text-ink-3">{row.unit}</span>}
                  </dt>
                  <dd className="text-right whitespace-nowrap tabular-nums">
                    {row.value(results[id])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">
            설치 유형별 가정 기반 계산 결과. 측정값이 아닙니다.
          </caption>
          <thead>
            <tr className={TABLE_HEAD}>
              <th scope="col" className={TH}>
                항목
              </th>
              {SCENARIO_IDS.map((id) => (
                <th key={id} scope="col" className={TH_NUM}>
                  {SCENARIO_LABELS[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={`${row.label}${row.unit}`} className="border-b border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {row.label}
                  {row.unit && <span className="ml-1.5 text-xs text-ink-3">{row.unit}</span>}
                </th>
                {SCENARIO_IDS.map((id) => (
                  <td key={id} className={TD_NUM}>
                    {row.value(results[id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <Note title="설치 면적 가정에 따른 차이.">
          두 단독 유형의 값을 그대로 더하면 냉방 절감 {formatKwh(diff.sumCoolingKwh)}, 사업비{" "}
          {formatKrw(diff.sumCostKrw)}입니다. 유형 A는 패널 영역에 쿨루프를 시공하지 않아 합계보다 냉방
          절감이 {formatKwh(diff.separate.coolingDiffKwh)}, 사업비가{" "}
          {formatKrw(diff.separate.costDiffKrw)} 적습니다. 유형 B는 사업비가 합계와 같지만, 패널 하부 효과를
          미산정해 냉방 절감이 {formatKwh(diff.fullCoat.coolingDiffKwh)} 적게 표시됩니다.
        </Note>
      </div>
    </>
  );
}
