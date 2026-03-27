from _future_ import annotations
import os, json, time, hashlib
from pathlib import Path
from typing import List, Dict, Any, Tuple
from datetime import datetime

import numpy as np
import faiss
import math


from .config import (
    FAISS_DIR, INDEX_PATH, MAX_CHUNKS_PER_DOC, META_PATH, EMBEDDINGS_PROVIDER,
    GOOGLE_API_KEY, EMBED_URL, EMBED_MODEL,
    GOOGLE_EMBED_MODEL, EMBED_BATCH_SIZE,
    CHUNK_SIZE, CHUNK_OVERLAP, 
    HALF_LIFE_DAYS, FRESHNESS_WEIGHT, POPULARITY_WEIGHT, MAX_TEMPORAL_BOOST, SIM_WEIGHT,
    TEMP_WEIGHT
)
# ---------- Embeddings ----------
_embedder = None

def _embed_batch(texts: List[str]) -> np.ndarray:
    """
    Returns L2-normalized float32 embeddings for texts.
    Provider controlled by EMBEDDINGS_PROVIDER env var:
      - ollama  → local http://localhost:11434/api/embeddings
      - google  → via GoogleGenAIEmbedding (llama_index-embeddings-google-genai)
    """
    global _embedder
    if EMBEDDINGS_PROVIDER == "google":
        if _embedder is None:
            try:
                from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
            except ImportError:
                raise ImportError(
                    "GoogleGenAIEmbedding not found. "
                    "Install with: pip install llama-index-embeddings-google-genai"
                )
            
            _embedder = GoogleGenAIEmbedding(
                model_name=GOOGLE_EMBED_MODEL,
                embed_batch_size=EMBED_BATCH_SIZE,  # safe batch size for API
                )
        vecs = _embedder.get_text_embedding_batch(texts)
        arr = np.array(vecs, dtype="float32")
    else:
        # ---------- Ollama local embeddings ----------
        import requests
        arr = []
        for t in texts:
            r = requests.post(
                EMBED_URL,
                json={"model": EMBED_MODEL, "prompt": t},
                timeout=60,
            )
            r.raise_for_status()
            v = np.array(r.json()["embedding"], dtype="float32")
            arr.append(v)
        arr = np.stack(arr, axis=0)

    # normalize for cosine/IP equivalence
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    return arr / norms

# ---------- FAISS + metadata ----------
_index: faiss.Index | None = None
_meta:  List[Dict[str, Any]] = []

def _load():
    """Load index + metadata into memory (lazy)."""
    global _index, _meta
    if INDEX_PATH.exists():
        _index = faiss.read_index(str(INDEX_PATH))
    else:
        _index = None
    if META_PATH.exists():
        with META_PATH.open("r", encoding="utf-8") as f:
            _meta = [json.loads(line) for line in f]
    else:
        _meta = []

def _save():
    """Persist index + metadata."""
    if _index is not None:
        faiss.write_index(_index, str(INDEX_PATH))
    with META_PATH.open("w", encoding="utf-8") as f:
        for row in _meta:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

def _ensure_loaded():
    global _index
    if _index is None:
        _load()

def _append(vecs: np.ndarray, rows: List[Dict[str, Any]]):
    global _index, _meta
    if _index is None:
        dim = vecs.shape[1]
        # Use IP (cosine-equivalent due to normalization)
        _index = faiss.IndexFlatIP(dim)
    _index.add(vecs)
    _meta.extend(rows)
    _save()