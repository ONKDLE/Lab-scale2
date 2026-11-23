import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getMonthlyStats } from '../api/stats';
import { getMonthlyBudget, setMonthlyBudget } from '../api/budget';
import type { MonthlyStats } from '../types/stats';
import type { BudgetSummary } from '../types/budget';
import ErrorState from '../components/ErrorState';
import { useToast } from '../components/Toast';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(month: string, delta: number): string {
  const [year, monthNo] = month.split('-').map(Number);
  const date = new Date(year, monthNo - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: string | number): string {
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

function monthLabel(month: string): string {
  const [year, monthNo] = month.split('-');
  return `${year}년 ${Number(monthNo)}월`;
}

export default function StatsPage() {
  const [month, setMonth] = useState<string>(currentMonth);
  const [data, setData] = useState<MonthlyStats | null>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const toast = useToast();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([getMonthlyStats(month, controller.signal), getMonthlyBudget(month, controller.signal)])
      .then(([stats, budgetResult]) => {
        setData(stats);
        setBudget(budgetResult);
        setBudgetInput(budgetResult.limit_amount === '0.00' ? '' : String(Number(budgetResult.limit_amount)));
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught : new Error('통계를 불러오지 못했습니다.'));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [month]);

  const saveBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (budgetSaving) return;
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('예산은 0 이상의 숫자로 입력해 주세요.');
      return;
    }
    setBudgetSaving(true);
    try {
      const result = await setMonthlyBudget(month, String(amount));
      setBudget(result);
      toast.success(`${monthLabel(month)} 예산을 저장했습니다.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '예산을 저장하지 못했습니다.');
    } finally {
      setBudgetSaving(false);
    }
  };

  const previous = data?.previous?.total_expense ?? '0';
  const current = data?.current?.total_expense ?? '0';
  const currentIncome = data?.current?.total_income ?? '0';
  const currentNet = data?.current?.net_amount ?? '0';
  const difference = Number(current) - Number(previous);
  const changeText = difference === 0 ? '전월과 동일' : `${difference > 0 ? '+' : ''}${money(difference)}원`;

  const maxTrend = useMemo(() => Math.max(...(data?.trend?.map((item) => Number(item.total_expense)) ?? []), 1), [data]);

  if (error) return <ErrorState message={error.message} onRetry={() => setMonth(month)} />;

  return (
    <section>
      <header className="page-header--with-action">
        <div>
          <h1>월별 통계 · 대시보드</h1>
          <p>정상 거래를 기준으로 수입, 지출, 카테고리, 예산을 한눈에 확인합니다.</p>
        </div>
        <input className="month-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="통계 조회 월" />
      </header>

      {loading || !data || !budget ? <div className="empty-state">통계를 불러오는 중...</div> : (
        <>
          <section className="summary-grid stats-summary">
            <div><dt>{monthLabel(month)} 수입</dt><dd>{money(currentIncome)}원</dd></div>
            <div><dt>{monthLabel(month)} 지출</dt><dd>{money(current)}원</dd></div>
            <div><dt>이번 달 순수입</dt><dd>{money(currentNet)}원</dd></div>
            <div><dt>전월 지출</dt><dd>{money(previous)}원</dd></div>
            <div><dt>전월 대비</dt><dd className={difference > 0 ? 'stats-up' : difference < 0 ? 'stats-down' : ''}>{changeText}</dd></div>
          </section>

          <section className="stats-section budget-dashboard">
            <div className="stats-section-head"><h2>월 예산</h2><span>{monthLabel(month)}</span></div>
            <form className="budget-form" onSubmit={saveBudget}>
              <div className="field">
                <label htmlFor="monthly-budget">예산 금액</label>
                <input id="monthly-budget" type="number" min="0" step="1000" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="예: 500000" />
              </div>
              <button type="submit" className="primary-button" disabled={budgetSaving}>{budgetSaving ? '저장 중...' : '예산 저장'}</button>
            </form>
            <div className="budget-status">
              <div><span>현재 지출</span><strong>{money(budget.total_expense)}원</strong></div>
              <div><span>설정 예산</span><strong>{budget.limit_amount === '0.00' ? '미설정' : `${money(budget.limit_amount)}원`}</strong></div>
              <div><span>사용률</span><strong>{budget.limit_amount === '0.00' ? '-' : `${budget.usage_rate.toFixed(1)}%`}</strong></div>
              <div><span>남은 금액</span><strong>{budget.limit_amount === '0.00' ? '-' : `${money(budget.remaining_amount)}원`}</strong></div>
            </div>
            {budget.status === 'WARNING' && <p className="budget-alert budget-alert--warning">⚠️ 예산의 80% 이상을 사용했습니다.</p>}
            {budget.status === 'OVER' && <p className="budget-alert budget-alert--danger">🚨 월 예산을 초과했습니다.</p>}
            {budget.status === 'NORMAL' && <p className="budget-alert">예산 범위 안에서 지출하고 있습니다.</p>}
            {budget.status === 'NO_BUDGET' && <p className="budget-alert">월 예산을 설정하면 사용률과 초과 여부를 확인할 수 있습니다.</p>}
          </section>

          <section className="stats-section">
            <div className="stats-section-head"><h2>카테고리별 지출</h2><span>{data.current.transaction_count}건</span></div>
            {data.current.categories.length === 0 ? <div className="empty-state">이 달에는 지출 내역이 없습니다.</div> : (
              <div className="stats-category-list">
                {data.current.categories.map((category) => (
                  <div className="stats-category-row" key={category.category_id ?? 'uncategorized'}>
                    <div className="stats-category-name"><span className="category-dot category-dot--lg" style={{ backgroundColor: category.color ?? '#9ca3af' }} /><span>{category.category_name}</span></div>
                    <div className="stats-category-bar-wrap"><div className="stats-category-bar" style={{ width: `${Math.max(category.ratio, category.amount !== '0' ? 2 : 0)}%` }} /></div>
                    <div className="stats-category-value"><strong>{money(category.amount)}원</strong><span>{category.ratio.toFixed(1)}%</span></div>
                  </div>
                ))}
              </div>
            )}
            {data.current.top_category_name && <p className="stats-highlight">가장 많이 지출한 카테고리: <strong>{data.current.top_category_name}</strong></p>}
          </section>

          <section className="stats-section">
            <div className="stats-section-head"><h2>최근 6개월 지출 추이</h2></div>
            <div className="trend-chart">
              {data.trend.map((item) => {
                const expense = Number(item.total_expense);
                const barHeight = expense === 0 ? 0 : Math.max((expense / maxTrend) * 100, 4);
                return <div className="trend-item" key={item.month}>
                  <div className="trend-bar-wrap"><div className="trend-bar" style={{ height: `${barHeight}%` }} title={`${monthLabel(item.month)} ${money(item.total_expense)}원`} /></div>
                  <strong>{Number(item.month.slice(5))}월</strong>
                  <span>수입 {money(item.total_income)}원 · 지출 {money(item.total_expense)}원</span>
                </div>;
              })}
            </div>
          </section>

          <div className="stats-month-nav">
            <button className="secondary-button" type="button" onClick={() => setMonth(addMonths(month, -1))}>이전 달</button>
            <button className="secondary-button" type="button" onClick={() => setMonth(currentMonth())}>이번 달</button>
            <button className="secondary-button" type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= currentMonth()}>다음 달</button>
          </div>
        </>
      )}
    </section>
  );
}
