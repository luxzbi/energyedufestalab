import {
  EVIDENCE_LABELS,
  FIELD_SPECS,
  type FieldSpec,
  type RawInputs,
  type ValidationResult,
} from "@/lib/fields";
import { BUTTON_SECONDARY, INPUT_CLASS } from "./ui";

const GROUPS: FieldSpec["group"][] = [
  "규모",
  "태양광",
  "냉방 (가정)",
  "비용",
  "탄소",
];

export function InputPanel({
  raw,
  validation,
  onChange,
  onReset,
  resetMessage,
}: {
  raw: RawInputs;
  validation: ValidationResult;
  onChange: (key: keyof RawInputs, value: string) => void;
  onReset: () => void;
  resetMessage: string;
}) {
  return (
    <form
      aria-labelledby="inputs-title"
      className="rounded-lg border border-line bg-surface p-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="inputs-title" className="text-lg font-semibold">
          가정 입력값
        </h2>
        <button type="button" className={BUTTON_SECONDARY} onClick={onReset}>
          기본값으로
        </button>
      </div>
      <p className="mt-1 text-sm leading-6 text-ink-2">
        기본값은 실제 사업 자료가 아니라 연습용 값입니다. 각 값의 근거는
        ‘출처와 가정’에서 볼 수 있습니다.
      </p>
      <p role="status" className="min-h-5 text-xs text-ink-2">
        {resetMessage}
      </p>

      {GROUPS.map((group) => (
        <fieldset key={group} className="mt-3 border-t border-line pt-3">
          <legend className="pr-2 text-sm font-semibold">{group}</legend>
          <div className="space-y-3">
            {FIELD_SPECS.filter((field) => field.group === group).map((field) => (
              <Field
                key={field.key}
                field={field}
                value={raw[field.key]}
                error={validation.errors[field.key]}
                warning={validation.warnings[field.key]}
                onChange={(value) => onChange(field.key, value)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </form>
  );
}

function Field({
  field,
  value,
  error,
  warning,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  error?: string;
  warning?: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.key}`;
  const messageId = `${id}-message`;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm">
          {field.label}
        </label>
        <span className="text-xs whitespace-nowrap text-ink-3">
          {EVIDENCE_LABELS[field.evidence]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          className={`${INPUT_CLASS} min-w-0 flex-1 text-right tabular-nums`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error || warning ? messageId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="w-[5.5rem] shrink-0 text-xs text-ink-2">{field.unit}</span>
      </div>
      {error && (
        <p id={messageId} className="mt-1 text-xs text-danger">
          오류: {error}
        </p>
      )}
      {!error && warning && (
        <p id={messageId} className="mt-1 text-xs text-caution">
          확인: {warning}
        </p>
      )}
    </div>
  );
}
