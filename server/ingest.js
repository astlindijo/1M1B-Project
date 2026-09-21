'use strict';

/**
 * ingest.js  — CLI tool for loading campus sustainability PDFs into Chroma.
 *
 * Usage:
 *   node server/ingest.js ./docs/energy-policy.pdf ./docs/waste-guide.pdf
 *   node server/ingest.js ./docs          ← ingests all PDFs in a directory
 *
 * Each PDF is split into overlapping chunks of ~500 tokens (≈ 2000 characters)
 * with a 200-character overlap to preserve sentence context across chunk boundaries.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { ingestChunks } = require('./rag');

// ─── Chunking parameters ────────────────────────────────────────────────────
const CHUNK_SIZE = 2000;    // characters per chunk
const CHUNK_OVERLAP = 200;  // characters of overlap between consecutive chunks

/**
 * Splits a long text string into overlapping chunks.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoChunks(text) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Ingests a single PDF file into Chroma.
 *
 * @param {string} filePath  - Absolute or relative path to the PDF.
 * @returns {Promise<number>} - Number of chunks ingested.
 */
async function ingestPdf(filePath) {
  const absolutePath = path.resolve(filePath);
  const source = path.basename(absolutePath);

  console.log(`\n📄 Processing: ${source}`);

  const buffer = fs.readFileSync(absolutePath);
  const parsed = await pdfParse(buffer);

  if (!parsed.text || parsed.text.trim().length === 0) {
    console.warn(`  ⚠ No extractable text found in ${source}. Skipping.`);
    return 0;
  }

  // Normalize whitespace: collapse multiple newlines and spaces
  const cleanedText = parsed.text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const textChunks = splitIntoChunks(cleanedText);

  const chunks = textChunks.map((text, i) => ({
    text,
    source,
    chunkIndex: i,
  }));

  await ingestChunks(chunks);

  console.log(`  ✅ Ingested ${chunks.length} chunk(s) from ${source}`);
  return chunks.length;
}

/**
 * Collects all PDF file paths from the given CLI arguments.
 * Accepts individual files or a directory (non-recursive).
 *
 * @param {string[]} args
 * @returns {string[]}
 */
function collectPdfPaths(args) {
  const paths = [];

  for (const arg of args) {
    const resolved = path.resolve(arg);

    if (!fs.existsSync(resolved)) {
      console.warn(`  ⚠ Path not found: ${resolved}`);
      continue;
    }

    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(resolved);
      for (const entry of entries) {
        if (entry.toLowerCase().endsWith('.pdf')) {
          paths.push(path.join(resolved, entry));
        }
      }
    } else if (stat.isFile() && resolved.toLowerCase().endsWith('.pdf')) {
      paths.push(resolved);
    } else {
      console.warn(`  ⚠ Skipping non-PDF file: ${resolved}`);
    }
  }

  return paths;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default to ./docs if no arguments given
    args.push(path.join(__dirname, '..', 'docs'));
  }

  const pdfPaths = collectPdfPaths(args);

  if (pdfPaths.length === 0) {
    console.error('No PDF files found. Place PDFs in ./docs/ or pass file paths as arguments.');
    process.exit(1);
  }

  console.log(`\n🌱 GreenCampus AI — PDF Ingest Tool`);
  console.log(`   Found ${pdfPaths.length} PDF file(s) to ingest.\n`);

  let totalChunks = 0;

  for (const pdfPath of pdfPaths) {
    try {
      totalChunks += await ingestPdf(pdfPath);
    } catch (err) {
      console.error(`  ❌ Failed to ingest ${pdfPath}: ${err.message}`);
    }
  }

  console.log(`\n✅ Done. Total chunks ingested: ${totalChunks}`);
}

main().catch((err) => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
