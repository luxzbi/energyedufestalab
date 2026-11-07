import { describe, expect, it } from "vitest";
import {
  DEFAULT_RAW_INPUTS,
  FIELD_SPECS,
  parseNumber,
  validateInputs,
  type RawInputs,
} from "./fields";

const withValue = (key: keyof RawInputs, value: string): RawInputs => ({
  ...DEFAULT_RAW_INPUTS,
  [key]: value,
});

describe("parseNumber", () => {
  it("평범한 숫자를 읽는다", () => {
    expect(parseNumber("12")).toBe(12);
    expect(parseNumber(" 0.5 ")).toBe(0.5);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("-3")).toBe(-3);
  });

  it("숫자가 아니면 null이다", () => {
    for (const bad of ["", " ", "abc", "1,000", "1e3", "Infinity", "12kW", "1.2.3"]) {
      expect(parseNumber(bad)).toBeNull();
    }
  });
});

describe("validateInputs", () => {
  it("빈 칸이 있으면 0으로 계산하지 않고 멈춘다", () => {
    const result = validateInputs(withValue("avgRoofAreaM2", ""));
    expect(result.values).toBeNull();
    expect(result.errors.avgRoofAreaM2).toBeDefined();
  });

  it("비율은 0~100 범위만 허용하며 경계값은 통과한다", () => {
    expect(validateInputs(withValue("subsidyPct", "101")).values).toBeNull();
    expect(validateInputs(withValue("subsidyPct", "-1")).values).toBeNull();
    expect(validateInputs(withValue("subsidyPct", "0")).values).not.toBeNull();
    expect(validateInputs(withValue("subsidyPct", "100")).values).not.toBeNull();
  });

  it("공장 수는 정수만 허용한다", () => {
    expect(validateInputs(withValue("factoryCount", "1.5")).errors.factoryCount).toContain("정수");
  });

  it("물리적으로 불가능한 값을 막는다", () => {
    expect(validateInputs(withValue("solarYieldKwhPerKw", "8761")).values).toBeNull();
    expect(validateInputs(withValue("pvDensityKwPerM2", "1.1")).values).toBeNull();
    expect(validateInputs(withValue("pvDensityKwPerM2", "0")).values).toBeNull();
  });

  it("드문 값은 계산은 하되 경고한다", () => {
    // kW/m²에 W/m²를 잘못 넣은 경우와 비슷한 값
    const result = validateInputs(withValue("pvDensityKwPerM2", "0.9"));
    expect(result.values).not.toBeNull();
    expect(result.warnings.pvDensityKwPerM2).toBeDefined();
  });

  it("문자열을 숫자로 변환해 돌려준다", () => {
    expect(validateInputs(DEFAULT_RAW_INPUTS).values?.factoryCount).toBe(100);
  });
});

describe("출처 표시 규칙", () => {
  it("모든 입력에 단위와 설명이 있다", () => {
    for (const field of FIELD_SPECS) {
      expect(field.unit).not.toBe("");
      expect(field.note.length).toBeGreaterThan(10);
    }
  });

  it("출처가 있다고 표시한 값은 링크를 가진다", () => {
    for (const field of FIELD_SPECS.filter((f) =>
      ["reference", "unverified", "weak"].includes(f.evidence),
    )) {
      expect(field.sources?.length).toBeGreaterThan(0);
    }
  });

  it("평균 배출계수는 검증 전 참고값, 지원율은 정책 제안값으로 표시한다", () => {
    expect(FIELD_SPECS.find((f) => f.key === "emissionFactorTPerMwh")?.evidence).toBe("unverified");
    const subsidy = FIELD_SPECS.find((f) => f.key === "subsidyPct");
    expect(subsidy?.evidence).toBe("proposal");
    expect(subsidy?.note).toContain("실제 운영 중인 대전시 제도가 아닙니다");
  });

  it("선택 입력은 비워 둘 수 있고, 잘못된 값은 거부한다", () => {
    expect(validateInputs(withValue("marginalEmissionFactorTPerMwh", "")).values?.marginalEmissionFactorTPerMwh).toBeNull();
    expect(validateInputs(withValue("marginalEmissionFactorTPerMwh", "abc")).values).toBeNull();
    expect(validateInputs(withValue("marginalEmissionFactorTPerMwh", "0.6")).values?.marginalEmissionFactorTPerMwh).toBe(0.6);
  });

  it("냉방 기준값과 절감률은 임의 가정으로 표시된다", () => {
    for (const key of ["coolingBaselineKwhPerM2", "coolingSavingPct"]) {
      expect(FIELD_SPECS.find((f) => f.key === key)?.evidence).toBe("arbitrary");
    }
  });
});
