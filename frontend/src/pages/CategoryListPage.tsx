import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCategory, getCategories } from '../api/categories';
import ErrorState from '../components/ErrorState';
import CategoryForm from '../components/CategoryForm';
import { useToast } from '../components/Toast';
import { formatAmount } from '../lib/format';
import type { CategoryInput } from '../api/categories';
import type { CategorySummary } from '../types/category';

export default function CategoryListPage() {
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

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

  const handleCreate = async (value: CategoryInput) => {
    if (busy) return;
    setBusy(true);
    try {
      await createCategory(value);
      toast.success('카테고리를 만들었습니다.');
      setShowCreate(false);
      reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '카테고리를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  if (categories === null) {
    return (
      <div aria-busy="true">
        <p role="status" className="visually-hidden">카테고리를 불러오는 중입니다…</p>
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

  const ordered = [...categories].sort(
    (a, b) => Number(a.status === 'ARCHIVED') - Number(b.status === 'ARCHIVED'),
  );
  const archivedCount = categories.filter((category) => category.status === 'ARCHIVED').length;

  return (
    <section>
      <div className="page-header page-header--with-action">
        <div>
          <h1>카테고리</h1>
          <p>
            총 {categories.length}개{archivedCount > 0 && ` (보관 ${archivedCount}개)`}
          </p>
        </div>
        <button type="button" className="primary-button" onClick={() => setShowCreate(true)}>
          + 카테고리 만들기
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">아직 카테고리가 없습니다.</p>
          <p className="empty-hint">카테고리를 만들어 거래를 분류해 보세요.</p>
          <button type="button" className="primary-button" onClick={() => setShowCreate(true)}>
            첫 카테고리 만들기
          </button>
        </div>
      ) : (
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
                    {category.icon && <span aria-hidden="true">{category.icon}</span>}
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
      )}

      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-category-title">
            <h2 id="create-category-title" className="modal-title">카테고리 만들기</h2>
            <CategoryForm submitLabel="만들기" busy={busy} onSubmit={handleCreate} onCancel={() => !busy && setShowCreate(false)} />
          </div>
        </div>
      )}
    </section>
  );
}
