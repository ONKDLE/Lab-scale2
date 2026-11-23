export interface ImportRowError {
  row_number: number;
  reason: string;
}

export interface ImportSummary {
  source_bank: string;
  total_rows: number;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: ImportRowError[];
  auto_classified: number;
  unclassified: number;
}
