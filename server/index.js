'use strict';

/**
 * index.js — GreenCampus AI Express server
 *
 * Routes:
 *   GET  /              → serves the chat UI (public/index.html)
 *   POST /api/chat      → accepts { messages, sessionId } → returns AI response
 *   GET  /api/health    → health check
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const { retrieveContext } = require('./rag');
const { buildSystemPrompt } = require('./prompt');

// ─── Validate required env vars ──────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.error('❌  OPENAI_API_KEY is not set. Please add it to your .env file.');
  process.exit(1);
}

// ─── OpenAI client ───────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── In-memory conversation store ────────────────────────────────────────────
// Keeps the last N turns per session so users can ask follow-up questions.
// Production deployments should replace this with Redis or a database.
const MAX_HISTORY_TURNS = 10; // each turn = 1 user + 1 assistant message
const sessions = new Map(); // sessionId → Message[]

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  return sessions.get(sessionId);
}

function appendToHistory(sessionId, role, content) {
  const history = getHistory(sessionId);
  history.push({ role, content });

  // Trim to the last MAX_HISTORY_TURNS turns (2 messages per turn)
  const maxMessages = MAX_HISTORY_TURNS * 2;
  if (history.length > maxMessages) {
    history.splice(0, history.length - maxMessages);
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

// ─── Chat endpoint ────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required and must be a non-empty string.' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  const userMessage = message.trim();

  try {
    // 1. Retrieve relevant context from Chroma
    const { texts: contextChunks, sources } = await retrieveContext(userMessage);

    // 2. Build the system prompt (injecting RAG context)
    const systemPrompt = buildSystemPrompt(contextChunks);

    // 3. Build the message array: system + history + new user message
    const history = getHistory(sessionId);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    // 4. Call the OpenAI Chat Completions API
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.4, // lower temperature → more consistent sustainability advice
      max_tokens: 1500,
    });

    const assistantMessage = completion.choices[0]?.message?.content ?? '';

    // 5. Persist this turn to history
    appendToHistory(sessionId, 'user', userMessage);
    appendToHistory(sessionId, 'assistant', assistantMessage);

    // 6. Return response
    const uniqueSources = [...new Set(sources.filter(Boolean))];
    return res.json({
      reply: assistantMessage,
      sources: uniqueSources,
      ragUsed: contextChunks.length > 0,
    });
  } catch (err) {
    console.error('Chat error:', err);

    // Return a user-friendly error without leaking internal details
    const statusCode = err.status ?? 500;
    const userMessage_ =
      statusCode === 429
        ? 'The AI service is currently rate-limited. Please try again shortly.'
        : 'An error occurred while generating a response. Please try again.';

    return res.status(statusCode).json({ error: userMessage_ });
  }
});

// ─── Fallback: serve index.html for any unmatched GET ────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌱 GreenCampus AI is running at http://localhost:${PORT}`);
  console.log(`   Model : ${MODEL}`);
  console.log(`   RAG   : Chroma at ${process.env.CHROMA_URL || 'http://localhost:8000'}`);
  console.log(`   To ingest PDFs: npm run ingest\n`);
});
