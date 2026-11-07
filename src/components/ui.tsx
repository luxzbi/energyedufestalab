import type { ReactNode } from "react";

export type DataKind = "hypothetical" | "virtual" | "measured";

/**
 * 데이터의 성격을 알려 주는 표시. 색이 아니라 모양과 글자로 구분합니다.
 * 가정 기반은 점선, 가상 데이터는 점 테두리와 어두운 배경, 사람 측정은 꽉 찬 배경입니다.
 */
export function DataKindBadge({ kind }: { kind: DataKind }) {
  if (kind === "hypothetical") {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-dashed border-ink-2 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-ink-2">
        가정 기반 추정 · 측정값 아님
      </span>
    );
  }
  if (kind === "virtual") {
    return (
      <span className="inline-flex shrink-0 items-center rounded border-2 border-dotted border-ink-2 bg-sunken px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-ink">
        가상 공장 데이터 · 실제 공장 아님
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-solid px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-on-solid">
      사람 측정
    </span>
  );
}

export function Section({
  id,
  title,
  kind,
  description,
  actions,
  children,
}: {
  id: string;
  title: string;
  kind?: DataKind;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-title`} className="text-lg font-semibold">
              {title}
            </h2>
            {kind && <DataKindBadge kind={kind} />}
          </div>
          {description && (
            <div className="mt-1 max-w-3xl text-sm leading-6 text-ink-2">
              {description}
            </div>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** 해석에 꼭 필요한 주의 문구 */
export function Note({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-sunken p-3 text-sm leading-6 text-ink-2">
      {title && <strong className="font-semibold text-ink">{title} </strong>}
      {children}
    </div>
  );
}

export function ErrorList({ errors }: { errors: Record<string, string> }) {
  return (
    <div role="alert" className="rounded-md border border-danger p-3 text-sm text-danger">
      <p className="font-medium">설정 오류를 고칠 때까지 계산을 멈춥니다.</p>
      <ul className="mt-1 list-disc pl-5">
        {[...new Set(Object.values(errors))].map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex min-h-9 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-solid text-on-solid hover:opacity-85`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line-strong hover:bg-sunken`;

export const INPUT_CLASS =
  "w-full min-h-9 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm aria-[invalid=true]:border-danger";

export const TABLE_HEAD = "border-b border-line-strong text-left";
export const TH = "py-2 pr-3 font-medium";
export const TH_NUM = "px-2 py-2 text-right font-medium";
export const TD_NUM = "px-2 py-2 text-right whitespace-nowrap tabular-nums";
