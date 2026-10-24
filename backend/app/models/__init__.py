"""SQLAlchemy models. Importing this package registers all tables on the metadata."""

from .couple import Couple
from .user import User

__all__ = ["Couple", "User"]
