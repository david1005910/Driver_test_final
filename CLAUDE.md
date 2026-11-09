# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean driver's license written exam preparation app based on the official 999-question bank from the Korean Road Traffic Authority (도로교통공단). Full-stack application with study modes, mock exams, error tracking, and an AI tutor powered by RAG.

## Development Commands

```bash
# Start all services (requires Docker Desktop + Ollama running on localhost:11434)
docker compose up -d --build

# One-time setup: Import questions + build embeddings
docker exec driver_test_api node src/scripts/seed.js

# Pull required Ollama models (if not present)
ollama pull nomic-embed-text
ollama pull qwen2.5:3b

# Reset database and re-seed
docker compose down -v
docker compose up -d --build
docker exec driver_test_api node src/scripts/seed.js

# Fetch video files for questions 966-999 (requires ffmpeg)
python3 scripts/fetch_videos.py
```

**Service URLs:**
- Frontend: http://localhost:5173
- API: http://localhost:3002
- MySQL: localhost:3307

## Architecture

**Tech Stack:**
- Frontend: React 18 + Vite 5 (hash-based SPA routing)
- Backend: Node.js 20 + Express 4 (CommonJS)
- Database: MySQL 8.4 (utf8mb4)
- AI: Ollama with `nomic-embed-text` (embeddings) + `qwen2.5:3b` (LLM)

**Key Data Flow:**
- Questions stored in MySQL with JSON fields for options/answers
- Wrong answers automatically tracked in `wrong_answers` table
- RAG uses hybrid search: 60% dense (cosine similarity) + 40% sparse (BM25)
- LLM responses streamed via SSE at `/api/rag/explain` and `/api/rag/ask`

**Database Tables:** `questions` (999 rows), `attempts`, `wrong_answers`, `embeddings`

## Code Organization

```
backend/src/
├── server.js              # Express entry point
├── db.js                  # MySQL connection pool
├── routes/                # API endpoints (questions, exam, wrong, stats, rag, videos)
├── services/
│   ├── ollama.js          # Ollama API wrapper
│   ├── embedService.js    # Hybrid search (dense + BM25)
│   └── ragService.js      # RAG prompt building, SSE streaming
└── scripts/               # seed.js, importBank.js, buildEmbeddings.js

frontend/src/
├── App.jsx                # Main layout with 5 tabs
├── api.js                 # Fetch wrapper (get, post, postStream)
├── pages/                 # Home, Study, Quiz, Wrong, AITutor
└── components/            # QuestionView, ScoreBarChart

data/
├── bank.json              # 999 questions source
├── images/                # Question images (289 PNG files)
└── videos/                # Video files (not in git, fetched via script)
```

## RAG System Notes

- Similarity threshold: 0.45 (questions below this excluded from LLM context)
- System prompt enforces zero-hallucination: strict fact-based explanations only
- Model config: `temperature=0.0`, `top_p=0.1` for conservative output
- Each answer option (1-4) explained with legal/regulatory basis
