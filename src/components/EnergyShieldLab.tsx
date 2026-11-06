"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMeasurementsCsv, buildResultsCsv } from "@/lib/csv";
import { DEFAULT_RAW_INPUTS, validateInputs, type RawInputs } from "@/lib/fields";
import type { Measurement } from "@/lib/measurements";
import { calculateAll } from "@/lib/model";
import {
  loadInputs,
  loadMeasurements,
  saveInputs,
  saveMeasurements,
  type KeyValueStore,
} from "@/lib/storage";
import { ScenarioCharts, SensitivityChart } from "./Charts";
import { FormulaPanel } from "./FormulaPanel";
import { InputPanel } from "./InputPanel";
import { MeasurementLab } from "./MeasurementLab";
import { ResultsTable } from "./ResultsTable";
import { SourceNotes } from "./SourceNotes";
import { BUTTON_SECONDARY, DataKindBadge, Section } from "./ui";

/** 사생활 보호 설정 등으로 localStorage 접근 자체가 막히면 null입니다. */
function getStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const NAV = [
  ["results", "결과"],
  ["charts", "차트"],
  ["logic", "계산 논리"],
  ["sources", "출처와 가정"],
  ["measurements", "측정 기록"],
] as const;

export default function EnergyShieldLab() {
  const [store] = useState(getStore);
  const [raw, setRaw] = useState<RawInputs>(() =>
    store ? loadInputs(store) : { ...DEFAULT_RAW_INPUTS },
  );
  const [loaded] = useState(() =>
    store ? loadMeasurements(store) : { records: [], recovered: false },
  );
  const [records, setRecords] = useState<Measurement[]>(loaded.records);
  const [resetMessage, setResetMessage] = useState("");

  const [inputsSaved, setInputsSaved] = useState(true);
  const [recordsSaved, setRecordsSaved] = useState(true);

  useEffect(() => {
    // 저장소가 없거나 가득 찼다면 그 사실을 화면에 알립니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소 쓰기의 결과를 표시합니다.
    setInputsSaved(store ? saveInputs(store, raw) : false);
  }, [store, raw]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소 쓰기의 결과를 표시합니다.
    setRecordsSaved(store ? saveMeasurements(store, records) : false);
  }, [store, records]);

  const validation = useMemo(() => validateInputs(raw), [raw]);
  const inputs = validation.values;
  const results = useMemo(() => (inputs ? calculateAll(inputs) : null), [inputs]);
  const errorCount = Object.keys(validation.errors).length;

  const resultsBlocked = (
    <p role="alert" className="rounded-md border border-danger p-3 text-sm text-danger">
      입력 오류 {errorCount}개를 고칠 때까지 계산을 멈춥니다. 잘못된 값으로 만든 숫자를
      보여 주지 않기 위해서입니다.
    </p>
  );

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-5 sm:px-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-bold">Energy Shield Lab</h1>
          <p className="text-sm text-ink-2">
            대전 산업단지 지붕의 쿨루프 + 태양광 정책 계산 연습
          </p>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          교육용 프로토타입이며 공모전 제출물이나 사업 타당성 근거가 아닙니다. 데이터는 이
          브라우저에만 저장되고 어디로도 전송되지 않습니다.
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <dt><DataKindBadge kind="hypothetical" /></dt>
            <dd className="text-ink-2">입력한 가정으로 계산한 값</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt><DataKindBadge kind="measured" /></dt>
            <dd className="text-ink-2">사람이 직접 측정해 입력한 값</dd>
          </div>
        </dl>
        <nav aria-label="페이지 내 이동" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="underline underline-offset-2">
              {label}
            </a>
          ))}
        </nav>
      </header>

      {(!inputsSaved || !recordsSaved) && (
        <p role="alert" className="mb-4 rounded-md border border-danger p-3 text-sm text-danger">
          이 브라우저에 저장하지 못했습니다. 페이지를 닫으면 내용이 사라질 수 있으니 CSV로
          내보내 두세요.
        </p>
      )}
      {loaded.recovered && (
        <p role="alert" className="mb-4 rounded-md border border-danger p-3 text-sm text-danger">
          저장된 측정 기록 일부를 읽지 못했습니다. 원본은 지우지 않고 이 브라우저의 백업
          항목(energy-shield-lab:measurements:backup)에 남겨 두었습니다.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <InputPanel
            raw={raw}
            validation={validation}
            onChange={(key, value) => {
              setResetMessage("");
              setRaw((current) => ({ ...current, [key]: value }));
            }}
            onReset={() => {
              setRaw({ ...DEFAULT_RAW_INPUTS });
              setResetMessage("입력값만 기본값으로 되돌렸습니다. 측정 기록은 그대로입니다.");
            }}
            resetMessage={resetMessage}
          />
        </aside>

        <main className="min-w-0 space-y-4">
          <Section
            id="results"
            title="시나리오 비교"
            kind="hypothetical"
            description="입력한 가정에 따라 바뀌는 계산값이며, 어떤 시나리오가 실제로 더 낫다는 근거는 아닙니다."
            actions={
              <button
                type="button"
                className={BUTTON_SECONDARY}
                disabled={!inputs || !results}
                onClick={() =>
                  inputs &&
                  results &&
                  downloadCsv(
                    "energy-shield-lab-hypothetical",
                    buildResultsCsv(inputs, results),
                  )
                }
              >
                계산 결과 CSV
              </button>
            }
          >
            {results ? <ResultsTable results={results} /> : resultsBlocked}
          </Section>

          <Section
            id="charts"
            title="차트"
            kind="hypothetical"
            description="막대나 선에 마우스를 올리면 값이 나옵니다. 정확한 수치는 위 표에 있습니다."
          >
            {results && inputs ? (
              <div className="grid gap-3 xl:grid-cols-2">
                <ScenarioCharts results={results} />
                <SensitivityChart inputs={inputs} />
              </div>
            ) : (
              resultsBlocked
            )}
          </Section>

          <Section
            id="logic"
            title="계산 논리"
            kind="hypothetical"
            description="면적에서 시작해 용량, 전력량, 비용, 탄소 순서로 계산합니다. 현재 입력값이 식에 그대로 들어갑니다."
          >
            {results && inputs ? (
              <FormulaPanel inputs={inputs} results={results} />
            ) : (
              resultsBlocked
            )}
          </Section>

          <Section
            id="sources"
            title="출처와 가정"
            description="2026년 11월 6일에 확인한 내용입니다. 전국 값이나 다른 건물 유형의 값이 많고, 대전 공장을 직접 조사한 값은 없습니다."
          >
            <SourceNotes />
          </Section>
        </main>
      </div>

      <div className="mt-4 border-t-4 border-ink pt-4">
        <Section
          id="measurements"
          title="실험 측정 기록"
          kind="measured"
          description="사람이 직접 측정한 값만 기록하세요. 이 기록은 위의 계산에 자동으로 반영되지 않으며, 가정 계산값도 여기에 들어오지 않습니다."
        >
          <MeasurementLab
            records={records}
            onAdd={(record) =>
              setRecords((current) => [
                { ...record, id: crypto.randomUUID() },
                ...current,
              ])
            }
            onDelete={(id) => {
              if (window.confirm("이 측정 기록을 삭제할까요? 되돌릴 수 없습니다.")) {
                setRecords((current) => current.filter((record) => record.id !== id));
              }
            }}
            onExport={() =>
              downloadCsv("energy-shield-lab-measurements", buildMeasurementsCsv(records))
            }
          />
        </Section>
      </div>
    </div>
  );
}
