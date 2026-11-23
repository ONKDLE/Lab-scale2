import { ChangeEvent, FormEvent, useState } from 'react';
import { importTransactions } from '../api/importer';
import { useToast } from '../components/Toast';
import type { ImportSummary } from '../types/import';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceBank, setSourceBank] = useState('KB국민카드');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setSummary(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!file || busy) return;

    if (!file.name.toLowerCase().endsWith('.xls')) {
      toast.error('카드 이용내역 .xls 파일만 업로드할 수 있습니다.');
      return;
    }

    setBusy(true);

    try {
      const result = await importTransactions(file, sourceBank.trim());
      setSummary(result);
      toast.success(`${result.imported}건을 새로 불러왔습니다.`);
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : '파일을 불러오지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <h1>파일 불러오기</h1>
        <p>
          카드사에서 받은 이용내역 .xls 파일을 등록합니다.
          KB국민카드 다운로드 형식을 지원합니다.
        </p>
      </header>

      <form className="import-card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="source-bank">거래 출처</label>
          <input
            id="source-bank"
            value={sourceBank}
            onChange={(event) => setSourceBank(event.target.value)}
            maxLength={30}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="statement-file">이용내역 파일</label>
          <input
            id="statement-file"
            type="file"
            accept=".xls,application/vnd.ms-excel"
            onChange={handleFile}
            required
          />
          <span className="field-hint">최대 5MB · .xls 형식</span>
        </div>

        {file && (
          <p className="file-name">
            선택한 파일: {file.name}
          </p>
        )}

        <button
          type="submit"
          className="primary-button"
          disabled={!file || busy}
        >
          {busy ? '불러오는 중...' : '파일 불러오기'}
        </button>
      </form>

      {summary && (
        <section className="import-result" aria-live="polite">
          <h2>업로드 결과</h2>

          <dl className="summary-grid">
            <div>
              <dt>전체</dt>
              <dd>{summary.total_rows}건</dd>
            </div>

            <div>
              <dt>새로 등록</dt>
              <dd>{summary.imported}건</dd>
            </div>

            <div>
              <dt>중복 제외</dt>
              <dd>{summary.duplicates}건</dd>
            </div>

            <div>
              <dt>자동 분류</dt>
              <dd>{summary.auto_classified}건</dd>
            </div>

            <div>
              <dt>미분류</dt>
              <dd>{summary.unclassified}건</dd>
            </div>
          </dl>

          <p className="summary">
            형식 오류로 건너뜀: {summary.skipped}건 · 자동 분류 {summary.auto_classified}건 · 미분류 {summary.unclassified}건
          </p>

          {summary.errors.length > 0 && (
            <details>
              <summary>
                건너뛴 항목 확인 ({summary.errors.length}건)
              </summary>

              <ul className="import-error-list">
                {summary.errors.map((error) => (
                  <li key={`${error.row_number}-${error.reason}`}>
                    {error.row_number}행 · {error.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </section>
  );
}