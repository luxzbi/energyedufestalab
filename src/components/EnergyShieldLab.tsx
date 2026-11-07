"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMeasurementsCsv, buildResultsCsv } from "@/lib/csv";
import { downloadFile, todayStamp } from "@/lib/download";
import {
  DEFAULT_RAW_INPUTS,
  toRawInputs,
  validateInputs,
  type RawInputs,
} from "@/lib/fields";
import type { Measurement } from "@/lib/measurements";
import { calculateAll, MODEL_VERSION } from "@/lib/model";
import { createRun, type RunRecord } from "@/lib/runRecord";
import {
  configToSettings,
  DEFAULT_SETTINGS,
  parseSettings,
  type LabSettings,
} from "@/lib/settings";
import {
  EMPTY_NOTES,
  loadInputs,
  loadMeasurements,
  loadNotes,
  loadRuns,
  loadSettings,
  saveInputs,
  saveMeasurements,
  saveNotes,
  saveRuns,
  saveSettings,
  type KeyValueStore,
} from "@/lib/storage";
import { ScenarioCharts } from "./Charts";
import { EmissionFactorNotes, FormulaPanel, InstallationTypes } from "./FormulaPanel";
import { InputPanel } from "./InputPanel";
import { MeasurementLab } from "./MeasurementLab";
import { OptimizationPanel } from "./OptimizationPanel";
import { PolicyPanel } from "./PolicyPanel";
import { ResearchRecord } from "./ResearchRecord";
import { ResultsTable } from "./ResultsTable";
import { SensitivityPanel } from "./SensitivityPanel";
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

/** 값이 바뀔 때마다 저장하고, 저장에 실패했는지 알려 줍니다. */
function usePersist<T>(
  store: KeyValueStore | null,
  save: (store: KeyValueStore, value: T) => boolean,
  value: T,
) {
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소 쓰기의 결과를 표시합니다.
    setSaved(store ? save(store, value) : false);
  }, [store, save, value]);
  return saved;
}

type View =
  | "scenario"
  | "policy"
  | "optimization"
  | "sensitivity"
  | "sources"
  | "measure"
  | "record";

const MODE1_TABS: { id: View; label: string }[] = [
  { id: "scenario", label: "유형 비교·계산 논리" },
  { id: "policy", label: "지원율·예산" },
  { id: "optimization", label: "예산 최적화" },
  { id: "sensitivity", label: "민감도" },
  { id: "sources", label: "출처와 가정" },
];

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-solid text-on-solid" : "border border-line-strong hover:bg-sunken"
      }`}
    >
      {children}
    </button>
  );
}

export default function EnergyShieldLab() {
  const [store] = useState(getStore);
  const [view, setView] = useState<View>("scenario");
  const [raw, setRaw] = useState<RawInputs>(() =>
    store ? loadInputs(store) : { ...DEFAULT_RAW_INPUTS },
  );
  const [settings, setSettings] = useState<LabSettings>(() =>
    store ? loadSettings(store) : DEFAULT_SETTINGS,
  );
  const [loaded] = useState(() =>
    store ? loadMeasurements(store) : { records: [], recovered: false },
  );
  const [records, setRecords] = useState<Measurement[]>(loaded.records);
  const [runs, setRuns] = useState<RunRecord[]>(() => (store ? loadRuns(store) : []));
  const [notes, setNotes] = useState(() => (store ? loadNotes(store) : EMPTY_NOTES));
  const [resetMessage, setResetMessage] = useState("");

  const saved = [
    usePersist(store, saveInputs, raw),
    usePersist(store, saveSettings, settings),
    usePersist(store, saveMeasurements, records),
    usePersist(store, saveRuns, runs),
    usePersist(store, saveNotes, notes),
  ].every(Boolean);

  const validation = useMemo(() => validateInputs(raw), [raw]);
  const inputs = validation.values;
  const results = useMemo(() => (inputs ? calculateAll(inputs) : null), [inputs]);
  const errorCount = Object.keys(validation.errors).length;
  const { config, errors: settingErrors } = useMemo(() => parseSettings(settings), [settings]);
  const scenario = settings.analysisScenario;

  const budgetKrw = useMemo(() => {
    if (settings.budgetChoice !== "custom") return Number(settings.budgetChoice);
    const budgetError = settingErrors.customBudgetEok;
    return budgetError ? null : Math.floor(Number(settings.customBudgetEok) * 1e8);
  }, [settings.budgetChoice, settings.customBudgetEok, settingErrors.customBudgetEok]);

  const changeSettings = (change: Partial<LabSettings>) =>
    setSettings((current) => ({ ...current, ...change }));

  const inputsBlocked = (
    <p role="alert" className="rounded-md border border-danger p-3 text-sm text-danger">
      입력 오류 {errorCount}개를 고칠 때까지 계산을 멈춥니다. 잘못된 값으로 만든 숫자를 보여 주지 않기
      위해서입니다.
    </p>
  );

  const isMode1 = view !== "measure" && view !== "record";

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-5 sm:px-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-bold">Energy Shield Lab</h1>
          <p className="text-sm text-ink-2">
            대전 대화동 노후 산업단지 쿨루프·태양광 정책의 내부 연구 시뮬레이터
          </p>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          학생이 계산 원리와 정책 효과를 직접 검증하기 위한 도구이며, 공모전 제출물을 자동으로 만들지 않습니다.
          데이터는 이 브라우저에만 저장되고 어디로도 전송되지 않습니다. 계산 모델 {MODEL_VERSION}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <dt><DataKindBadge kind="hypothetical" /></dt>
            <dd className="text-ink-2">입력한 가정으로 계산</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt><DataKindBadge kind="virtual" /></dt>
            <dd className="text-ink-2">난수로 만든 공장</dd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <dt><DataKindBadge kind="measured" /></dt>
            <dd className="text-ink-2">사람이 직접 입력</dd>
          </div>
        </dl>

        <nav aria-label="분석 화면" className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-ink-2">모드 1 · 가정 기반</span>
            {MODE1_TABS.map((tab) => (
              <TabButton key={tab.id} active={view === tab.id} onClick={() => setView(tab.id)}>
                {tab.label}
              </TabButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-ink-2">모드 2 · 측정 기반</span>
            <TabButton active={view === "measure"} onClick={() => setView("measure")}>
              실측 분석
            </TabButton>
            <span className="mx-1 text-xs font-semibold text-ink-2">연구 기록</span>
            <TabButton active={view === "record"} onClick={() => setView("record")}>
              실행 기록·연구 노트
            </TabButton>
          </div>
        </nav>
      </header>

      {!saved && (
        <p role="alert" className="mb-4 rounded-md border border-danger p-3 text-sm text-danger">
          이 브라우저에 저장하지 못했습니다. 페이지를 닫으면 내용이 사라질 수 있으니 CSV나 JSON으로 내보내 두세요.
        </p>
      )}
      {loaded.recovered && (
        <p role="alert" className="mb-4 rounded-md border border-danger p-3 text-sm text-danger">
          저장된 측정 기록 일부를 읽지 못했습니다. 원본은 지우지 않고 이 브라우저의 백업
          항목(energy-shield-lab:measurements:backup)에 남겨 두었습니다.
        </p>
      )}

      {isMode1 && (
        <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <InputPanel
              raw={raw}
              validation={validation}
              scenario={scenario}
              onScenarioChange={(analysisScenario) => changeSettings({ analysisScenario })}
              onChange={(key, value) => {
                setResetMessage("");
                setRaw((current) => ({ ...current, [key]: value }));
              }}
              onReset={() => {
                setRaw({ ...DEFAULT_RAW_INPUTS });
                setSettings(DEFAULT_SETTINGS);
                setResetMessage(
                  "입력값과 분석 설정을 기본값으로 되돌렸습니다. 측정 기록, 실행 기록, 연구 메모는 그대로입니다.",
                );
              }}
              resetMessage={resetMessage}
            />
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="rounded-md border border-dashed border-ink-2 p-3 text-sm leading-6">
              <strong className="font-semibold">모드 1. 가정 기반 정책 시나리오.</strong>{" "}
              <span className="text-ink-2">
                이 화면의 수치는 입력한 가정으로 계산한 추정값입니다. 실제 절감이나 감축을 입증하지 않습니다.
              </span>
            </div>

            {view === "scenario" && (
              <>
                <Section
                  id="types"
                  title="설치 유형"
                  description="패널 영역의 쿨루프를 어떻게 다루느냐에 따라 유형을 나눕니다."
                >
                  <InstallationTypes />
                </Section>

                <Section
                  id="results"
                  title="설치 유형 비교"
                  kind="hypothetical"
                  description="입력한 가정에 따라 바뀌는 계산값이며, 어떤 유형이 실제로 더 낫다는 근거는 아닙니다."
                  actions={
                    <button
                      type="button"
                      className={BUTTON_SECONDARY}
                      disabled={!inputs || !results}
                      onClick={() =>
                        inputs &&
                        results &&
                        downloadFile(
                          `energy-shield-lab-hypothetical-${todayStamp()}.csv`,
                          buildResultsCsv(inputs, results),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      계산 결과 CSV
                    </button>
                  }
                >
                  {results ? <ResultsTable results={results} /> : inputsBlocked}
                </Section>

                <Section
                  id="charts"
                  title="차트"
                  kind="hypothetical"
                  description="막대에 마우스를 올리면 값이 나옵니다. 정확한 수치는 위 표에 있습니다."
                >
                  {results && inputs ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      <ScenarioCharts inputs={inputs} results={results} />
                    </div>
                  ) : (
                    inputsBlocked
                  )}
                </Section>

                <Section
                  id="carbon"
                  title="전력 흐름과 온실가스 계산"
                  description="태양광 발전량 전체가 공장의 구매 감소는 아닙니다. 자가소비와 역송을 나누고, 각 kWh를 한 번만 셉니다."
                >
                  <EmissionFactorNotes />
                  <p className="mt-2 text-sm leading-6 text-ink-2">
                    설비 제조·운송·폐기에서 발생하는 배출량은 이 모델에 포함되지 않습니다. 그래서 결과는 수명 전체의
                    순감축량이 아니라 운영 단계의 전력 대체 추정입니다.
                  </p>
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
                    inputsBlocked
                  )}
                </Section>
              </>
            )}

            {view === "policy" &&
              (inputs ? (
                <PolicyPanel
                  inputs={inputs}
                  scenario={scenario}
                  settings={settings}
                  budgetKrw={budgetKrw}
                  errors={settingErrors}
                  onSettingsChange={changeSettings}
                />
              ) : (
                inputsBlocked
              ))}

            {view === "optimization" &&
              (inputs ? (
                <OptimizationPanel
                  inputs={inputs}
                  scenario={scenario}
                  settings={settings}
                  config={config}
                  errors={settingErrors}
                  onSettingsChange={changeSettings}
                />
              ) : (
                inputsBlocked
              ))}

            {view === "sensitivity" &&
              (inputs ? (
                <SensitivityPanel
                  inputs={inputs}
                  scenario={scenario}
                  settings={settings}
                  config={config}
                  errors={settingErrors}
                  onSettingsChange={changeSettings}
                />
              ) : (
                inputsBlocked
              ))}

            {view === "sources" && (
              <Section
                id="sources"
                title="출처와 가정"
                description="2026년 11월 7일에 확인한 내용입니다. 전국 값이나 다른 건물 유형의 값이 많고, 대화동 공장을 직접 조사한 값은 없습니다."
              >
                <SourceNotes />
              </Section>
            )}
          </main>
        </div>
      )}

      {view === "measure" && (
        <main className="space-y-4">
          <div className="rounded-md border-2 border-solid border-ink p-3 text-sm leading-6">
            <strong className="font-semibold">모드 2. 측정 기반 분석.</strong>{" "}
            <span className="text-ink-2">
              사람이 입력한 측정값만 다룹니다. 모드 1의 가정 계산과 별도로 저장하며 서로 섞지 않습니다.
            </span>
          </div>
          <MeasurementLab
            records={records}
            onAdd={(record) =>
              setRecords((current) => [{ ...record, id: crypto.randomUUID() }, ...current])
            }
            onDelete={(id) => {
              if (window.confirm("이 측정 기록을 삭제할까요? 되돌릴 수 없습니다.")) {
                setRecords((current) => current.filter((record) => record.id !== id));
              }
            }}
            onExport={() =>
              downloadFile(
                `energy-shield-lab-measurements-${todayStamp()}.csv`,
                buildMeasurementsCsv(records),
                "text/csv;charset=utf-8",
              )
            }
          />
        </main>
      )}

      {view === "record" && (
        <main>
          <ResearchRecord
            runs={runs}
            canCreate={Boolean(inputs && config)}
            measurements={records}
            notes={notes}
            onNotesChange={setNotes}
            onCreate={() => {
              if (!inputs || !config) return null;
              const run = createRun(inputs, config, crypto.randomUUID(), new Date());
              setRuns((current) => [run, ...current]);
              return run;
            }}
            onImport={(run) =>
              setRuns((current) => [
                run,
                ...current.filter((item) => item.id !== run.id),
              ])
            }
            onDelete={(id) => {
              if (window.confirm("이 실행 기록을 삭제할까요? 되돌릴 수 없습니다.")) {
                setRuns((current) => current.filter((item) => item.id !== id));
              }
            }}
            onRestore={(run) => {
              setRaw(toRawInputs(run.inputs));
              setSettings(configToSettings(run.config));
              setView("scenario");
              setResetMessage("실행 기록의 입력값을 복원했습니다.");
            }}
          />
        </main>
      )}
    </div>
  );
}
