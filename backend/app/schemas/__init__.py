"""Pydantic request models and shared body parsing."""

from __future__ import annotations

from flask import request
from pydantic import BaseModel, ValidationError

from ..errors import validation_api_error


def parse_body[ModelT: BaseModel](model: type[ModelT]) -> ModelT:
    """Parse and validate the JSON body, raising the standard 422 on failure."""
    payload = request.get_json()

    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise validation_api_error(exc) from exc
