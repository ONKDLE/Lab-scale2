import { useCallback, useEffect, useState } from 'react';
import { getTransactionList } from '../api/transactions';
import type { TransactionPage, TransactionStatus } from '../types/transaction';

interface Params {
  page: number;
  size: number;
  status?: TransactionStatus;
  keyword?: string;
}

interface State {
  data: TransactionPage | null;
  loading: boolean;
  error: Error | null;
}

/**
 * 조건(page, status, keyword)이 바뀔 때마다 목록을 다시 불러온다.
 * - 조건이 빠르게 연속으로 바뀌면 이전 요청은 취소하고, 늦게 도착한 옛날 응답은 무시한다.
 * - reload()를 호출하면 같은 조건으로 다시 요청한다 (에러 화면의 "다시 시도" 버튼).
 */
export function useTransactionList({ page, size, status, keyword }: Params) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));

    getTransactionList({ page, size, status, keyword }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => controller.abort();
  }, [page, size, status, keyword, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, reload };
}
