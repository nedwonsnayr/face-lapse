"""Saved filter presets, shared across people. Built-ins live in the frontend."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import FilterPreset
from ..services.filters import FilterDefinition

router = APIRouter()

MAX_PRESETS = 50


class PresetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=40)
    definition: FilterDefinition

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Enter a name for the filter")
        return value


def _commit_named(db: Session, name: str) -> None:
    # The pre-check covers the normal case; the unique index closes the race.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"A filter named “{name}” already exists.")


def public_preset(preset: FilterPreset) -> dict:
    return {"id": preset.id, "name": preset.name, "definition": preset.definition}


def _name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    query = db.query(FilterPreset.id).filter(func.lower(FilterPreset.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(FilterPreset.id != exclude_id)
    return query.first() is not None


@router.get("")
def list_presets(db: Session = Depends(get_db)):
    return [public_preset(p) for p in db.query(FilterPreset).order_by(func.lower(FilterPreset.name), FilterPreset.id)]


@router.post("", status_code=201)
def create_preset(body: PresetInput, db: Session = Depends(get_db)):
    if db.query(func.count(FilterPreset.id)).scalar() >= MAX_PRESETS:
        raise HTTPException(409, f"You can save up to {MAX_PRESETS} filters. Delete one to make room.")
    if _name_taken(db, body.name):
        raise HTTPException(409, f"A filter named “{body.name}” already exists.")
    preset = FilterPreset(name=body.name, definition=body.definition.model_dump())
    db.add(preset)
    _commit_named(db, body.name)
    db.refresh(preset)
    return public_preset(preset)


@router.put("/{preset_id}")
def update_preset(preset_id: int, body: PresetInput, db: Session = Depends(get_db)):
    preset = db.get(FilterPreset, preset_id)
    if preset is None:
        raise HTTPException(404, "Filter not found")
    if _name_taken(db, body.name, exclude_id=preset_id):
        raise HTTPException(409, f"A filter named “{body.name}” already exists.")
    preset.name, preset.definition = body.name, body.definition.model_dump()
    _commit_named(db, body.name)
    return public_preset(preset)


@router.delete("/{preset_id}", status_code=204)
def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    preset = db.get(FilterPreset, preset_id)
    if preset is None:
        raise HTTPException(404, "Filter not found")
    db.delete(preset)
    db.commit()
    return Response(status_code=204)
