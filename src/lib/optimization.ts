/**
 * 고정 예산 정책 최적화 (0-1 정수계획법)
 *
 *   최대화   Σ cᵢ xᵢ            cᵢ: 공장 i의 추정 CO2 감축량 (tCO2eq/년)
 *   제약     Σ wᵢ xᵢ ≤ B        wᵢ: 공장 i의 대전시 부담액 (원), B: 대전시 예산 (원)
 *            xᵢ ∈ {0, 1},  구조 안전 부적합이면 xᵢ = 0
 *
 * 여기서 쓰는 공장은 모두 난수로 만든 가상 데이터입니다. 실제 공장이 아닙니다.
 */
import {
  calculateScenario,
  type ModelInputs,
  type ScenarioId,
} from "./model";

/** 시드를 고정하면 항상 같은 수열을 내는 난수 생성기(mulberry32) */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VirtualFactory {
  id: string;
  roofAreaM2: number;
  usableSolarPct: number;
  /** 공장별 차이를 만드는 임의 배율 */
  yieldFactor: number;
  coolingFactor: number;
  costFactor: number;
  structurallySafe: boolean;
}

export interface DatasetOptions {
  count: number;
  seed: number;
  /** 구조 안전 부적합 공장의 임의 비율 (%) */
  unsafeSharePct: number;
}

const between = (random: () => number, low: number, high: number) =>
  low + (high - low) * random();

/** 입력값의 평균을 중심으로 임의의 차이를 준 가상 공장을 만듭니다. */
export function generateVirtualFactories(
  inputs: ModelInputs,
  options: DatasetOptions,
): VirtualFactory[] {
  const random = seededRandom(options.seed);
  return Array.from({ length: options.count }, (_, index) => ({
    id: `가상-${String(index + 1).padStart(3, "0")}`,
    roofAreaM2: Math.round(inputs.avgRoofAreaM2 * between(random, 0.4, 1.6)),
    usableSolarPct: Math.min(
      100,
      Math.max(0, inputs.usableSolarPct + between(random, -20, 20)),
    ),
    yieldFactor: between(random, 0.85, 1.1),
    coolingFactor: between(random, 0.6, 1.4),
    costFactor: between(random, 0.85, 1.25),
    structurallySafe: random() * 100 >= options.unsafeSharePct,
  }));
}

export interface EvaluatedFactory {
  factory: VirtualFactory;
  totalCostKrw: number;
  /** 대전시 부담액을 원 단위로 올림한 정수. 예산 비교에 정수를 씁니다. */
  municipalCostKrw: number;
  ownerCostKrw: number;
  treatedRoofAreaM2: number;
  solarGeneratedKwh: number;
  coolingSavedKwh: number;
  co2ReductionT: number;
}

/** 공장별 값은 정책 계산과 같은 calculateScenario로 구합니다. 계산식이 갈라지지 않게 하기 위해서입니다. */
export function evaluateFactories(
  factories: VirtualFactory[],
  inputs: ModelInputs,
  scenarioId: ScenarioId,
): EvaluatedFactory[] {
  return factories.map((factory) => {
    const r = calculateScenario(
      {
        ...inputs,
        factoryCount: 1,
        avgRoofAreaM2: factory.roofAreaM2,
        usableSolarPct: factory.usableSolarPct,
        solarYieldKwhPerKw: Math.min(
          8760,
          inputs.solarYieldKwhPerKw * factory.yieldFactor,
        ),
        coolingBaselineKwhPerM2:
          inputs.coolingBaselineKwhPerM2 * factory.coolingFactor,
        coolRoofCostKrwPerM2: inputs.coolRoofCostKrwPerM2 * factory.costFactor,
        pvCostKrwPerKw: inputs.pvCostKrwPerKw * factory.costFactor,
      },
      scenarioId,
    );
    const municipalCostKrw = Math.ceil(r.municipalCostKrw);
    return {
      factory,
      totalCostKrw: r.totalCostKrw,
      municipalCostKrw,
      // 올림 때문에 음수가 되는 일을 막습니다(지원율 100%일 때 1원 미만 차이).
      ownerCostKrw: Math.max(0, r.totalCostKrw - municipalCostKrw),
      treatedRoofAreaM2: r.treatedRoofAreaM2,
      solarGeneratedKwh: r.solarGeneratedKwh,
      coolingSavedKwh: r.coolingSavedKwh,
      co2ReductionT: r.co2ReductionT,
    };
  });
}

export interface KnapsackItem {
  /** 음이 아닌 정수 */
  weight: number;
  value: number;
}

export interface KnapsackSolution {
  selected: number[];
  value: number;
  weight: number;
  /** exact: 최적 증명 완료, approximate: 계산 한도에 걸려 최선의 해만 보장 */
  status: "exact" | "approximate";
  /** 선형완화로 구한 최적값의 상한 */
  upperBound: number;
  statesExamined: number;
}

const EPSILON = 1e-9;

/**
 * 0-1 배낭 문제의 정확한 풀이: 파레토 동적계획법 + 선형완화 가지치기.
 *
 * 앞에서부터 공장을 하나씩 고려하며 (쓴 예산, 감축량) 상태를 모읍니다.
 * - 예산을 더 쓰면서 감축량이 같거나 적은 상태는 절대 최적이 될 수 없어 버립니다.
 * - 남은 공장을 쪼개서라도 담은 상한이 현재 최선보다 낮은 상태도 버립니다.
 * 버린 상태는 모두 최적이 될 수 없으므로, 끝까지 돌면 결과는 최적해입니다.
 * 상태 수가 maxStates를 넘으면 멈추고 그때까지의 최선을 근사해로 표시합니다.
 */
export function solveKnapsack(
  items: KnapsackItem[],
  capacity: number,
  maxStates = 3_000_000,
): KnapsackSolution {
  const freeItems: number[] = [];
  const candidates: number[] = [];
  items.forEach((item, index) => {
    if (item.weight === 0) freeItems.push(index);
    else if (item.weight <= capacity && item.value > 0) candidates.push(index);
  });
  // 값이 음수인 무료 항목은 없다고 전제합니다(감축량은 0 이상).
  const freeValue = freeItems.reduce((sum, i) => sum + items[i].value, 0);

  // 효율 순 정렬. 동률은 번호 순으로 고정해 결과를 재현 가능하게 합니다.
  candidates.sort(
    (a, b) =>
      items[b].value / items[b].weight - items[a].value / items[a].weight || a - b,
  );
  const n = candidates.length;

  const prefixWeight = new Float64Array(n + 1);
  const prefixValue = new Float64Array(n + 1);
  for (let k = 0; k < n; k += 1) {
    prefixWeight[k + 1] = prefixWeight[k] + items[candidates[k]].weight;
    prefixValue[k + 1] = prefixValue[k] + items[candidates[k]].value;
  }

  /** k번째 이후 공장을 쪼개 담을 수 있다고 할 때 추가로 얻을 수 있는 값의 상한 */
  const fractionalBound = (k: number, room: number) => {
    const target = prefixWeight[k] + room;
    let low = k;
    let high = n;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (prefixWeight[mid] <= target) low = mid;
      else high = mid - 1;
    }
    let bound = prefixValue[low] - prefixValue[k];
    if (low < n) {
      const left = target - prefixWeight[low];
      const item = items[candidates[low]];
      bound += (item.value * left) / item.weight;
    }
    return bound;
  };

  // 탐욕해를 초기 최선으로 둡니다. 가지치기의 기준이자 근사 시의 하한입니다.
  let greedyWeight = 0;
  let greedyValue = 0;
  const greedySelected: number[] = [];
  for (const index of candidates) {
    if (greedyWeight + items[index].weight <= capacity) {
      greedyWeight += items[index].weight;
      greedyValue += items[index].value;
      greedySelected.push(index);
    }
  }

  const rootBound = freeValue + fractionalBound(0, capacity);

  // 선택 이력은 부모 포인터로 저장합니다.
  const nodeParent: number[] = [-1];
  const nodeItem: number[] = [-1];
  let weights: number[] = [0];
  let values: number[] = [0];
  let nodes: number[] = [0];

  let bestValue = greedyValue;
  let bestNode = -1; // -1이면 탐욕해가 최선
  let examined = 1;
  let exact = true;

  for (let k = 0; k < n; k += 1) {
    const item = items[candidates[k]];
    const nextWeights: number[] = [];
    const nextValues: number[] = [];
    const nextNodes: number[] = [];
    let bestSoFar = -Infinity;

    const push = (weight: number, value: number, node: number, isNew: boolean) => {
      if (value <= bestSoFar + EPSILON) return; // 지배당한 상태
      bestSoFar = value;
      // 남은 공장으로도 현재 최선을 넘을 수 없으면 버립니다.
      if (value + fractionalBound(k + 1, capacity - weight) + EPSILON < bestValue) return;

      let finalNode = node;
      if (isNew) {
        nodeParent.push(node);
        nodeItem.push(candidates[k]);
        finalNode = nodeParent.length - 1;
        if (value > bestValue + EPSILON) {
          bestValue = value;
          bestNode = finalNode;
        }
      }
      nextWeights.push(weight);
      nextValues.push(value);
      nextNodes.push(finalNode);
    };

    // 두 정렬 목록(안 고름 / 고름)을 무게 순으로 병합합니다.
    let keep = 0;
    let take = 0;
    while (keep < weights.length || take < weights.length) {
      const takeWeight =
        take < weights.length ? weights[take] + item.weight : Infinity;
      if (takeWeight > capacity) take = weights.length;
      const useKeep =
        keep < weights.length &&
        (take >= weights.length ||
          weights[keep] < takeWeight ||
          (weights[keep] === takeWeight &&
            values[keep] >= values[take] + item.value));
      if (useKeep) {
        push(weights[keep], values[keep], nodes[keep], false);
        keep += 1;
      } else if (take < weights.length) {
        push(takeWeight, values[take] + item.value, nodes[take], true);
        take += 1;
      }
    }

    weights = nextWeights;
    values = nextValues;
    nodes = nextNodes;
    examined += weights.length;

    if (nodeParent.length > maxStates) {
      exact = false;
      break;
    }
  }

  let selected: number[];
  if (bestNode === -1) {
    selected = greedySelected;
  } else {
    selected = [];
    for (let node = bestNode; node > 0; node = nodeParent[node]) {
      selected.push(nodeItem[node]);
    }
  }
  selected = [...selected, ...freeItems].sort((a, b) => a - b);
  const value = selected.reduce((sum, i) => sum + items[i].value, 0);
  const weight = selected.reduce((sum, i) => sum + items[i].weight, 0);

  return {
    selected,
    value,
    weight,
    status: exact ? "exact" : "approximate",
    upperBound: exact ? value : rootBound,
    statesExamined: examined,
  };
}

export type SelectionMethod =
  | "random"
  | "largestRoof"
  | "bestEfficiency"
  | "optimal";

export const SELECTION_METHODS: SelectionMethod[] = [
  "random",
  "largestRoof",
  "bestEfficiency",
  "optimal",
];

export const SELECTION_LABELS: Record<SelectionMethod, string> = {
  random: "무작위 선정",
  largestRoof: "지붕 면적 큰 순",
  bestEfficiency: "감축 효율 높은 순",
  optimal: "0-1 정수계획법",
};

export interface SelectionResult {
  method: SelectionMethod;
  selectedIds: string[];
  factoryCount: number;
  municipalCostKrw: number;
  unusedBudgetKrw: number;
  ownerCostKrw: number;
  totalCostKrw: number;
  treatedRoofAreaM2: number;
  solarGeneratedKwh: number;
  coolingSavedKwh: number;
  co2ReductionT: number;
  /** 최적해 증명 여부. 탐욕·무작위 규칙은 최적을 보장하지 않습니다. */
  solutionType: "exact" | "approximate" | "heuristic";
  upperBoundT?: number;
}

/** 정해진 순서대로 훑으며 예산에 들어가는 공장만 담습니다(못 들어가면 건너뜁니다). */
function fillInOrder(order: EvaluatedFactory[], budgetKrw: number) {
  const chosen: EvaluatedFactory[] = [];
  let used = 0;
  for (const candidate of order) {
    if (used + candidate.municipalCostKrw <= budgetKrw) {
      used += candidate.municipalCostKrw;
      chosen.push(candidate);
    }
  }
  return chosen;
}

const efficiency = (f: EvaluatedFactory) =>
  f.municipalCostKrw > 0
    ? f.co2ReductionT / f.municipalCostKrw
    : f.co2ReductionT > 0
      ? Infinity
      : 0;

function summarizeSelection(
  method: SelectionMethod,
  chosen: EvaluatedFactory[],
  budgetKrw: number,
  solutionType: SelectionResult["solutionType"],
  upperBoundT?: number,
): SelectionResult {
  const sum = (pick: (f: EvaluatedFactory) => number) =>
    chosen.reduce((total, f) => total + pick(f), 0);
  const municipalCostKrw = sum((f) => f.municipalCostKrw);
  return {
    method,
    selectedIds: chosen.map((f) => f.factory.id),
    factoryCount: chosen.length,
    municipalCostKrw,
    unusedBudgetKrw: budgetKrw - municipalCostKrw,
    ownerCostKrw: sum((f) => f.ownerCostKrw),
    totalCostKrw: sum((f) => f.totalCostKrw),
    treatedRoofAreaM2: sum((f) => f.treatedRoofAreaM2),
    solarGeneratedKwh: sum((f) => f.solarGeneratedKwh),
    coolingSavedKwh: sum((f) => f.coolingSavedKwh),
    co2ReductionT: sum((f) => f.co2ReductionT),
    solutionType,
    upperBoundT,
  };
}

export interface OptimizationResult {
  budgetKrw: number;
  datasetSize: number;
  eligibleCount: number;
  excludedUnsafeCount: number;
  results: Record<SelectionMethod, SelectionResult>;
}

/** 네 방식 모두 같은 예산과 같은 후보(구조 안전 적합 공장)를 씁니다. */
export function compareSelectionMethods(
  evaluated: EvaluatedFactory[],
  budgetKrw: number,
  randomSeed: number,
  maxStates?: number,
): OptimizationResult {
  const eligible = evaluated.filter((f) => f.factory.structurallySafe);
  const byId = (a: EvaluatedFactory, b: EvaluatedFactory) =>
    a.factory.id.localeCompare(b.factory.id);

  // 무작위: 시드를 고정한 피셔-예이츠 섞기
  const shuffled = [...eligible].sort(byId);
  const random = seededRandom(randomSeed);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const largest = [...eligible].sort(
    (a, b) => b.factory.roofAreaM2 - a.factory.roofAreaM2 || byId(a, b),
  );
  const efficient = [...eligible].sort((a, b) => {
    const ea = efficiency(a);
    const eb = efficiency(b);
    return ea === eb ? byId(a, b) : eb - ea;
  });

  const solution = solveKnapsack(
    eligible.map((f) => ({ weight: f.municipalCostKrw, value: f.co2ReductionT })),
    Math.floor(budgetKrw),
    maxStates,
  );

  return {
    budgetKrw,
    datasetSize: evaluated.length,
    eligibleCount: eligible.length,
    excludedUnsafeCount: evaluated.length - eligible.length,
    results: {
      random: summarizeSelection("random", fillInOrder(shuffled, budgetKrw), budgetKrw, "heuristic"),
      largestRoof: summarizeSelection("largestRoof", fillInOrder(largest, budgetKrw), budgetKrw, "heuristic"),
      bestEfficiency: summarizeSelection("bestEfficiency", fillInOrder(efficient, budgetKrw), budgetKrw, "heuristic"),
      optimal: summarizeSelection(
        "optimal",
        solution.selected.map((i) => eligible[i]),
        budgetKrw,
        solution.status,
        solution.upperBound,
      ),
    },
  };
}
