import { formatKrw, formatKwh, formatTon } from "@/lib/format";
import {
  overlapCorrection,
  SCENARIO_IDS,
  SCENARIO_LABELS,
  type ScenarioResult,
  type ScenarioResults,
} from "@/lib/model";

const ROWS: {
  label: string;
  unit: string;
  value: (r: ScenarioResult) => string;
}[] = [
  { label: "절감 냉방 전력", unit: "연간", value: (r) => formatKwh(r.coolingSavedKwh) },
  { label: "태양광 발전량", unit: "연간", value: (r) => formatKwh(r.solarGeneratedKwh) },
  { label: "총사업비", unit: "설치 1회", value: (r) => formatKrw(r.totalCostKrw) },
  { label: "지자체 부담", unit: "설치 1회", value: (r) => formatKrw(r.municipalCostKrw) },
  { label: "소유주 부담", unit: "설치 1회", value: (r) => formatKrw(r.ownerCostKrw) },
  { label: "추정 CO2 감축량", unit: "연간", value: (r) => formatTon(r.co2ReductionT) },
];

export function ResultsTable({ results }: { results: ScenarioResults }) {
  const overlap = overlapCorrection(results);

  return (
    <>
      {/* 작은 화면: 네 열이 들어가지 않으므로 시나리오별 목록으로 보여 줍니다. */}
      <div className="space-y-3 sm:hidden">
        {SCENARIO_IDS.map((id) => (
          <div key={id} className="rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold">{SCENARIO_LABELS[id]}</h3>
            <dl className="mt-1 text-sm">
              {ROWS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 first:border-0"
                >
                  <dt>
                    {row.label}
                    <span className="ml-1 text-xs text-ink-3">{row.unit}</span>
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

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">
            시나리오별 가정 계산 결과. 측정값이 아닙니다.
          </caption>
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th scope="col" className="py-2 pr-3 font-medium">
                항목
              </th>
              {SCENARIO_IDS.map((id) => (
                <th key={id} scope="col" className="px-2 py-2 text-right font-medium">
                  {SCENARIO_LABELS[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {row.label}
                  <span className="ml-1.5 text-xs text-ink-3">{row.unit}</span>
                </th>
                {SCENARIO_IDS.map((id) => (
                  <td key={id} className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {row.value(results[id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 rounded-md bg-sunken p-3 text-sm leading-6 text-ink-2">
        <strong className="font-semibold text-ink">결합은 단순 합이 아닙니다.</strong>{" "}
        두 단독 시나리오를 그냥 더하면 냉방 절감이{" "}
        {formatKwh(overlap.coolingOverstatedKwh)}, 사업비가{" "}
        {formatKrw(overlap.costOverstatedKrw)} 더 크게 나옵니다. 패널이 덮은 지붕에는
        쿨루프를 시공하지 않기 때문입니다.
      </p>
    </>
  );
}
