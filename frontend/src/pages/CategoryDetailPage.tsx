import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { archiveCategory, getCategoryDetail, unarchiveCategory } from '../api/categories';
import { ApiError } from '../api/client';
import { cancelTransaction, restoreTransaction } from '../api/transactions';
import { useAuth } from '../auth/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import TransactionSkeleton from '../components/TransactionSkeleton';
import { useToast } from '../components/Toast';
import { formatAmount, formatDate } from '../lib/format';
import { summarizeActive } from '../lib/money';
import type { CategoryDetail } from '../types/category';
import type { Transaction } from '../types/transaction';
import NotFoundPage from './NotFoundPage';

type Confirm =
  | { kind: 'cancel' | 'restore'; transaction: Transaction }
  | { kind: 'archive' | 'unarchive' };

interface State {
  detail: CategoryDetail | null;
  loading: boolean;
  error: Error | null;
}

function describe(confirm: Confirm): { title: string; message: string; confirmLabel: string; danger: boolean } {
  switch (confirm.kind) {
    case 'cancel':
      return {
        title: '거래를 취소할까요?',
        message: `${confirm.transaction.merchant_name} · ${formatAmount(confirm.transaction.amount)}\n취소하면 합계에서 빠집니다. 언제든 복구할 수 있어요.`,
        confirmLabel: '거래 취소',
        danger: true,
      };
    case 'restore':
      return {
        title: '취소한 거래를 복구할까요?',
        message: `${confirm.transaction.merchant_name} · ${formatAmount(confirm.transaction.amount)}\n복구하면 합계에 다시 포함됩니다.`,
        confirmLabel: '복구',
        danger: false,
      };
    case 'archive':
      return {
        title: '카테고리를 보관할까요?',
        message: '보관하면 이 카테고리의 거래를 취소하거나 복구할 수 없습니다. 언제든 보관을 해제할 수 있어요.',
        confirmLabel: '보관',
        danger: true,
      };
    case 'unarchive':
      return {
        title: '보관을 해제할까요?',
        message: '해제하면 다시 거래를 취소하거나 복구할 수 있습니다.',
        confirmLabel: '보관 해제',
        danger: false,
      };
  }
}

/** 카테고리 상세: 카테고리 정보 + 그 안의 거래 목록 + 거래 취소/복구 + 카테고리 보관/해제 */
export default function CategoryDetailPage() {
  const { categoryId } = useParams();
  const id = categoryId !== undefined && /^\d+$/.test(categoryId) ? Number(categoryId) : null;
  const { user } = useAuth();
  const toast = useToast();

  const [state, setState] = useState<State>({ detail: null, loading: true, error: null });
  const [reloadCount, setReloadCount] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    setState({ detail: null, loading: true, error: null });
    getCategoryDetail(id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setState({ detail, loading: false, error: null });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({ detail: null, loading: false, error: caught instanceof Error ? caught : new Error(String(caught)) });
      });
    return () => controller.abort();
  }, [id, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  // 서버가 돌려준 최신 거래 한 건으로 목록의 그 줄만 바꾼다. (전체를 다시 불러오지 않아도 화면이 즉시 갱신된다)
  const replaceTransaction = (updated: Transaction) =>
    setState((previous) =>
      previous.detail
        ? {
            ...previous,
            detail: {
              ...previous.detail,
              transactions: previous.detail.transactions.map((t) => (t.id === updated.id ? updated : t)),
            },
          }
        : previous,
    );

  const runConfirmed = async () => {
    if (!confirm || !state.detail || busy) return;
    setBusy(true);
    try {
      switch (confirm.kind) {
        case 'cancel':
          replaceTransaction(await cancelTransaction(confirm.transaction.id));
          toast.success('거래를 취소했습니다.');
          break;
        case 'restore':
          replaceTransaction(await restoreTransaction(confirm.transaction.id));
          toast.success('거래를 복구했습니다.');
          break;
        case 'archive': {
          const updated = await archiveCategory(state.detail.id);
          setState((previous) => (previous.detail ? { ...previous, detail: { ...previous.detail, status: updated.status } } : previous));
          toast.success('카테고리를 보관했습니다.');
          break;
        }
        case 'unarchive': {
          const updated = await unarchiveCategory(state.detail.id);
          setState((previous) => (previous.detail ? { ...previous, detail: { ...previous.detail, status: updated.status } } : previous));
          toast.success('보관을 해제했습니다.');
          break;
        }
      }
    } catch (caught) {
      // 401(로그인 만료)은 공통 처리에서 이미 알렸으므로 여기서는 또 알리지 않는다.
      if (!(caught instanceof ApiError && caught.status === 401)) {
        toast.error(caught instanceof Error ? caught.message : '요청을 처리하지 못했습니다.');
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (id === null) {
    return <NotFoundPage title="카테고리를 찾을 수 없습니다." message="주소가 올바르지 않습니다." backTo="/categories" backLabel="카테고리 목록으로" />;
  }
  if (state.error) {
    if (state.error instanceof ApiError && state.error.status === 404) {
      return (
        <NotFoundPage
          title="카테고리를 찾을 수 없습니다."
          message="삭제되었거나 볼 수 없는 카테고리예요."
          backTo="/categories"
          backLabel="카테고리 목록으로"
        />
      );
    }
    return <ErrorState message={state.error.message} onRetry={reload} />;
  }
  if (state.loading || !state.detail) {
    return (
      <section aria-busy="true">
        <span className="skeleton-line skeleton-line--title" />
        <TransactionSkeleton count={4} />
      </section>
    );
  }

  const { detail } = state;
  const archived = detail.status === 'ARCHIVED';
  // 본인 카테고리가 아니면 읽기만 가능하다. (서버도 같은 규칙으로 막는다)
  const isOwner = user !== null && detail.user_id === user.id;
  const { count, total } = summarizeActive(detail.transactions);
  const cancelledCount = detail.transactions.length - count;
  const modal = confirm ? describe(confirm) : null;

  return (
    <section>
      <Link to="/categories" className="back-link">
        ← 카테고리 목록
      </Link>

      <header className="detail-header">
        <div className="detail-title">
          <span className="category-dot category-dot--lg" style={{ background: detail.color ?? '#9aa0a6' }} aria-hidden="true" />
          <h1>{detail.name}</h1>
          <span className={archived ? 'badge badge--archived' : 'badge badge--active'}>{archived ? '보관됨' : '사용 중'}</span>
        </div>
        {isOwner && (
          <button
            type="button"
            className={archived ? 'secondary-button' : 'danger-button'}
            onClick={() => setConfirm({ kind: archived ? 'unarchive' : 'archive' })}
            disabled={busy}
          >
            {archived ? '보관 해제' : '보관하기'}
          </button>
        )}
      </header>

      <dl className="summary-grid">
        <div>
          <dt>정상 거래</dt>
          <dd>{count}건</dd>
        </div>
        <div>
          <dt>합계</dt>
          <dd>{formatAmount(total)}</dd>
        </div>
        <div>
          <dt>취소</dt>
          <dd>{cancelledCount}건</dd>
        </div>
      </dl>

      {archived && (
        <p className="notice" role="note">
          보관된 카테고리예요. 거래를 취소하거나 복구하려면 먼저 보관을 해제해 주세요.
        </p>
      )}

      {detail.transactions.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">이 카테고리에는 아직 거래가 없습니다.</p>
        </div>
      ) : (
        <ul className="transaction-list">
          {detail.transactions.map((transaction) => {
            const cancelled = transaction.status === 'CANCELLED';
            return (
              <li key={transaction.id} className={cancelled ? 'card card--cancelled' : 'card'}>
                <div className="card-main">
                  <strong className="merchant">{transaction.merchant_name}</strong>
                  <div className="meta">
                    <span>{formatDate(transaction.transaction_date)}</span>
                    <span>{transaction.source_bank}</span>
                  </div>
                </div>
                <div className="card-side">
                  <span className="amount">{formatAmount(transaction.amount)}</span>
                  {cancelled && <span className="badge badge--cancelled">취소됨</span>}
                  {isOwner && (
                    <button
                      type="button"
                      className={cancelled ? 'secondary-button secondary-button--small' : 'danger-button danger-button--small'}
                      disabled={archived || busy}
                      title={archived ? '보관된 카테고리의 거래는 변경할 수 없습니다.' : undefined}
                      aria-label={`${transaction.merchant_name} ${cancelled ? '취소 복구' : '거래 취소'}`}
                      onClick={() => setConfirm({ kind: cancelled ? 'restore' : 'cancel', transaction })}
                    >
                      {cancelled ? '취소 복구' : '취소'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <ConfirmModal
          open
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          busy={busy}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
