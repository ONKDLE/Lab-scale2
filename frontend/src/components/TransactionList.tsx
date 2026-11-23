import { Link } from 'react-router-dom';
import { formatAmount, formatDate } from '../lib/format';
import type { Category } from '../types/category';
import type { Transaction } from '../types/transaction';

interface Props {
  items: Transaction[];
  categories: Map<number, Category>;
  onCategoryChange?: (transaction: Transaction, categoryId: number | null) => void;
  changingId?: number | null;
}

export default function TransactionList({ items, categories, onCategoryChange, changingId }: Props) {
  const activeCategories = [...categories.values()].filter((category) => category.status === 'ACTIVE');

  return (
    <ul className="transaction-list">
      {items.map((transaction) => {
        const category =
          transaction.category_id !== null ? categories.get(transaction.category_id) : undefined;
        const cancelled = transaction.status === 'CANCELLED';
        const changing = changingId === transaction.id;

        return (
          <li key={transaction.id} className={cancelled ? 'card card--cancelled' : 'card'}>
            <div className="card-main">
              <strong className="merchant">{transaction.merchant_name}</strong>
              <div className="meta">
                <span>{formatDate(transaction.transaction_date)}</span>
                <span>{transaction.source_bank}</span>
                {category && (
                  <Link className="category-chip" to={`/categories/${category.id}`}>
                    <span
                      className="category-dot"
                      style={{ background: category.color ?? '#9aa0a6' }}
                      aria-hidden="true"
                    />
                    {category.name}
                  </Link>
                )}
              </div>
            </div>
            <div className="card-side">
              <span className="amount">{formatAmount(transaction.amount)}</span>
              {cancelled && <span className="badge badge--cancelled">취소됨</span>}
              {onCategoryChange && (
                <label className="category-select-label">
                  <span className="visually-hidden">카테고리 변경</span>
                  <select
                    value={transaction.category_id ?? ''}
                    disabled={changing}
                    onChange={(event) =>
                      onCategoryChange(
                        transaction,
                        event.target.value === '' ? null : Number(event.target.value),
                      )
                    }
                  >
                    <option value="">미분류</option>
                    {activeCategories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.icon ? `${item.icon} ` : ''}{item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
