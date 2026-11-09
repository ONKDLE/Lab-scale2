/** "4500.00" -> "4,500원". 백엔드가 금액을 문자열로 주기 때문에 숫자로 바꿔서 쓴다. */
export function formatAmount(amount: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`;
}

/** "2026-09-01" -> "2026.09.01" */
export function formatDate(date: string): string {
  return date.replace(/-/g, '.');
}
