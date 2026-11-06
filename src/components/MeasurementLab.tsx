import { useState, type FormEvent, type ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import {
  CONDITIONS,
  CUSTOM_METRIC,
  EMPTY_DRAFT,
  METRICS,
  summarize,
  validateDraft,
  type DraftErrors,
  type Measurement,
  type MeasurementDraft,
} from "@/lib/measurements";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS } from "./ui";

export function MeasurementLab({
  records,
  onAdd,
  onDelete,
  onExport,
}: {
  records: Measurement[];
  onAdd: (record: Omit<Measurement, "id">) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
}) {
  const [draft, setDraft] = useState<MeasurementDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [message, setMessage] = useState("");

  const set = (key: keyof MeasurementDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { errors: nextErrors, record } = validateDraft(draft, new Date());
    setErrors(nextErrors);
    if (!record) {
      setMessage("기록하지 않았습니다. 표시된 칸을 확인하세요.");
      return;
    }
    onAdd(record);
    // 같은 조건으로 이어서 측정하는 경우가 많아 측정값과 메모만 비웁니다.
    setDraft((current) => ({ ...current, value: "", notes: "" }));
    setMessage("기록했습니다.");
  };

  const fieldProps = (key: keyof MeasurementDraft) => ({
    id: `m-${key}`,
    value: draft[key],
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `m-${key}-error` : undefined,
    className: INPUT_CLASS,
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
  });

  const presetUnit = METRICS.find((metric) => metric.label === draft.metric)?.unit;
  const isCustom = draft.metric === CUSTOM_METRIC;
  const summaries = summarize(records);

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="측정값 입력">
        <FormRow label="측정 일시" name="measuredAt" errors={errors}>
          <input {...fieldProps("measuredAt")} type="datetime-local" />
        </FormRow>
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="측정자" name="observer" errors={errors}>
            <input {...fieldProps("observer")} type="text" />
          </FormRow>
          <FormRow label="측정 기기" name="instrument" errors={errors}>
            <input {...fieldProps("instrument")} type="text" />
          </FormRow>
        </div>
        <FormRow label="측정 장소" name="site" errors={errors}>
          <input {...fieldProps("site")} type="text" />
        </FormRow>
        <FormRow label="지붕 조건" name="condition" errors={errors}>
          <select {...fieldProps("condition")}>
            <option value="">선택하세요</option>
            {CONDITIONS.map((condition) => (
              <option key={condition}>{condition}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="측정 항목" name="metric" errors={errors}>
          <select {...fieldProps("metric")}>
            <option value="">선택하세요</option>
            {METRICS.map((metric) => (
              <option key={metric.label}>{metric.label}</option>
            ))}
          </select>
        </FormRow>
        {isCustom && (
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="항목 이름" name="customMetric" errors={errors}>
              <input {...fieldProps("customMetric")} type="text" />
            </FormRow>
            <FormRow label="단위" name="unit" errors={errors}>
              <input {...fieldProps("unit")} type="text" />
            </FormRow>
          </div>
        )}
        <FormRow
          label={presetUnit ? `측정값 (${presetUnit})` : "측정값"}
          name="value"
          errors={errors}
        >
          <input {...fieldProps("value")} type="text" inputMode="decimal" autoComplete="off" />
        </FormRow>
        <FormRow label="메모 (선택)" name="notes" errors={errors}>
          <textarea {...fieldProps("notes")} rows={2} />
        </FormRow>
        <div className="flex items-center gap-3">
          <button type="submit" className={BUTTON_PRIMARY}>
            측정값 기록
          </button>
          <p role="status" className="text-sm text-ink-2">
            {message}
          </p>
        </div>
      </form>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">측정 기록 {records.length}건</h3>
          <button
            type="button"
            className={BUTTON_SECONDARY}
            onClick={onExport}
            disabled={records.length === 0}
          >
            측정 기록 CSV
          </button>
        </div>

        {records.length === 0 ? (
          <p className="rounded-md border border-line-strong p-6 text-center text-sm leading-6 text-ink-2">
            아직 측정값이 없습니다. 이 앱은 관측값을 미리 넣어 두지 않습니다.
            <br />
            직접 측정한 뒤 입력 양식에 기록하세요.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <caption className="sr-only">사람이 입력한 측정 기록</caption>
                <thead>
                  <tr className="border-b border-line-strong text-left">
                    {["일시", "조건", "항목", "측정값", "측정자 · 기기", "장소 · 메모", ""].map(
                      (heading, index) => (
                        <th
                          key={heading || index}
                          scope="col"
                          className={`py-2 pr-3 font-medium ${heading === "측정값" ? "text-right" : ""}`}
                        >
                          {heading || <span className="sr-only">삭제</span>}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-line align-top">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {record.measuredAt.replace("T", " ")}
                      </td>
                      <td className="py-2 pr-3">{record.condition}</td>
                      <td className="py-2 pr-3">{record.metric}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                        {record.value} {record.unit}
                      </td>
                      <td className="py-2 pr-3">
                        {record.observer} · {record.instrument}
                      </td>
                      <td className="py-2 pr-3">
                        {record.site}
                        {record.notes && (
                          <span className="block text-xs text-ink-2">{record.notes}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-xs text-danger underline underline-offset-2"
                          onClick={() => onDelete(record.id)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold">항목·조건별 요약</h3>
              <p className="mb-2 text-xs leading-5 text-ink-2">
                입력한 기록을 산술 평균했을 뿐입니다. 조건 차이의 원인을 증명하지는
                않습니다.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line-strong text-left">
                      <th scope="col" className="py-2 pr-3 font-medium">항목</th>
                      <th scope="col" className="py-2 pr-3 font-medium">조건</th>
                      {["n", "평균", "최소", "최대"].map((heading) => (
                        <th key={heading} scope="col" className="py-2 pl-3 text-right font-medium">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {summaries.map((s) => (
                      <tr key={`${s.metric}|${s.unit}|${s.condition}`} className="border-b border-line">
                        <td className="py-2 pr-3">
                          {s.metric} <span className="text-xs text-ink-3">{s.unit}</span>
                        </td>
                        <td className="py-2 pr-3">{s.condition}</td>
                        <td className="py-2 pl-3 text-right">{s.count}</td>
                        <td className="py-2 pl-3 text-right">{formatNumber(s.mean, 3)}</td>
                        <td className="py-2 pl-3 text-right">{formatNumber(s.min, 3)}</td>
                        <td className="py-2 pl-3 text-right">{formatNumber(s.max, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FormRow({
  label,
  name,
  errors,
  children,
}: {
  label: string;
  name: keyof MeasurementDraft;
  errors: DraftErrors;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`m-${name}`} className="mb-1 block text-sm">
        {label}
      </label>
      {children}
      {errors[name] && (
        <p id={`m-${name}-error`} className="mt-1 text-xs text-danger">
          오류: {errors[name]}
        </p>
      )}
    </div>
  );
}
