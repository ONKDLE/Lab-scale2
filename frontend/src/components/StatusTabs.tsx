import type { TransactionStatus } from '../types/transaction';

const TABS: { value: TransactionStatus | undefined; label: string }[] = [
  { value: undefined, label: '전체' },
  { value: 'ACTIVE', label: '정상' },
  { value: 'CANCELLED', label: '취소' },
];

interface Props {
  value: TransactionStatus | undefined;
  onChange: (status: TransactionStatus | undefined) => void;
}

/** 상태 필터 탭 (전체 / 정상 / 취소) */
export default function StatusTabs({ value, onChange }: Props) {
  return (
    <div className="status-tabs" role="tablist" aria-label="거래 상태 필터">
      {TABS.map((tab) => (
        <button
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={tab.value === value ? 'tab tab--active' : 'tab'}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
