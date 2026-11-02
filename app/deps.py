"""
임시 '요청자 식별' 장치.

아직 로그인(FR-06)이 없어서, 누가 요청했는지 알 방법이 없습니다.
그래서 요청 헤더 X-User-Id 로 "나는 몇 번 사용자다"를 흉내 냅니다.
헤더를 안 보내면 기본 사용자(id=1)로 간주합니다.

나중에 로그인 기능이 생기면, 이 함수 내부만 '토큰에서 사용자 추출'로 바꾸면 되고
라우터 코드는 전혀 안 바꿔도 됩니다.
"""
from typing import Optional
from fastapi import Header

DEFAULT_USER_ID = 1


def get_current_user_id(x_user_id: Optional[int] = Header(default=None)) -> int:
    return x_user_id if x_user_id is not None else DEFAULT_USER_ID
