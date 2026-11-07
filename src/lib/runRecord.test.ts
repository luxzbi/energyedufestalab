import { describe, expect, it } from "vitest";
import { DEFAULT_RAW_INPUTS, toRawInputs, validateInputs } from "./fields";
import { MODEL_VERSION, type ModelInputs } from "./model";
import {
  buildRunCsv,
  buildRunJson,
  computeRunResults,
  createRun,
  findDifferences,
  parseRunJson,
  verifyRun,
} from "./runRecord";
import {
  configToSettings,
  DEFAULT_SETTINGS,
  parseSettings,
} from "./settings";

const inputs = validateInputs(DEFAULT_RAW_INPUTS).values as ModelInputs;
const config = parseSettings(DEFAULT_SETTINGS).config!;
const now = new Date("2026-11-07T01:02:03Z");
const run = createRun(inputs, config, "run-1", now);

describe("실행 기록 내용", () => {
  it("요구한 정보를 모두 담는다", () => {
    expect(run.executedAt).toBe("2026-11-07T01:02:03.000Z");
    expect(run.modelVersion).toBe(MODEL_VERSION);
    expect(run.inputs).toEqual(inputs);
    expect(run.scenarioType).toBe("A. 분리 설치형");
    expect(run.sources.length).toBeGreaterThan(5);
    expect(run.assumptions.length).toBeGreaterThan(0);
    expect(run.limitations.some((text) => text.includes("제조"))).toBe(true);
    expect(run.results.scenarios.combinedSeparate.solarGeneratedKwh).toBeGreaterThan(0);
  });

  it("가정 기반으로 표시하고 실측 자료를 넣지 않는다", () => {
    expect(run.dataKind).toBe("가정 기반 추정");
    expect(run.measurementsIncluded).toBe(false);
    expect(run).not.toHaveProperty("measurements");
  });
});

describe("재현성", () => {
  it("같은 입력은 같은 결과를 낸다", () => {
    expect(computeRunResults(inputs, config)).toEqual(computeRunResults(inputs, config));
  });

  it("JSON으로 내보내고 다시 불러오면 동일한 결과가 나온다", () => {
    const { run: loaded, error } = parseRunJson(buildRunJson(run));
    expect(error).toBeNull();
    const verification = verifyRun(loaded!);
    expect(verification.reproduced).toBe(true);
    expect(verification.differences).toEqual([]);
    expect(verification.modelVersionMatches).toBe(true);
  });

  it("입력값을 입력칸으로 복원해도 같은 값이 된다", () => {
    expect(validateInputs(toRawInputs(inputs)).values).toEqual(inputs);
    expect(parseSettings(configToSettings(config)).config).toEqual(config);
  });

  it("직접 입력한 예산도 복원된다", () => {
    const custom = { ...config, budgetKrw: 725_000_000 };
    const settings = configToSettings(custom);
    expect(settings.budgetChoice).toBe("custom");
    expect(parseSettings(settings).config?.budgetKrw).toBe(725_000_000);
  });

  it("결과를 조작하면 불일치로 잡아낸다", () => {
    const tampered = JSON.parse(buildRunJson(run));
    tampered.results.scenarios.solarPv.co2ReductionT += 1;
    const verification = verifyRun(parseRunJson(JSON.stringify(tampered)).run!);
    expect(verification.reproduced).toBe(false);
    expect(verification.differences).toContain("results.scenarios.solarPv.co2ReductionT");
  });

  it("입력값을 바꾸고 결과를 그대로 두면 불일치다", () => {
    const tampered = JSON.parse(buildRunJson(run));
    tampered.inputs.factoryCount = 101;
    expect(verifyRun(parseRunJson(JSON.stringify(tampered)).run!).reproduced).toBe(false);
  });

  it("결과 항목이 빠지거나 시드가 바뀌어도 잡아낸다", () => {
    const missing = JSON.parse(buildRunJson(run));
    delete missing.results.optimization;
    expect(verifyRun(parseRunJson(JSON.stringify(missing)).run!).reproduced).toBe(false);

    const seed = JSON.parse(buildRunJson(run));
    seed.config.dataset.seed = 1;
    expect(verifyRun(parseRunJson(JSON.stringify(seed)).run!).reproduced).toBe(false);
  });

  it("모델 버전이 다르면 알려 준다", () => {
    const old = JSON.parse(buildRunJson(run));
    old.modelVersion = "1.0.0";
    expect(verifyRun(parseRunJson(JSON.stringify(old)).run!).modelVersionMatches).toBe(false);
  });

  it("아주 작은 부동소수점 차이는 일치로 본다", () => {
    expect(findDifferences({ a: 1000 }, { a: 1000 + 1e-8 })).toEqual([]);
    expect(findDifferences({ a: 1000 }, { a: 1001 })).toEqual(["results.a"]);
  });
});

describe("불러오기 검증", () => {
  const edit = (change: (value: Record<string, unknown>) => void) => {
    const value = JSON.parse(buildRunJson(run));
    change(value);
    return parseRunJson(JSON.stringify(value));
  };

  it("JSON이 아니거나 다른 파일이면 거부한다", () => {
    expect(parseRunJson("{broken").error).toContain("JSON");
    expect(parseRunJson("[]").error).not.toBeNull();
    expect(parseRunJson('{"schema":"other"}').error).toContain("실행 기록");
    expect(parseRunJson("null").error).not.toBeNull();
  });

  it("너무 큰 파일을 거부한다", () => {
    expect(parseRunJson("x".repeat(5_000_001)).error).toContain("큽니다");
  });

  it("허용 범위 밖의 입력값을 거부한다", () => {
    expect(edit((v) => void ((v.inputs as ModelInputs).subsidyPct = 150)).run).toBeNull();
    expect(edit((v) => void ((v.inputs as Record<string, unknown>).factoryCount = "100")).run).toBeNull();
  });

  it("잘못된 설정을 거부한다", () => {
    expect(edit((v) => void ((v.config as Record<string, unknown>).budgetKrw = -1)).run).toBeNull();
    expect(edit((v) => void ((v.config as Record<string, unknown>).analysisScenario = "x")).run).toBeNull();
    expect(edit((v) => void ((v.config as Record<string, unknown>).sensitivityMetric = "constructor")).run).toBeNull();
    expect(edit((v) => void delete v.config).run).toBeNull();
  });

  it("모르는 필드를 옮기지 않고, 데이터 구분을 파일 값으로 바꾸지 못한다", () => {
    const { run: loaded } = edit((v) => {
      v.injected = "x";
      v.dataKind = "실측";
      v.measurementsIncluded = true;
    });
    expect(loaded).not.toHaveProperty("injected");
    expect(loaded?.dataKind).toBe("가정 기반 추정");
    expect(loaded?.measurementsIncluded).toBe(false);
  });
});

describe("실행 기록 CSV", () => {
  const csv = buildRunCsv(run);

  it("BOM과 요구 항목을 담는다", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    for (const text of [
      "실행 일시",
      "계산 모델 버전",
      "시나리오 유형",
      "입력 변수",
      "자료 출처",
      "적용 가정",
      "모델 한계",
      "태양광 자가소비량",
      "전력망 역송량",
      "민감도(신뢰구간 아님)",
      "가상 데이터: 0-1 정수계획법",
    ]) {
      expect(csv).toContain(text);
    }
  });

  it("이름에 위험한 글자가 없도록 처리한다: 수식으로 시작하는 칸이 없다", () => {
    for (const line of csv.trim().split("\r\n")) {
      expect(line.replace("﻿", "")).not.toMatch(/(^|,)[=+@]/);
    }
  });
});
