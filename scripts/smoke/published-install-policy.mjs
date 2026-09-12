export function shouldRetryPublishedInstall(result) {
  if (result?.status === 0) return false;
  const detail = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
  return /ETARGET|EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|E429|E500|E502|E503/i.test(detail);
}
