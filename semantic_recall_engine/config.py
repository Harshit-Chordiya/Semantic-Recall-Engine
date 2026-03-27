# Centralized configuration
from pathlib import Path
from dotenv import load_dotenv
import os

# Load .env once at startup
load_dotenv(override=True)

# ---------- Base paths ----------
ROOT = Path(__file__).resolve().parent.parent
FAISS_DIR = Path(os.getenv("FAISS_DIR", ROOT / "faiss_index"))
DOCS_DIR  = Path(os.getenv("DOCS_DIR", ROOT / "documents"))

# ---------- Model / API keys ----------
GOOGLE_API_KEY      = os.getenv("GOOGLE_API_KEY", "")
GEMINI_API_KEY      = os.getenv("GEMINI_API_KEY", GOOGLE_API_KEY)  # fallback
GEMINI_MODEL_DECISION   = os.getenv("GEMINI_MODEL_DECISION", "gemini-2.0-flash")
GEMINI_MODEL_PERCEPTION = os.getenv("GEMINI_MODEL_PERCEPTION", "gemini-2.0-flash")