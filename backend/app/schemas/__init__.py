"""Pydantic request models and shared body/query parsing."""

from __future__ import annotations

from flask import request
from pydantic import BaseModel, ValidationError

from ..errors import validation_api_error


def parse_body[ModelT: BaseModel](model: type[ModelT]) -> ModelT:
    """Parse and validate a required JSON body, raising the standard 422 on failure."""
    return _parse(model, allow_empty=False)


def parse_optional_body[ModelT: BaseModel](model: type[ModelT]) -> ModelT:
    """Like ``parse_body``, but an absent/empty body is treated as ``{}``."""
    return _parse(model, allow_empty=True)


def parse_query[ModelT: BaseModel](model: type[ModelT]) -> ModelT:
    """Parse and validate query parameters, raising the standard 422 on failure."""
    try:
        return model.model_validate(request.args.to_dict())
    except ValidationError as exc:
        raise validation_api_error(exc) from exc


def _parse[ModelT: BaseModel](model: type[ModelT], *, allow_empty: bool) -> ModelT:
    if allow_empty and not request.get_data(cache=True).strip():
        payload: object = {}
    else:
        payload = request.get_json()

    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise validation_api_error(exc) from exc
