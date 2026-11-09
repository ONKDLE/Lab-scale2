// 백엔드 응답(schemas.py의 TransactionOut / TransactionPage)과 모양을 맞춘 타입.
// amount는 백엔드가 소수 정확도를 지키려고 문자열("4500.00")로 내려준다.

export type TransactionStatus = 'ACTIVE' | 'CANCELLED';

export interface Transaction {
  id: number;
  user_id: number;
  category_id: number | null;
  merchant_name: string;
  amount: string;
  transaction_date: string; // "YYYY-MM-DD"
  source_bank: string;
  status: TransactionStatus;
}

export interface TransactionPage {
  items: Transaction[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
  has_next: boolean;
}
