import type { Transaction } from '../types/transaction';

/** 정상(ACTIVE) 거래의 건수와 합계. 백엔드 요약과 같은 규칙이라, 취소/복구 직후 화면이 바로 맞게 계산한다. */
export function summarizeActive(transactions: Transaction[]): { count: number; total: string } {
  let cents = 0;
  let count = 0;
  for (const transaction of transactions) {
    if (transaction.status !== 'ACTIVE') continue;
    count += 1;
    cents += Math.round(Number(transaction.amount) * 100); // 소수점 오차를 피하려고 '전' 단위 정수로 더한다
  }
  return { count, total: (cents / 100).toFixed(2) };
}
