/** 브라우저에서 파일을 내려받습니다. 서버로 아무것도 보내지 않습니다. */
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const todayStamp = () => new Date().toISOString().slice(0, 10);
