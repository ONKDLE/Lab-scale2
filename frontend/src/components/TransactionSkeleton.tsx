interface Props {
  count?: number;
}

/** 불러오는 동안 보여주는 뼈대 화면(Skeleton UI) */
export default function TransactionSkeleton({ count = 10 }: Props) {
  return (
    <div aria-busy="true">
      <p role="status" className="visually-hidden">
        거래 내역을 불러오는 중입니다…
      </p>
      <ul className="transaction-list" data-testid="skeleton-list">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="card card--skeleton" aria-hidden="true">
            <div className="card-main">
              <span className="skeleton-line skeleton-line--title" />
              <span className="skeleton-line skeleton-line--meta" />
            </div>
            <span className="skeleton-line skeleton-line--amount" />
          </li>
        ))}
      </ul>
    </div>
  );
}
