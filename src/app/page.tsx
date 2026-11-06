"use client";

import dynamic from "next/dynamic";

/**
 * 저장된 값은 브라우저의 localStorage에만 있어 서버는 읽을 수 없습니다.
 * 그래서 앱 전체를 브라우저에서만 그립니다. 덕분에 첫 렌더부터 저장값을 읽을 수 있습니다.
 */
const EnergyShieldLab = dynamic(
  () => import("@/components/EnergyShieldLab"),
  {
    ssr: false,
    loading: () => (
      <p className="p-8 text-sm text-ink-2">Energy Shield Lab을 불러오는 중입니다.</p>
    ),
  },
);

export default function Home() {
  return <EnergyShieldLab />;
}
