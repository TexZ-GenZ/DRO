from pydantic_settings import BaseSettings
from typing import Dict, Tuple

class Settings(BaseSettings):
    TOMTOM_API_KEY: str = "NIdq1YzsoPiR0rMdq3LY8PkpVWEww2Yy"
    UPDATE_INTERVAL: int = 30  # seconds

settings = Settings()
