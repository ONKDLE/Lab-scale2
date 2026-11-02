"""
카드 이용내역 파일 업로드 API.

POST /transactions/import  (파일 + source_bank)
 - 카드사에서 받은 이용내역 엑셀(.xls)을 읽어서 거래로 저장한다.
 - 이미 저장된 거래는 건너뛴다 (같은 파일을 두 번 올려도 중복 저장되지 않음).
 - 줄 하나가 이상해도 전체가 실패하지 않고, 건너뛴 줄과 이유를 결과에 담아 준다.
 - 카테고리는 비워 둔다(미분류). 자동 분류는 다음 단계에서 붙인다.
"""
import hashlib
from typing import Iterable, List, Set

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user_id
from app.importers.card_statement import ParsedRow, StatementFormatError, parse_card_statement_xls

router = APIRouter(prefix="/transactions", tags=["import"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB
DEFAULT_SOURCE = "체크카드"
MAX_SOURCE_LENGTH = 30  # DB 컬럼 길이
_QUERY_CHUNK = 500  # 한 번에 조회할 해시 개수 (SQLite 변수 개수 제한 대비)


def _import_hash(user_id: int, row: ParsedRow, source: str) -> str:
    """같은 거래인지 판별하는 기준값. 거래 '시각'까지 넣어서, 같은 날 같은 가게에서
    같은 금액을 두 번 결제한 경우도 서로 다른 거래로 본다."""
    raw = (
        f"{user_id}|{row.transaction_date.isoformat()} {row.transaction_time}"
        f"|{row.amount}|{row.merchant_name}|{source}"
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _chunks(items: List[str], size: int) -> Iterable[List[str]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


@router.post("/import", response_model=schemas.ImportSummary)
def import_card_statement(
    file: UploadFile = File(..., description="카드사에서 받은 이용내역 엑셀(.xls)"),
    source_bank: str = Form(DEFAULT_SOURCE, description="거래 출처 이름 (예: 체크카드, 우리카드)"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    source = source_bank.strip()
    if not 1 <= len(source) <= MAX_SOURCE_LENGTH:
        raise _bad_request(f"source_bank는 1~{MAX_SOURCE_LENGTH}자여야 합니다.")

    filename = (file.filename or "").lower()
    if not filename.endswith(".xls"):
        raise _bad_request("지원하지 않는 파일 형식입니다. 카드사에서 받은 이용내역 엑셀(.xls) 파일을 올려 주세요.")

    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"파일이 너무 큽니다. {MAX_UPLOAD_BYTES // (1024 * 1024)}MB 이하만 올릴 수 있습니다.",
        )
    if not content:
        raise _bad_request("빈 파일입니다.")

    try:
        parsed = parse_card_statement_xls(content)
    except StatementFormatError as error:
        raise _bad_request(str(error))

    # 1) 이번 파일 안에서 같은 거래가 겹치는지, 2) 이미 DB에 있는지 확인
    hashed = [(row, _import_hash(current_user_id, row, source)) for row in parsed.rows]
    existing: Set[str] = set()
    all_hashes = [hash_value for _, hash_value in hashed]
    for chunk in _chunks(all_hashes, _QUERY_CHUNK):
        existing.update(
            value
            for (value,) in db.query(models.Transaction.raw_row_hash).filter(
                models.Transaction.raw_row_hash.in_(chunk)
            )
        )

    new_transactions: List[models.Transaction] = []
    seen: Set[str] = set()
    duplicates = 0
    for row, hash_value in hashed:
        if hash_value in existing or hash_value in seen:
            duplicates += 1
            continue
        seen.add(hash_value)
        new_transactions.append(
            models.Transaction(
                user_id=current_user_id,
                category_id=None,
                merchant_name=row.merchant_name,
                amount=row.amount,
                transaction_date=row.transaction_date,
                source_bank=source,
                raw_row_hash=hash_value,
                status=row.status,
            )
        )

    try:
        db.add_all(new_transactions)
        db.commit()
    except IntegrityError:
        # 같은 파일을 동시에 두 번 올려서 거의 같은 순간에 저장이 겹친 경우
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="같은 내역이 동시에 저장되고 있습니다. 잠시 후 다시 시도해 주세요.",
        )

    return schemas.ImportSummary(
        source_bank=source,
        total_rows=len(parsed.rows) + len(parsed.errors),
        imported=len(new_transactions),
        duplicates=duplicates,
        skipped=len(parsed.errors),
        errors=[schemas.ImportRowError(row_number=e.row_number, reason=e.reason) for e in parsed.errors],
    )
