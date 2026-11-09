import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import SearchBar from '../components/SearchBar';
import StatusTabs from '../components/StatusTabs';
import TransactionList from '../components/TransactionList';
import TransactionSkeleton from '../components/TransactionSkeleton';
import { useCategoryMap } from '../hooks/useCategoryMap';
import { useTransactionList } from '../hooks/useTransactionList';
import { parseListState, toSearchParams, type ListState } from '../lib/listParams';

const PAGE_SIZE = 10;

/**
 * 거래 목록 화면.
 * 화면 상태(페이지, 상태 탭, 검색어)는 전부 주소창 쿼리스트링이 "정답"이다.
 *   예) /?page=2&status=ACTIVE&keyword=스타벅스
 * 그래서 새로고침, 뒤로가기, 주소 공유를 해도 같은 화면이 다시 나온다.
 */
export default function TransactionListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, status, keyword } = parseListState(searchParams);

  const { data, loading, error, reload } = useTransactionList({
    page,
    size: PAGE_SIZE,
    status,
    keyword: keyword || undefined,
  });
  const categories = useCategoryMap();

  const goTo = (next: ListState, replace = false) =>
    setSearchParams(toSearchParams(next), { replace });

  // 상태 탭이나 검색어를 바꾸면 항상 1페이지부터 다시 본다.
  const handleStatusChange = (nextStatus: ListState['status']) =>
    goTo({ page: 1, status: nextStatus, keyword });
  const handleSearch = (nextKeyword: string) => goTo({ page: 1, status, keyword: nextKeyword });
  const handlePageChange = (nextPage: number) => goTo({ page: nextPage, status, keyword });
  const handleReset = () => goTo({ page: 1, status: undefined, keyword: '' });

  // 주소창에 마지막 페이지보다 큰 번호(?page=99)를 직접 넣었다면 마지막 페이지로 맞춘다.
  const lastPage = data?.total_pages ?? 0;
  const outOfRange = !loading && lastPage > 0 && page > lastPage;
  useEffect(() => {
    if (outOfRange) goTo({ page: lastPage, status, keyword }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, lastPage, status, keyword]);

  const filtered = status !== undefined || keyword !== '';

  let content;
  if (error) {
    content = <ErrorState message={error.message} onRetry={reload} />;
  } else if (loading || outOfRange || !data) {
    content = <TransactionSkeleton count={PAGE_SIZE} />;
  } else if (data.items.length === 0) {
    content = <EmptyState filtered={filtered} onReset={handleReset} />;
  } else {
    content = (
      <>
        <p className="summary">
          총 {data.total_elements}건 · {page} / {data.total_pages} 페이지
        </p>
        <TransactionList items={data.items} categories={categories} />
        <Pagination
          page={page}
          totalPages={data.total_pages}
          hasNext={data.has_next}
          onChange={handlePageChange}
        />
      </>
    );
  }

  return (
    <section>
      <header className="page-header">
        <h1>거래 내역</h1>
      </header>

      <section className="controls">
        <SearchBar keyword={keyword} onSearch={handleSearch} />
        <StatusTabs value={status} onChange={handleStatusChange} />
      </section>

      {content}
    </section>
  );
}
