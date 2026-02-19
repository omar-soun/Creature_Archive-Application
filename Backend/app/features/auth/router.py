"""Auth router — signup, profile, delete, forgot-password endpoints."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user_uid, get_db
from .schemas import (
    ForgotPasswordInitRequest,
    ForgotPasswordInitResponse,
    ForgotPasswordResetRequest,
    ForgotPasswordVerifyRequest,
    ForgotPasswordVerifyResponse,
    ProfileUpdateRequest,
    SignupRequest,
    UserProfileResponse,
)
from .service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_service(db=Depends(get_db)) -> AuthService:
    return AuthService(db)


# ── Profile Endpoints ─────────────────────────────────────────────────


@router.post("/signup", response_model=UserProfileResponse)
def signup(
    body: SignupRequest,
    uid: str = Depends(get_current_user_uid),
    service: AuthService = Depends(_get_service),
):
    """
    Create the Firestore user profile after Firebase Auth signup.

    Mobile flow:
        1. FirebaseAuth.createUserWithEmailAndPassword(email, password)
        2. val idToken = auth.currentUser.getIdToken(true).await().token
        3. POST /auth/signup  { "email": "...", "firstName": "...", ... }
           Authorization: Bearer <idToken>
    """
    return service.signup(uid, body)


@router.get("/me", response_model=UserProfileResponse)
def get_current_user(
    uid: str = Depends(get_current_user_uid),
    service: AuthService = Depends(_get_service),
):
    """Return the authenticated user's Firestore profile."""
    return service.get_profile(uid)


@router.patch("/me", response_model=UserProfileResponse)
def update_profile(
    body: ProfileUpdateRequest,
    uid: str = Depends(get_current_user_uid),
    service: AuthService = Depends(_get_service),
):
    """Update the authenticated user's Firestore profile."""
    return service.update_profile(uid, body)


@router.delete("/me")
def delete_account(
    uid: str = Depends(get_current_user_uid),
    service: AuthService = Depends(_get_service),
):
    """Delete the user's Firestore profile and Firebase Auth account."""
    service.delete_account(uid)
    return {"detail": "Account and all data deleted."}


# ── Forgot Password (Unauthenticated) ────────────────────────────────


@router.post(
    "/forgot-password/initiate",
    response_model=ForgotPasswordInitResponse,
)
def forgot_password_initiate(
    body: ForgotPasswordInitRequest,
    service: AuthService = Depends(_get_service),
):
    """
    Step 1: Start the forgot-password flow.
    Looks up the email, picks 2 random challenge fields.
    """
    return service.forgot_password_initiate(body.email)


@router.post(
    "/forgot-password/verify",
    response_model=ForgotPasswordVerifyResponse,
)
def forgot_password_verify(
    body: ForgotPasswordVerifyRequest,
    service: AuthService = Depends(_get_service),
):
    """
    Step 2: Verify the user's answers to the 2 challenge questions.
    Returns a reset token on success.
    """
    return service.forgot_password_verify(body.session_token, body.answers)


@router.post("/forgot-password/reset")
def forgot_password_reset(
    body: ForgotPasswordResetRequest,
    service: AuthService = Depends(_get_service),
):
    """Step 3: Reset the password using the reset token."""
    service.forgot_password_reset(body.reset_token, body.new_password)
    return {
        "detail": "Password reset successful. You can now sign in with your new password."
    }
