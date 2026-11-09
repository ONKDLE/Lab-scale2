import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCategories } from '../api/categories';
import ErrorState from '../components/ErrorState';
import { formatAmount } from '../lib/format';
import type { CategorySummary } from '../types/category';

/** 카테고리 목록. 카드를 누르면 상세 화면으로 이동한다. */
export default function CategoryListPage() {
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCategories(null);
    setError(null);
    getCategories(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setCategories(list);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      });
    return () => controller.abort();
  }, [reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  if (categories === null) {
    return (
      <div aria-busy="true">
        <p role="status" className="visually-hidden">
          카테고리를 불러오는 중입니다…
        </p>
        <ul className="category-grid" data-testid="category-skeleton">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="category-card category-card--skeleton" aria-hidden="true">
              <span className="skeleton-line skeleton-line--title" />
              <span className="skeleton-line skeleton-line--meta" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">아직 카테고리가 없습니다.</p>
        <p className="empty-hint">카테고리를 만들면 여기에 모여서 보여요.</p>
      </div>
    );
  }

  // 사용 중인 카테고리를 먼저, 보관된 것은 뒤로. (같은 그룹 안에서는 원래 순서 유지)
  const ordered = [...categories].sort(
    (a, b) => Number(a.status === 'ARCHIVED') - Number(b.status === 'ARCHIVED'),
  );
  const archivedCount = categories.filter((category) => category.status === 'ARCHIVED').length;

  return (
    <section>
      <div className="page-header">
        <h1>카테고리</h1>
        <p>
          총 {categories.length}개{archivedCount > 0 && ` (보관 ${archivedCount}개)`}
        </p>
      </div>
      <ul className="category-grid">
        {ordered.map((category) => {
          const archived = category.status === 'ARCHIVED';
          return (
            <li key={category.id}>
              <Link
                to={`/categories/${category.id}`}
                className={archived ? 'category-card category-card--archived' : 'category-card'}
              >
                <span className="category-card-head">
                  <span
                    className="category-dot category-dot--lg"
                    style={{ background: category.color ?? '#9aa0a6' }}
                    aria-hidden="true"
                  />
                  <strong>{category.name}</strong>
                  {archived && <span className="badge badge--archived">보관됨</span>}
                </span>
                <span className="category-card-meta">
                  거래 {category.transaction_count}건 · {formatAmount(category.total_amount)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
