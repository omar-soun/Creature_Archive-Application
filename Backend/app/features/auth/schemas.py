from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Auth Models ───────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    """Sent by mobile after Firebase Auth createUser completes."""
    email: str
    firstName: str = Field(..., min_length=1, max_length=100)
    lastName: str = Field(..., min_length=1, max_length=100)
    institution: str = ""
    currentRole: str = ""


class ProfileUpdateRequest(BaseModel):
    """Optional fields for updating user profile via PATCH /auth/me."""
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)
    institution: Optional[str] = None
    currentRole: Optional[str] = None
    email: Optional[str] = None
    profileImage: Optional[str] = None


class UserProfileResponse(BaseModel):
    uid: str
    email: str
    firstName: str
    lastName: str
    institution: str
    currentRole: str
    entryCount: int
    createdAt: datetime
    lastSync: Optional[datetime] = None
    profileImage: Optional[str] = None


# ── Forgot Password Models ────────────────────────────────────────────

class ForgotPasswordInitRequest(BaseModel):
    """Step 1: User provides email to start password reset."""
    email: str


class ForgotPasswordInitResponse(BaseModel):
    """Returns a session token and the 2 challenge field labels."""
    session_token: str
    challenge_fields: list[str]


class ForgotPasswordVerifyRequest(BaseModel):
    """Step 2: User answers the 2 challenge questions."""
    session_token: str
    answers: dict[str, str]


class ForgotPasswordVerifyResponse(BaseModel):
    """Returns a reset token if verification succeeded."""
    reset_token: str


class ForgotPasswordResetRequest(BaseModel):
    """Step 3: User sets a new password using the reset token."""
    reset_token: str
    new_password: str = Field(..., min_length=8)
