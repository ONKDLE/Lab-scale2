import { apiUpload } from './client';
import type { ImportSummary } from '../types/import';

export function importTransactions(file: File, sourceBank: string): Promise<ImportSummary> {
  return apiUpload<ImportSummary>('/transactions/import', file, { source_bank: sourceBank });
}
