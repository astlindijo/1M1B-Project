'use strict';

/**
 * rag.js
 * Handles all Chroma vector-store operations:
 *   - getCollection()   → get or create the Chroma collection
 *   - ingestChunks()    → embed text chunks and upsert into Chroma
 *   - retrieveContext() → embed a query and return the top-k relevant chunks
 */

const { ChromaClient, OpenAIEmbeddingFunction } = require('chromadb');

const COLLECTION_NAME = 'greencampus_docs';
const TOP_K = 5; // number of chunks to retrieve per query

let _client = null;
let _collection = null;
let _embedder = null;

/**
 * Returns a shared Chroma client instance.
 * Connects to a locally-running Chroma server (default: http://localhost:8000).
 */
function getClient() {
  if (!_client) {
    _client = new ChromaClient({
      path: process.env.CHROMA_URL || 'http://localhost:8000',
    });
  }
  return _client;
}

/**
 * Returns the OpenAI embedding function used for both ingestion and retrieval.
 * Uses text-embedding-3-small — cheap, fast, and well-suited for RAG.
 */
function getEmbedder() {
  if (!_embedder) {
    _embedder = new OpenAIEmbeddingFunction({
      openai_api_key: process.env.OPENAI_API_KEY,
      openai_model: 'text-embedding-3-small',
    });
  }
  return _embedder;
}

/**
 * Gets (or creates) the GreenCampus Chroma collection.
 * Safe to call multiple times — returns the cached instance after first call.
 *
 * @returns {Promise<Collection>}
 */
async function getCollection() {
  if (_collection) return _collection;

  const client = getClient();
  const embedder = getEmbedder();

  _collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: embedder,
    metadata: { 'hnsw:space': 'cosine' },
  });

  return _collection;
}

/**
 * Ingests an array of text chunks into Chroma.
 * Each chunk is associated with a source document name.
 * Duplicate IDs are upserted (updated) rather than rejected.
 *
 * @param {Array<{ text: string, source: string, chunkIndex: number }>} chunks
 * @returns {Promise<void>}
 */
async function ingestChunks(chunks) {
  if (!chunks || chunks.length === 0) return;

  const collection = await getCollection();

  const ids = chunks.map((c) => `${c.source}::chunk::${c.chunkIndex}`);
  const documents = chunks.map((c) => c.text);
  const metadatas = chunks.map((c) => ({
    source: c.source,
    chunkIndex: c.chunkIndex,
  }));

  // Upsert in batches of 100 to avoid request-size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    await collection.upsert({
      ids: ids.slice(i, i + BATCH_SIZE),
      documents: documents.slice(i, i + BATCH_SIZE),
      metadatas: metadatas.slice(i, i + BATCH_SIZE),
    });
  }
}

/**
 * Retrieves the top-k most relevant text chunks for a given query string.
 *
 * @param {string} query  - The user's question.
 * @param {number} [k]    - Number of results to return (default: TOP_K).
 * @returns {Promise<{ texts: string[], sources: string[] }>}
 */
async function retrieveContext(query, k = TOP_K) {
  const collection = await getCollection();

  // Check whether there is anything in the collection first
  const count = await collection.count();
  if (count === 0) {
    return { texts: [], sources: [] };
  }

  const results = await collection.query({
    queryTexts: [query],
    nResults: Math.min(k, count),
  });

  const texts = (results.documents?.[0] ?? []).filter(Boolean);
  const sources = (results.metadatas?.[0] ?? []).map((m) => m?.source ?? 'unknown');

  return { texts, sources };
}

module.exports = { getCollection, ingestChunks, retrieveContext };
