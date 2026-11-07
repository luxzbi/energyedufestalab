import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { METHOD_STEPS } from "@/lib/assumptions";
import { FIELD_SPECS } from "@/lib/fields";
import { formatKrw, formatKwh, formatNumber, formatTon } from "@/lib/format";
import {
  experimentStatus,
  summarize,
  type Measurement,
} from "@/lib/measurements";
import { SCENARIO_IDS, SCENARIO_LABELS, MODEL_VERSION } from "@/lib/model";
import { SELECTION_LABELS, SELECTION_METHODS } from "@/lib/optimization";
import {
  buildRunCsv,
  buildRunJson,
  parseRunJson,
  verifyRun,
  type RunRecord,
} from "@/lib/runRecord";
import type { ResearchNotes } from "@/lib/storage";
import { downloadFile } from "@/lib/download";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DataKindBadge,
  INPUT_CLASS,
  Note,
  Section,
  TABLE_HEAD,
  TD_NUM,
  TH,
  TH_NUM,
} from "./ui";

export function ResearchRecord({
  runs,
  canCreate,
  measurements,
  notes,
  onNotesChange,
  onCreate,
  onImport,
  onDelete,
  onRestore,
}: {
  runs: RunRecord[];
  canCreate: boolean;
  measurements: Measurement[];
  notes: ResearchNotes;
  onNotesChange: (notes: ResearchNotes) => void;
  onCreate: () => RunRecord | null;
  onImport: (run: RunRecord) => void;
  onDelete: (id: string) => void;
  onRestore: (run: RunRecord) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(runs[0]?.id ?? null);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const run = runs.find((item) => item.id === selectedId) ?? runs[0] ?? null;

  const verification = useMemo(() => (run ? verifyRun(run) : null), [run]);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const { run: loaded, error } = parseRunJson(await file.text());
    if (!loaded) {
      setMessage(`불러오지 못했습니다: ${error}`);
      return;
    }
    onImport(loaded);
    setSelectedId(loaded.id);
    setMessage(`불러왔습니다: ${file.name}`);
  };

  const stamp = run?.executedAt.slice(0, 19).replaceAll(":", "-");

  return (
    <div className="space-y-4">
      <Note title="이 화면은 해석을 대신 쓰지 않습니다.">
        입력값과 계산값은 실행 기록에서 그대로 옮겨 표시하고, 고정된 안내문을 함께 보여 줍니다. 생성형 AI를 쓰지
        않으며, 연구 목적과 해석은 직접 작성합니다. 메모는 이 브라우저에만 저장됩니다.
      </Note>

      <Section
        id="runs"
        title="실행 기록"
        kind="hypothetical"
        description="현재 입력값으로 계산한 결과를 실행 일시, 입력 변수, 모델 버전, 출처, 가정, 한계와 함께 저장합니다."
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON_PRIMARY}
            disabled={!canCreate}
            onClick={() => {
              const created = onCreate();
              if (created) {
                setSelectedId(created.id);
                setMessage("실행 기록을 만들었습니다.");
              }
            }}
          >
            현재 조건으로 실행 기록 만들기
          </button>
          <button
            type="button"
            className={BUTTON_SECONDARY}
            onClick={() => fileInput.current?.click()}
          >
            JSON 불러오기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="실행 기록 JSON 파일"
            tabIndex={-1}
            onChange={importFile}
          />
          <p role="status" className="text-sm text-ink-2">{message}</p>
        </div>
        {!canCreate && (
          <p className="mt-2 text-sm text-danger">입력 오류를 고쳐야 실행 기록을 만들 수 있습니다.</p>
        )}

        {runs.length === 0 ? (
          <p className="mt-3 rounded-md border border-line-strong p-6 text-center text-sm text-ink-2">
            아직 실행 기록이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
            {runs.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 p-2.5">
                <label className="flex min-w-0 flex-1 basis-64 items-center gap-2">
                  <input
                    type="radio"
                    name="selected-run"
                    checked={run?.id === item.id}
                    onChange={() => setSelectedId(item.id)}
                  />
                  <span className="tabular-nums">
                    {new Date(item.executedAt).toLocaleString("ko-KR")}
                  </span>
                  <span className="text-ink-2">{item.scenarioType} · 모델 {item.modelVersion}</span>
                </label>
                <button
                  type="button"
                  className="text-xs text-danger underline underline-offset-2"
                  onClick={() => onDelete(item.id)}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {run && verification && (
        <>
          <Section
            id="run-verify"
            title="재현 확인"
            kind="hypothetical"
            description="저장된 입력값으로 지금 다시 계산해 저장된 결과와 비교합니다."
            actions={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BUTTON_SECONDARY}
                  onClick={() =>
                    downloadFile(`energy-shield-lab-run-${stamp}.json`, buildRunJson(run), "application/json")
                  }
                >
                  JSON 내보내기
                </button>
                <button
                  type="button"
                  className={BUTTON_SECONDARY}
                  onClick={() =>
                    downloadFile(`energy-shield-lab-run-${stamp}.csv`, buildRunCsv(run), "text/csv;charset=utf-8")
                  }
                >
                  CSV 내보내기
                </button>
                <button type="button" className={BUTTON_SECONDARY} onClick={() => onRestore(run)}>
                  이 입력값 복원
                </button>
              </div>
            }
          >
            <div id="verify-result" className="space-y-2 text-sm">
              {verification.reproduced ? (
                <p className="font-medium">재현 일치: 다시 계산한 결과가 저장된 결과와 같습니다.</p>
              ) : (
                <p role="alert" className="rounded-md border border-danger p-3 text-danger">
                  재현 불일치: 다시 계산한 결과와 다른 항목이 있습니다({verification.differences.length}건
                  {verification.differences.length >= 50 ? " 이상" : ""}). 아래 결과는 저장된 값이 아니라 다시 계산한
                  값입니다.
                  <span className="mt-1 block text-xs break-all">
                    {verification.differences.slice(0, 5).join(", ")}
                  </span>
                </p>
              )}
              {!verification.modelVersionMatches && (
                <p role="alert" className="rounded-md border border-caution p-3 text-caution">
                  이 기록의 모델 버전({run.modelVersion})이 현재 버전({MODEL_VERSION})과 다릅니다. 계산식이 바뀌었을 수
                  있습니다.
                </p>
              )}
              <dl className="grid gap-x-4 gap-y-1 text-ink-2 sm:grid-cols-2">
                <div>실행 일시: {new Date(run.executedAt).toLocaleString("ko-KR")}</div>
                <div>계산 모델 버전: {run.modelVersion}</div>
                <div>시나리오 유형: {run.scenarioType}</div>
                <div>데이터 구분: {run.dataKind}</div>
              </dl>
            </div>
          </Section>

          <Record
            run={run}
            displayed={verification.reproduced ? run.results : verification.recomputed}
            measurements={measurements}
            notes={notes}
            onNotesChange={onNotesChange}
          />
        </>
      )}

      {!run && (
        <NotesOnly notes={notes} onNotesChange={onNotesChange} measurements={measurements} />
      )}
    </div>
  );
}

function NotesOnly({
  notes,
  onNotesChange,
  measurements,
}: {
  notes: ResearchNotes;
  onNotesChange: (notes: ResearchNotes) => void;
  measurements: Measurement[];
}) {
  return (
    <>
      <Purpose notes={notes} onNotesChange={onNotesChange} />
      <NextExperiments notes={notes} onNotesChange={onNotesChange} measurements={measurements} />
    </>
  );
}

function NoteArea({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        className={INPUT_CLASS}
        value={value}
        placeholder="직접 작성하세요."
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Purpose({
  notes,
  onNotesChange,
}: {
  notes: ResearchNotes;
  onNotesChange: (notes: ResearchNotes) => void;
}) {
  return (
    <Section id="record-1" title="1. 연구 목적" description="어떤 질문에 답하려는지 직접 작성합니다.">
      <NoteArea
        id="note-purpose"
        label="연구 목적 (직접 작성)"
        value={notes.purpose}
        onChange={(purpose) => onNotesChange({ ...notes, purpose })}
      />
    </Section>
  );
}

function NextExperiments({
  notes,
  onNotesChange,
  measurements,
}: {
  notes: ResearchNotes;
  onNotesChange: (notes: ResearchNotes) => void;
  measurements: Measurement[];
}) {
  const status = experimentStatus(measurements);
  return (
    <Section
      id="record-6"
      title="6. 추가 실험 필요 사항"
      description="아래 표는 측정 기록에 있는 내용만 보여 줍니다. ‘기록 없음’은 입력된 값이 없다는 뜻이며, 실험을 실시했다는 뜻이 아닙니다."
    >
      <div className="overflow-x-auto">
        <table id="experiment-status" className="w-full min-w-[28rem] border-collapse text-sm">
          <caption className="sr-only">측정 항목별 기록 상태</caption>
          <thead>
            <tr className={TABLE_HEAD}>
              <th scope="col" className={TH}>측정 항목</th>
              <th scope="col" className={TH}>상태</th>
              <th scope="col" className={TH_NUM}>값 있는 측정</th>
              <th scope="col" className={TH_NUM}>전체 기록(결측 포함)</th>
            </tr>
          </thead>
          <tbody>
            {status.map((item) => (
              <tr key={item.metric} className="border-b border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {item.metric} <span className="text-xs text-ink-3">{item.unit}</span>
                </th>
                <td className="py-2 pr-3">{item.status}</td>
                <td className={TD_NUM}>{item.observedCount}</td>
                <td className={TD_NUM}>{item.recordCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <NoteArea
          id="note-next"
          label="앞으로 필요한 실험 (직접 작성)"
          value={notes.nextExperiments}
          onChange={(nextExperiments) => onNotesChange({ ...notes, nextExperiments })}
        />
      </div>
    </Section>
  );
}

function Record({
  run,
  displayed,
  measurements,
  notes,
  onNotesChange,
}: {
  run: RunRecord;
  displayed: RunRecord["results"];
  measurements: Measurement[];
  notes: ResearchNotes;
  onNotesChange: (notes: ResearchNotes) => void;
}) {
  const summaries = summarize(measurements).filter((s) => s.count > 0);

  return (
    <>
      <Purpose notes={notes} onNotesChange={onNotesChange} />

      <Section
        id="record-2"
        title="2. 사용한 변수와 입력 조건"
        kind="hypothetical"
        description="이 실행 기록에 저장된 값입니다."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-sm">
            <caption className="sr-only">실행 기록의 입력 변수</caption>
            <tbody>
              {FIELD_SPECS.map((field) => (
                <tr key={field.key} className="border-b border-line">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">{field.label}</th>
                  <td className={TD_NUM}>
                    {run.inputs[field.key] === null
                      ? "미입력(미산정)"
                      : `${formatNumber(run.inputs[field.key] as number, 4)} ${field.unit}`}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-line">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  대전시 예산 / 가상 공장 수 / 시드
                </th>
                <td className={TD_NUM}>
                  {formatKrw(run.config.budgetKrw)} / {run.config.dataset.count}곳 / 데이터 {run.config.dataset.seed}, 무작위 {run.config.randomSeed}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="record-3" title="3. 계산 방법" description="현재 계산 모델의 식입니다.">
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-ink-2">
          {METHOD_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section
        id="record-4"
        title="4. 계산 결과"
        kind="hypothetical"
        description="가정으로 계산한 값입니다. 실험으로 확인한 결과가 아닙니다."
      >
        <div className="overflow-x-auto">
          <table id="record-results" className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">설치 유형별 계산 결과</caption>
            <thead>
              <tr className={TABLE_HEAD}>
                <th scope="col" className={TH}>설치 유형</th>
                <th scope="col" className={TH_NUM}>냉방 절감</th>
                <th scope="col" className={TH_NUM}>총발전량</th>
                <th scope="col" className={TH_NUM}>총사업비</th>
                <th scope="col" className={TH_NUM}>대전시 부담</th>
                <th scope="col" className={TH_NUM}>추정 감축량</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIO_IDS.map((id) => {
                const r = displayed.scenarios[id];
                return (
                  <tr key={id} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">{SCENARIO_LABELS[id]}</th>
                    <td className={TD_NUM}>{formatKwh(r.coolingSavedKwh)}</td>
                    <td className={TD_NUM}>{formatKwh(r.solarGeneratedKwh)}</td>
                    <td className={TD_NUM}>{formatKrw(r.totalCostKrw)}</td>
                    <td className={TD_NUM}>{formatKrw(r.municipalCostKrw)}</td>
                    <td className={TD_NUM}>{formatTon(r.co2ReductionT)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">예산 최적화</h3>
          <DataKindBadge kind="virtual" />
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <caption className="sr-only">선정 방식별 결과. 가상 공장 데이터입니다.</caption>
            <thead>
              <tr className={TABLE_HEAD}>
                <th scope="col" className={TH}>선정 방식</th>
                <th scope="col" className={TH_NUM}>공장 수</th>
                <th scope="col" className={TH_NUM}>대전시 집행액</th>
                <th scope="col" className={TH_NUM}>추정 감축량</th>
              </tr>
            </thead>
            <tbody>
              {SELECTION_METHODS.map((method) => {
                const r = displayed.optimization.results[method];
                return (
                  <tr key={method} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {SELECTION_LABELS[method]}
                    </th>
                    <td className={TD_NUM}>{r.factoryCount}곳</td>
                    <td className={TD_NUM}>{formatKrw(r.municipalCostKrw)}</td>
                    <td className={TD_NUM}>{formatTon(r.co2ReductionT)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">실측 자료</h3>
          <DataKindBadge kind="measured" />
        </div>
        {summaries.length === 0 ? (
          <p id="record-no-measurement" className="mt-2 text-sm text-ink-2">
            현재 값이 있는 측정 기록이 없습니다. 위 결과를 뒷받침하는 실험 자료가 없다는 뜻입니다.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-sm">
              <caption className="sr-only">입력된 측정 기록의 요약. 실행 기록과 별도 자료입니다.</caption>
              <thead>
                <tr className={TABLE_HEAD}>
                  <th scope="col" className={TH}>항목 · 조건</th>
                  <th scope="col" className={TH_NUM}>n</th>
                  <th scope="col" className={TH_NUM}>평균</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={`${s.metric}|${s.unit}|${s.condition}`} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {s.metric} · {s.condition}
                    </th>
                    <td className={TD_NUM}>{s.count}</td>
                    <td className={TD_NUM}>
                      {formatNumber(s.mean as number, 3)} {s.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-5 text-ink-2">
              현재 브라우저의 측정 기록이며 위 계산에 쓰이지 않았습니다.
            </p>
          </div>
        )}
      </Section>

      <Section id="record-5" title="5. 결과 해석 시 주의사항" description="이 실행 기록에 함께 저장된 가정과 한계입니다.">
        <h3 className="text-sm font-semibold">적용한 가정</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-2">
          {run.assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <h3 className="mt-3 text-sm font-semibold">모델 한계</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-2">
          {run.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">사용한 자료 출처 ({run.sources.length}건)</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 break-all text-ink-2">
            {run.sources.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>
        <div className="mt-3">
          <NoteArea
            id="note-cautions"
            label="내가 판단한 주의사항 (직접 작성)"
            value={notes.cautions}
            onChange={(cautions) => onNotesChange({ ...notes, cautions })}
          />
        </div>
      </Section>

      <NextExperiments notes={notes} onNotesChange={onNotesChange} measurements={measurements} />
    </>
  );
}
