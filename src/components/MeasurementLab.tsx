import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";
import {
  buildTimeSeries,
  comparePhases,
  CONDITIONS,
  CUSTOM_METRIC,
  EMPTY_DRAFT,
  METRICS,
  missingControls,
  PHASES,
  summarize,
  validateDraft,
  type DraftErrors,
  type Measurement,
  type MeasurementDraft,
  type SeriesGrouping,
  type Stats,
} from "@/lib/measurements";
import { AXIS_LINE, AXIS_TICK, ChartCard, ChartTooltip, legendText } from "./ChartKit";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT_CLASS,
  Note,
  Section,
  TABLE_HEAD,
  TD_NUM,
  TH,
  TH_NUM,
} from "./ui";

const fmt = (value: number | null) => (value === null ? "-" : formatNumber(value, 3));
const fmtSd = (stats: Stats) =>
  stats.stdDev === null ? "계산 불가(n<2)" : formatNumber(stats.stdDev, 3);

/** 묶음의 색은 정해진 목록의 순서를 따릅니다. 기록이 늘어도 색이 바뀌지 않습니다. */
function groupColor(group: string, grouping: SeriesGrouping) {
  const order: readonly string[] = grouping === "condition" ? CONDITIONS : PHASES;
  return `var(--measure-${order.indexOf(group) + 1})`;
}

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
    setDraft((current) => ({ ...current, value: "", missing: "", notes: "" }));
    setMessage(record.value === null ? "결측으로 기록했습니다." : "기록했습니다.");
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
  const isMissing = draft.missing === "yes";
  const summaries = useMemo(() => summarize(records), [records]);
  const comparisons = useMemo(() => comparePhases(records), [records]);
  const controls = useMemo(() => missingControls(comparisons), [comparisons]);

  return (
    <div className="space-y-4">
      <Note title="측정 기반 분석의 범위.">
        온도 차이는 측정값의 차이입니다. 이 도구는 온도 차이를 연간 냉방 전력 절감률로 자동 변환하지 않습니다. 그
        변환에는 건물 열해석이나 전력 계측 자료가 필요합니다. 이 기록은 모드 1의 계산에 반영되지 않습니다.
      </Note>

      <Section
        id="measurements"
        title="실험 측정 기록"
        kind="measured"
        description="사람이 직접 측정한 값만 기록하세요. 측정하지 못했으면 값을 지어내지 말고 결측으로 표시하세요."
      >
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
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="지붕 조건" name="condition" errors={errors}>
                <select {...fieldProps("condition")}>
                  <option value="">선택하세요</option>
                  {CONDITIONS.map((condition) => (
                    <option key={condition}>{condition}</option>
                  ))}
                </select>
              </FormRow>
              <FormRow label="측정 시점" name="phase" errors={errors}>
                <select {...fieldProps("phase")}>
                  {PHASES.map((phase) => (
                    <option key={phase}>{phase}</option>
                  ))}
                </select>
              </FormRow>
            </div>
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
              <input
                {...fieldProps("value")}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={isMissing}
              />
            </FormRow>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="m-missing"
                type="checkbox"
                checked={isMissing}
                onChange={(event) => {
                  const next = event.target.checked;
                  setDraft((current) => ({
                    ...current,
                    missing: next ? "yes" : "",
                    value: next ? "" : current.value,
                  }));
                }}
              />
              결측 (측정하지 못함)
            </label>
            <FormRow
              label={isMissing ? "메모 (결측 사유, 필수)" : "메모 (선택)"}
              name="notes"
              errors={errors}
            >
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

          <div className="min-w-0 space-y-3">
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
              <div className="overflow-x-auto">
                <table id="measurement-records" className="w-full min-w-[46rem] border-collapse text-sm">
                  <caption className="sr-only">사람이 입력한 측정 기록</caption>
                  <thead>
                    <tr className={TABLE_HEAD}>
                      <th scope="col" className={TH}>일시</th>
                      <th scope="col" className={TH}>조건 · 시점</th>
                      <th scope="col" className={TH}>항목</th>
                      <th scope="col" className={`${TH} text-right`}>측정값</th>
                      <th scope="col" className={TH}>측정자 · 기기</th>
                      <th scope="col" className={TH}>장소 · 메모</th>
                      <th scope="col" className="py-2">
                        <span className="sr-only">삭제</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b border-line align-top">
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                          {record.measuredAt.replace("T", " ")}
                        </td>
                        <td className="py-2 pr-3">
                          {record.condition}
                          <span className="block text-xs text-ink-2">{record.phase}</span>
                        </td>
                        <td className="py-2 pr-3">{record.metric}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                          {record.value === null ? "결측" : `${record.value} ${record.unit}`}
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
            )}
          </div>
        </div>
      </Section>

      <Section
        id="measurement-stats"
        title="반복 측정 통계"
        kind="measured"
        description="입력한 기록의 평균과 표본표준편차입니다. 결측은 통계에서 빼고 개수를 따로 셉니다. 조건 차이의 원인을 증명하지는 않습니다."
      >
        {summaries.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table id="measurement-summary" className="w-full min-w-[38rem] border-collapse text-sm">
              <caption className="sr-only">항목과 조건별 측정 통계</caption>
              <thead>
                <tr className={TABLE_HEAD}>
                  <th scope="col" className={TH}>항목</th>
                  <th scope="col" className={TH}>조건</th>
                  {["n", "결측", "평균", "표준편차", "최소", "최대"].map((heading) => (
                    <th key={heading} scope="col" className={TH_NUM}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={`${s.metric}|${s.unit}|${s.condition}`} className="border-b border-line">
                    <td className="py-2 pr-3">
                      {s.metric} <span className="text-xs text-ink-3">{s.unit}</span>
                    </td>
                    <td className="py-2 pr-3">{s.condition}</td>
                    <td className={TD_NUM}>{s.count}</td>
                    <td className={TD_NUM}>{s.missingCount}</td>
                    <td className={TD_NUM}>{fmt(s.mean)}</td>
                    <td className={TD_NUM}>{fmtSd(s)}</td>
                    <td className={TD_NUM}>{fmt(s.min)}</td>
                    <td className={TD_NUM}>{fmt(s.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        id="measurement-phases"
        title="시공 전후 차이"
        kind="measured"
        description="같은 장소·항목에서 시공 후 평균에서 시공 전 평균을 뺀 값입니다. 측정 시점을 ‘시공 전’과 ‘시공 후’로 기록해야 나타납니다."
      >
        {comparisons.length === 0 ? (
          <p className="text-sm text-ink-2">시공 전후로 기록한 측정값이 없어 차이를 계산하지 않습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table id="phase-comparison" className="w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">시공 전후 측정값 비교</caption>
                <thead>
                  <tr className={TABLE_HEAD}>
                    <th scope="col" className={TH}>장소 · 항목</th>
                    <th scope="col" className={TH_NUM}>시공 전 평균 (n)</th>
                    <th scope="col" className={TH_NUM}>시공 전 표준편차</th>
                    <th scope="col" className={TH_NUM}>시공 후 평균 (n)</th>
                    <th scope="col" className={TH_NUM}>시공 후 표준편차</th>
                    <th scope="col" className={TH_NUM}>평균 차이</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((row) => (
                    <tr key={`${row.site}|${row.metric}|${row.unit}`} className="border-b border-line">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        {row.site} · {row.metric}
                        <span className="ml-1 text-xs text-ink-3">{row.unit}</span>
                      </th>
                      <td className={TD_NUM}>{fmt(row.before.mean)} ({row.before.count})</td>
                      <td className={TD_NUM}>{fmtSd(row.before)}</td>
                      <td className={TD_NUM}>{fmt(row.after.mean)} ({row.after.count})</td>
                      <td className={TD_NUM}>{fmtSd(row.after)}</td>
                      <td className={TD_NUM}>
                        {row.meanDifference === null
                          ? "계산 불가"
                          : `${row.meanDifference > 0 ? "+" : ""}${formatNumber(row.meanDifference, 3)} ${row.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {controls.length > 0 && (
              <p role="alert" className="mt-3 rounded-md border border-caution p-3 text-sm text-caution">
                확인: {controls.map((c) => `${c.site}에 ${c.missing.join("·")} 전후 기록이 없습니다`).join(", ")}.
                날씨가 달랐다면 온도 차이를 쿨루프 효과로 볼 수 없습니다.
              </p>
            )}
          </>
        )}
      </Section>

      <MeasurementChart records={records} />
    </div>
  );
}

function MeasurementChart({ records }: { records: Measurement[] }) {
  const options = useMemo(() => {
    const seen = new Map<string, { metric: string; unit: string }>();
    for (const record of records) {
      if (record.value !== null) {
        seen.set(JSON.stringify([record.metric, record.unit]), {
          metric: record.metric,
          unit: record.unit,
        });
      }
    }
    return [...seen.entries()];
  }, [records]);

  const [chosen, setChosen] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<SeriesGrouping>("condition");
  const active = options.find(([key]) => key === chosen) ?? options[0];

  const series = useMemo(
    () =>
      active
        ? buildTimeSeries(records, active[1].metric, active[1].unit, grouping)
        : null,
    [active, records, grouping],
  );

  const formatTime = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <Section
      id="measurement-chart"
      title="실측 변화 그래프"
      kind="measured"
      description="입력한 측정값만 그립니다. 기록이 없으면 그래프를 그리지 않습니다."
    >
      {!active || !series ? (
        <Empty />
      ) : (
        <ChartCard
          kind="measured"
          title={`G. 실측 ${active[1].metric} 변화`}
          unit={active[1].unit}
          conditions={`측정 ${series.rows.length}개 시각, 같은 시각의 반복 측정은 평균, 결측은 점을 찍지 않음`}
          source="사용자가 입력한 측정 기록"
          summary={`${active[1].metric} 측정값 ${series.rows.length}개 시각의 변화`}
          controls={
            <div className="mb-2 flex flex-wrap gap-2">
              <select
                aria-label="그래프 항목"
                className={`${INPUT_CLASS} w-auto`}
                value={active[0]}
                onChange={(event) => setChosen(event.target.value)}
              >
                {options.map(([key, option]) => (
                  <option key={key} value={key}>
                    {option.metric} ({option.unit})
                  </option>
                ))}
              </select>
              <select
                aria-label="선을 나눌 기준"
                className={`${INPUT_CLASS} w-auto`}
                value={grouping}
                onChange={(event) => setGrouping(event.target.value as SeriesGrouping)}
              >
                <option value="condition">지붕 조건별</option>
                <option value="phase">측정 시점별</option>
              </select>
            </div>
          }
        >
          <LineChart data={series.rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              padding={{ left: 16, right: 16 }}
              tick={AXIS_TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              tickFormatter={(value) => formatTime(Number(value))}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={(value) => formatNumber(Number(value), 1)}
            />
            <Tooltip
              content={
                <ChartTooltip
                  unit={active[1].unit}
                  kind="measured"
                  digits={3}
                  labelFormatter={(value) => formatTime(Number(value))}
                />
              }
              cursor={{ stroke: "var(--axis)" }}
            />
            <Legend formatter={legendText} iconType="circle" iconSize={8} itemSorter={null} />
            {series.groups.map((group) => (
              <Line
                key={group}
                dataKey={group}
                name={group}
                stroke={groupColor(group, grouping)}
                fill={groupColor(group, grouping)}
                strokeWidth={2}
                connectNulls
                dot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartCard>
      )}
    </Section>
  );
}

function Empty() {
  return <p className="text-sm text-ink-2">측정값이 없습니다. 값을 만들어 표시하지 않습니다.</p>;
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
