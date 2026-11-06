import { useState } from "react";
import { buildFormulaSteps } from "@/lib/formulas";
import {
  SCENARIO_IDS,
  SCENARIO_LABELS,
  type ModelInputs,
  type ScenarioId,
  type ScenarioResults,
} from "@/lib/model";

const LIMITS = [
  "냉방 절감량이 시공 면적에 정확히 비례한다고 단순화했습니다. 실제 효과는 단열, 층수, 설비에 따라 다릅니다.",
  "패널 그늘이 지붕 온도를 낮추는 효과와, 쿨루프가 패널 온도나 양면 패널 발전량에 미치는 영향은 넣지 않았습니다.",
  "쿨루프가 겨울 난방 전력을 늘릴 수 있는 효과(겨울철 불이익)를 넣지 않았습니다.",
  "발전한 전기를 공장이 쓰는지 전력망으로 보내는지 구분하지 않고, 모두 전력망 전기를 대체한다고 가정합니다.",
  "배출계수는 전력망 평균값입니다. 실제로 줄어드는 발전원의 배출과는 다를 수 있습니다.",
  "설치비만 다룹니다. 유지보수, 패널 교체, 구조 보강, 전기요금 절감, 수익 같은 경제성은 계산하지 않습니다.",
];

export function FormulaPanel({
  inputs,
  results,
}: {
  inputs: ModelInputs;
  results: ScenarioResults;
}) {
  const [scenario, setScenario] = useState<ScenarioId>("combined");
  const steps = buildFormulaSteps(inputs, scenario, results[scenario]);

  return (
    <div>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-medium">풀이를 볼 시나리오</legend>
        <div className="flex flex-wrap gap-1.5">
          {SCENARIO_IDS.map((id) => (
            <label
              key={id}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-focus ${
                scenario === id
                  ? "border-solid bg-solid text-on-solid"
                  : "border-line-strong hover:bg-sunken"
              }`}
            >
              <input
                type="radio"
                name="formula-scenario"
                className="sr-only"
                checked={scenario === id}
                onChange={() => setScenario(id)}
              />
              {SCENARIO_LABELS[id]}
            </label>
          ))}
        </div>
      </fieldset>

      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.title} className="border-b border-line pb-3 last:border-0">
            <h3 className="text-sm font-semibold">{step.title}</h3>
            <p className="mt-1 text-sm leading-6">{step.formula}</p>
            <p className="mt-1 rounded bg-sunken px-2.5 py-1.5 text-sm tabular-nums">
              {step.substituted}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-2">
              <span className="font-medium">단위 확인</span> {step.units}
            </p>
            <p className="text-xs leading-5 text-ink-2">{step.why}</p>
          </li>
        ))}
      </ol>

      <h3 className="mt-5 text-sm font-semibold">이 모델이 계산하지 않는 것</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-2">
        {LIMITS.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </div>
  );
}
