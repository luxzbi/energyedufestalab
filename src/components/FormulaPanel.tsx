import { useState } from "react";
import { EMISSION_FACTOR_EXPLANATION, LIMITATIONS } from "@/lib/assumptions";
import { buildFormulaSteps } from "@/lib/formulas";
import {
  SCENARIO_IDS,
  SCENARIO_LABELS,
  type ModelInputs,
  type ScenarioId,
  type ScenarioResults,
} from "@/lib/model";

/** 설치 유형 설명. 같은 면적에 함께 설치하는 것이 불가능하다는 오해를 막습니다. */
export function InstallationTypes() {
  return (
    <div className="space-y-2 text-sm leading-6">
      <ul className="list-disc space-y-1 pl-5 text-ink-2">
        <li>
          <strong className="font-semibold text-ink">A. 분리 설치형</strong>: 패널 설치 영역에는 시공하지
          않고 나머지 면적에만 쿨루프를 시공합니다.
        </li>
        <li>
          <strong className="font-semibold text-ink">B. 전체 쿨루프 + 태양광형</strong>: 지붕 전체에 쿨루프를
          시공하고 일부 위에 패널을 놓습니다. 시공비는 전체 면적으로 계산하지만, 패널 하부의 냉방 효과는
          미산정합니다.
        </li>
        <li>
          <strong className="font-semibold text-ink">C. 쿨루프 단독, 태양광 단독</strong>: 각 기술의 독립적인
          효과를 비교합니다.
        </li>
      </ul>
      <p className="text-ink-2">
        같은 면적에 쿨루프와 태양광을 함께 설치하는 것은 물리적으로 가능합니다. 다만 패널 아래 지붕은 그늘이
        지고 패널과 지붕 사이의 공기 흐름과 복사가 달라져, 노출된 지붕과 같은 효과를 낸다고 볼 수 없습니다. 고반사
        지붕에 패널을 놓았을 때 실내 열 획득이 10.8% 늘었다는 중국 우한의 수치 모델 연구도 있어, 이 도구는 패널
        하부 효과의 크기와 방향을 단정하지 않고 미산정합니다. 미산정은 효과가 0이라는 뜻이 아닙니다.{" "}
        <a
          className="text-ink underline underline-offset-2"
          href="https://orbit.dtu.dk/en/publications/shading-effect-and-energy-saving-potential-of-rooftop-photovoltai/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ma 외, Solar Energy (2023)
          <span className="sr-only"> (새 창, 외부 사이트)</span>
        </a>
      </p>
    </div>
  );
}

export function EmissionFactorNotes() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-ink-2">
      {EMISSION_FACTOR_EXPLANATION.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

export function FormulaPanel({
  inputs,
  results,
}: {
  inputs: ModelInputs;
  results: ScenarioResults;
}) {
  const [scenario, setScenario] = useState<ScenarioId>("combinedSeparate");
  const steps = buildFormulaSteps(inputs, scenario, results[scenario]);

  return (
    <div>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-medium">풀이를 볼 설치 유형</legend>
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
        {LIMITATIONS.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </div>
  );
}
