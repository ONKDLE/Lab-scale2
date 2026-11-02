"""
카드사 이용내역 엑셀(.xls) 읽기.

샘플로 확인한 형식 (체크카드 이용내역):
  이용일시 | 이용카드명 | ... | 이용하신곳 | 이용금액 | 결제방법 | ... | 상태 | ...
  "2026-10-30\\n08:20" | V160 | ... | APPLE | 4400 | 일시불 | ... | 전표매입 | ...

- 머리글 칸이 합쳐져 있어서 열 번호가 아니라 '머리글 이름'으로 열을 찾는다.
- 머리글 위에 제목 줄이 있어도 머리글 줄을 직접 찾는다.
- 한 줄이 이상해도 전체를 실패시키지 않고, 그 줄만 건너뛰고 이유를 알려준다.
"""
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, List, Sequence

import xlrd

# 이름(공백·줄바꿈 제거 후)으로 열을 찾는다.
HEADER_DATETIME = "이용일시"
HEADER_MERCHANT = "이용하신곳"
HEADER_AMOUNT = "이용금액"
HEADER_STATUS = "상태"
HEADER_PAYMENT = "결제방법"
HEADER_CARD = "이용카드명"
REQUIRED_HEADERS = (HEADER_DATETIME, HEADER_MERCHANT, HEADER_AMOUNT)

MAX_MERCHANT_LENGTH = 100  # DB 컬럼 길이

_DATETIME_PATTERN = re.compile(
    r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?"
)


class StatementFormatError(ValueError):
    """파일을 읽을 수 없거나, 예상한 이용내역 형식이 아닐 때."""


@dataclass
class ParsedRow:
    row_number: int            # 엑셀에서 보이는 줄 번호 (1부터)
    transaction_date: date
    transaction_time: str      # "08:20" (시간이 없으면 "")
    merchant_name: str
    amount: Decimal
    status: str                # ACTIVE | CANCELLED
    raw_status: str            # 파일에 적힌 원래 상태 글자 (예: 전표매입)
    payment_method: str
    card_name: str


@dataclass
class RowError:
    row_number: int
    reason: str


@dataclass
class ParseResult:
    rows: List[ParsedRow] = field(default_factory=list)
    errors: List[RowError] = field(default_factory=list)


def _normalize(value: Any) -> str:
    """머리글 비교용: 공백, 줄바꿈을 모두 없앤다. (' 이용\\n카드명' -> '이용카드명')"""
    return re.sub(r"\s+", "", str(value)) if value is not None else ""


def _is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def read_xls_rows(content: bytes) -> tuple[List[List[Any]], int]:
    """엑셀(.xls) 파일의 첫 번째 시트를 줄 단위 목록으로 읽는다. (rows, datemode)"""
    try:
        book = xlrd.open_workbook(file_contents=content)
    except Exception as error:  # xlrd는 여러 종류의 예외를 던진다
        raise StatementFormatError("엑셀 파일을 읽을 수 없습니다. 카드사에서 받은 .xls 파일이 맞는지 확인해 주세요.") from error
    if book.nsheets == 0:
        raise StatementFormatError("엑셀 파일에 시트가 없습니다.")
    sheet = book.sheet_by_index(0)
    rows = [sheet.row_values(index) for index in range(sheet.nrows)]
    return rows, book.datemode


def _find_header(rows: Sequence[Sequence[Any]]) -> tuple[int, dict[str, int]]:
    for index, row in enumerate(rows):
        positions: dict[str, int] = {}
        for column, value in enumerate(row):
            name = _normalize(value)
            if name and name not in positions:
                positions[name] = column
        if all(header in positions for header in REQUIRED_HEADERS):
            return index, positions
    raise StatementFormatError(
        "이용내역 형식을 찾지 못했습니다. '이용일시', '이용하신곳', '이용금액' 열이 있는 파일을 올려 주세요."
    )


def _parse_datetime(value: Any, datemode: int) -> tuple[date, str]:
    if isinstance(value, float):  # 엑셀 날짜 칸
        try:
            parsed = xlrd.xldate_as_datetime(value, datemode)
        except Exception as error:
            raise ValueError(f"날짜를 읽을 수 없습니다. ({value})") from error
        return parsed.date(), parsed.strftime("%H:%M")

    match = _DATETIME_PATTERN.match(str(value).strip())
    if not match:
        raise ValueError(f"날짜를 읽을 수 없습니다. ({str(value).strip()!r})")
    year, month, day, hour, minute = match.groups()
    try:
        parsed_date = date(int(year), int(month), int(day))
    except ValueError as error:
        raise ValueError(f"존재하지 않는 날짜입니다. ({str(value).strip()!r})") from error
    time_text = f"{int(hour):02d}:{minute}" if hour is not None else ""
    return parsed_date, time_text


def _parse_amount(value: Any) -> Decimal:
    if isinstance(value, (int, float)):
        text = repr(value) if isinstance(value, float) else str(value)
    else:
        text = re.sub(r"[,\s원]", "", str(value))
    try:
        amount = Decimal(text)
    except InvalidOperation as error:
        raise ValueError(f"금액을 읽을 수 없습니다. ({str(value).strip()!r})") from error
    if not amount.is_finite():
        raise ValueError(f"금액을 읽을 수 없습니다. ({str(value).strip()!r})")
    if amount <= 0:
        raise ValueError(f"금액이 0 이하입니다. ({amount}) 취소 내역 형식은 아직 지원하지 않습니다.")
    return amount.quantize(Decimal("0.01"))


def parse_rows(rows: Sequence[Sequence[Any]], datemode: int = 0) -> ParseResult:
    """줄 목록에서 머리글을 찾고, 그 아래 거래 줄을 읽는다."""
    header_index, columns = _find_header(rows)

    def cell(row: Sequence[Any], header: str) -> Any:
        column = columns.get(header)
        if column is None or column >= len(row):
            return None
        return row[column]

    result = ParseResult()
    for index in range(header_index + 1, len(rows)):
        row = rows[index]
        if all(_is_blank(value) for value in row):
            continue  # 빈 줄은 거래가 아니므로 세지 않는다
        row_number = index + 1

        try:
            transaction_date, transaction_time = _parse_datetime(cell(row, HEADER_DATETIME), datemode)

            merchant = str(cell(row, HEADER_MERCHANT) or "").strip()
            if not merchant:
                raise ValueError("이용하신곳(가맹점명)이 비어 있습니다.")

            amount = _parse_amount(cell(row, HEADER_AMOUNT))
        except ValueError as error:
            result.errors.append(RowError(row_number=row_number, reason=str(error)))
            continue

        raw_status = str(cell(row, HEADER_STATUS) or "").strip()
        result.rows.append(
            ParsedRow(
                row_number=row_number,
                transaction_date=transaction_date,
                transaction_time=transaction_time,
                merchant_name=merchant[:MAX_MERCHANT_LENGTH],
                amount=amount,
                # '취소'라는 글자가 들어 있으면 취소 거래로 본다. (그 외는 정상)
                status="CANCELLED" if "취소" in raw_status else "ACTIVE",
                raw_status=raw_status,
                payment_method=str(cell(row, HEADER_PAYMENT) or "").strip(),
                card_name=str(cell(row, HEADER_CARD) or "").strip(),
            )
        )
    return result


def parse_card_statement_xls(content: bytes) -> ParseResult:
    rows, datemode = read_xls_rows(content)
    return parse_rows(rows, datemode)
