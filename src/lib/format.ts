const number = (n: number, maximumFractionDigits = 0) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits });

export const formatNumber = number;

export const formatKwh = (kwh: number) => `${number(kwh)} kWh`;

export const formatTon = (ton: number) => `${number(ton, 1)} tCO2eq`;

/** 1억 원 이상이면 억 단위, 아니면 원 단위로 보여 줍니다. */
export function formatKrw(krw: number) {
  return Math.abs(krw) >= 1e8
    ? `${number(krw / 1e8, 2)}억 원`
    : `${number(krw)}원`;
}
