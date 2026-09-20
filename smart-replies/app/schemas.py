from typing import Literal

from pydantic import BaseModel, Field

# Wire contract shared with server/src/routes/suggestReplies.js and
# client/src/lib/smartReplies.js. Deliberately storage-agnostic: no ids,
# timestamps, sender names or room ids — only who said what, in order.

Role = Literal["other", "me"]


class Turn(BaseModel):
    role: Role
    text: str = Field(min_length=1, max_length=500)


class SuggestRequest(BaseModel):
    turns: list[Turn] = Field(min_length=1, max_length=8)
    n: int = Field(default=3, ge=1, le=5)


class SuggestResponse(BaseModel):
    replies: list[str]
    latencyMs: int
