# GreenCampus AI

AI-powered sustainability decision-support assistant for educational campuses — built with Node.js, Express, OpenAI GPT-4o, and ChromaDB (RAG).

---

## Features

- **Conversational chat** with multi-turn memory per browser session
- **RAG (Retrieval-Augmented Generation)** — upload your campus PDF documents and the assistant will ground answers in them
- **Structured responses** covering Problem, Category, Analysis, Recommended Actions, SDG Alignment, and Limitations
- **Source transparency** — the UI shows which campus documents were used for each answer
- **Simple, no-framework chat UI** — plain HTML/CSS/JS, works in any modern browser

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| ChromaDB (local server) | 0.5+ |
| OpenAI API key | — |

### Install ChromaDB

ChromaDB runs as a local server. The easiest way:

```bash
pip install chromadb
chroma run --path ./chroma-data
```

Leave this terminal open while running the app. ChromaDB will listen on `http://localhost:8000` by default.

---

## Setup

### 1. Install dependencies

```bash
cd greencampus-ai
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your `OPENAI_API_KEY`. Adjust other values if needed.

### 3. Start ChromaDB

In a separate terminal:

```bash
chroma run --path ./chroma-data
```

### 4. (Optional) Ingest campus sustainability PDFs

Place your campus sustainability PDF documents in the `./docs/` folder, then run:

```bash
npm run ingest
```

This will:
- Parse each PDF
- Split the text into overlapping chunks (~2000 characters, 200-character overlap)
- Embed each chunk with OpenAI `text-embedding-3-small`
- Store the vectors in your local ChromaDB instance

You can re-run `npm run ingest` whenever you add new documents — existing chunks are upserted (not duplicated).

To ingest specific files instead of the whole `docs/` folder:

```bash
node server/ingest.js ./path/to/energy-policy.pdf ./path/to/waste-guide.pdf
```

### 5. Start the server

```bash
npm start
```

Open your browser at **http://localhost:3000**.

---

## Project structure

```
greencampus-ai/
├── server/
│   ├── index.js       ← Express server + /api/chat endpoint
│   ├── rag.js         ← Chroma ingestion & retrieval helpers
│   ├── prompt.js      ← System prompt builder (injects RAG context)
│   └── ingest.js      ← CLI tool: PDF → chunks → Chroma
├── public/
│   ├── index.html     ← Chat UI
│   └── style.css      ← Styles
├── docs/              ← Drop campus sustainability PDFs here
├── .env.example       ← Environment variable template
└── package.json
```

---

## How RAG works

```
User question
    │
    ▼
Embed question (text-embedding-3-small)
    │
    ▼
Query Chroma for top-5 relevant chunks
    │
    ▼
Inject chunks into system prompt
    │
    ▼
GPT-4o-mini generates response grounded in retrieved context
    │
    ▼
Response + source document names returned to UI
```

If no campus PDFs have been ingested, the assistant still works using general sustainability knowledge and will transparently note that no campus-specific information is available.

---

## API

### `POST /api/chat`

**Request body:**
```json
{
  "message": "How can we reduce waste during college events?",
  "sessionId": "any-unique-string-per-browser-tab"
}
```

**Response:**
```json
{
  "reply": "## Problem\n...",
  "sources": ["waste-management-policy.pdf"],
  "ragUsed": true
}
```

### `GET /api/health`

Returns `{ "status": "ok", "model": "gpt-4o-mini" }`.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat model to use |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server URL |
| `PORT` | `3000` | Express server port |

---

## Responsible AI

GreenCampus AI is a **decision-support tool**. It:
- Does **not** fabricate statistics, policies, or citations
- Clearly distinguishes retrieved campus information from general recommendations
- Does **not** make final decisions — those remain with campus authorities
- Follows fairness, transparency, ethics, and privacy principles

---

## License

MIT
