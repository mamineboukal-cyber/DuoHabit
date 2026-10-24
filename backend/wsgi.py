"""WSGI entrypoint used by gunicorn and the Flask CLI."""

from app import create_app

app = create_app()
