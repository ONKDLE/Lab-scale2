"""
비밀번호 암호화(bcrypt)와 로그인 토큰(JWT).

- 비밀번호는 원문을 저장하지 않고 bcrypt로 암호화한 값만 저장한다. (PRD: bcrypt, salt rounds 10 이상)
- 로그인하면 JWT 토큰을 발급하고, 이후 요청은 이 토큰으로 "누구인지"를 확인한다.
- 설정은 환경변수로 바꿀 수 있다.
    SECRET_KEY                   토큰 서명 비밀키 (실제로 배포할 때는 반드시 바꿀 것)
    ACCESS_TOKEN_EXPIRE_MINUTES  토큰 유효 시간(분), 기본 480(8시간)
    BCRYPT_ROUNDS                암호화 강도, 기본 12 (테스트에서만 낮춰 쓴다)
"""
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

DEFAULT_BCRYPT_ROUNDS = 12
DEFAULT_EXPIRE_MINUTES = 480
ALGORITHM = "HS256"
MAX_PASSWORD_BYTES = 72  # bcrypt가 처리할 수 있는 최대 길이 (넘는 부분은 무시되므로 아예 막는다)
MIN_PASSWORD_LENGTH = 8
MAX_EMAIL_LENGTH = 255

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_dummy_hash: Optional[str] = None


def _secret_key() -> str:
    return os.getenv("SECRET_KEY", "dev-only-secret-key-change-me-in-production")


def _rounds() -> int:
    return int(os.getenv("BCRYPT_ROUNDS", DEFAULT_BCRYPT_ROUNDS))


def _expire_minutes() -> int:
    return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", DEFAULT_EXPIRE_MINUTES))


# ---------------------------------------------------------------- 입력 검사
def normalize_email(email: str) -> str:
    """앞뒤 공백을 지우고 소문자로 바꿔서, 대소문자만 다른 이메일을 같은 계정으로 본다."""
    return email.strip().lower()


def email_problem(email: str) -> Optional[str]:
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL_PATTERN.match(email):
        return "이메일 형식이 올바르지 않습니다."
    return None


def password_problem(password: str) -> Optional[str]:
    """규칙에 맞지 않으면 이유를, 괜찮으면 None을 돌려준다."""
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return f"비밀번호는 {MAX_PASSWORD_BYTES}바이트(영문 기준 {MAX_PASSWORD_BYTES}자) 이하여야 합니다."
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "비밀번호에는 영문과 숫자가 모두 들어 있어야 합니다."
    return None


# ---------------------------------------------------------------- 비밀번호
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=_rounds())).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # 형식이 이상한 저장값(예: 예전 임시 값)이거나 비밀번호가 너무 길면 "불일치"로 처리
        return False


def burn_password_check(password: str) -> None:
    """없는 이메일로 로그인할 때도 있는 이메일과 비슷한 시간이 걸리게 해서,
    응답 속도로 가입 여부를 알아내지 못하게 한다."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password("dummy-password-1")
    verify_password(password, _dummy_hash)


# ---------------------------------------------------------------- 토큰
def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    lifetime = expires_delta if expires_delta is not None else timedelta(minutes=_expire_minutes())
    payload = {"sub": str(user_id), "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, _secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[int]:
    """올바른 토큰이면 사용자 id, 아니면(변조, 만료, 형식 오류) None."""
    try:
        payload = jwt.decode(
            token, _secret_key(), algorithms=[ALGORITHM], options={"require": ["exp", "sub"]}
        )
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
