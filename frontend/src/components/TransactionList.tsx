import { Link } from 'react-router-dom';
import { formatAmount, formatDate } from '../lib/format';
import type { Category } from '../types/category';
import type { Transaction } from '../types/transaction';

interface Props {
  items: Transaction[];
  categories: Map<number, Category>;
}

/** 거래 카드 목록 */
export default function TransactionList({ items, categories }: Props) {
  return (
    <ul className="transaction-list">
      {items.map((transaction) => {
        const category =
          transaction.category_id !== null ? categories.get(transaction.category_id) : undefined;
        const cancelled = transaction.status === 'CANCELLED';

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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
