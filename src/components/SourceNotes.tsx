import { EVIDENCE_LABELS, FIELD_SPECS } from "@/lib/fields";

export function SourceNotes() {
  return (
    <div className="divide-y divide-line">
      {FIELD_SPECS.map((field) => (
        <div key={field.key} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-sm font-semibold">
              {field.label}{" "}
              <span className="font-normal text-ink-2 tabular-nums">
                {field.defaultValue === ""
                  ? "기본값 없음 (비워 두면 미산정)"
                  : `기본값 ${Number(field.defaultValue).toLocaleString("ko-KR", {
                      maximumFractionDigits: 6,
                    })} ${field.unit}`}
              </span>
            </h3>
            <span className="text-xs text-ink-3">{EVIDENCE_LABELS[field.evidence]}</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-ink-2">{field.note}</p>
          {field.sources && (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {field.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline underline-offset-2"
                  >
                    {source.label}
                    <span className="sr-only"> (새 창, 외부 사이트)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
