"""Named photo collections under the existing owner login."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Profile

router = APIRouter()


def get_profile_id(profile_id: int = Query(default=1, ge=1), db: Session = Depends(get_db)) -> int:
    # This dependency and the endpoint run in separate worker-pool turns.
    # Never retain a connection between them: a burst of photo requests can
    # fill every worker with connection waiters and starve the endpoints that
    # would release those connections. The shared Session can be reused below.
    try:
        exists = db.get(Profile, profile_id) is not None
    finally:
        db.close()
    if not exists:
        raise HTTPException(status_code=404, detail="Person not found")
    return profile_id


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    birthday: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Enter a name")
        return value

    @field_validator("birthday")
    @classmethod
    def valid_birthday(cls, value):
        if not value:
            return None
        try:
            parsed = date.fromisoformat(value)
        except ValueError:
            raise ValueError("Enter a birthday as YYYY-MM-DD")
        if parsed.isoformat() != value or parsed > date.today():
            raise ValueError("Enter a valid birthday that is not in the future")
        return value


def public_profile(profile):
    return {"id": profile.id, "name": profile.name, "birthday": profile.birthday}


@router.get("")
def list_profiles(db: Session = Depends(get_db)):
    return [public_profile(p) for p in db.query(Profile).order_by(Profile.id).all()]


@router.post("", status_code=201)
def create_profile(body: ProfileInput, db: Session = Depends(get_db)):
    profile = Profile(name=body.name, birthday=body.birthday)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return public_profile(profile)


@router.patch("/{profile_id}")
def update_profile(profile_id: int, body: ProfileInput, db: Session = Depends(get_db)):
    profile = db.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Person not found")
    profile.name, profile.birthday = body.name, body.birthday
    db.commit()
    return public_profile(profile)
