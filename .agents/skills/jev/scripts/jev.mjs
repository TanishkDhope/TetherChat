#!/usr/bin/env node
/**
 * jev.mjs - call Jev (TypeSafe System One) through Vercel AI Gateway.
 *
 * Jev does not write prose. You give it shared state plus typed questions and it
 * returns typed answers: choice / score / noul (boolean probability).
 *
 * Usage:
 *   node jev.mjs <payload.json> [--raw]
 *   Get-Content payload.json -Raw | node jev.mjs - [--raw]
 *
 * Payload (minimal):
 *   {
 *     "state": "text, or a JSON object/array",
 *     "questions": {
 *       "lead_strength": { "type": "score",  "instructions": "...", "criteria": ["weak","warm","hot"] },
 *       "email_kind":    { "type": "choice", "instructions": "...", "criteria": { "sales": "...", "other": "..." } },
 *       "needs_reply":   { "type": "noul",   "instructions": "..." }
 *     }
 *   }
 *
 * Ask every question you might need in ONE request: questions run in parallel,
 * so extra questions barely change latency and are almost free.
 *
 * Key lookup order:
 *   1. $AI_GATEWAY_API_KEY
 *   2. $JEV_KEY_FILE
 *   3. ~/.dsh/secrets/vercel-ai-gateway.key   (default location)
 * The key is never printed, logged, or included in output.
 *
 * Exit codes:
 *   0  success
 *   1  request/transport/other error
 *   2  usage or missing-key error
 *   3  FALLBACK REQUIRED - insufficient credits / quota / HTTP 402 / HTTP 429.
 *      The caller must stop using Jev for that task and answer with its own
 *      native reasoning, then tell the user the fallback triggered.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENDPOINT = 'https://ai-gateway.vercel.sh/typesafe/v1/systemone';
const DEFAULT_MODEL = 'typesafe-ai/jev';
const DEFAULT_KEY_FILE = join(homedir(), '.dsh', 'secrets', 'vercel-ai-gateway.key');
// Vercel AI Gateway list price for typesafe-ai/jev, USD per token.
const INPUT_USD_PER_TOKEN = 0.000000042;
const OUTPUT_USD_PER_TOKEN = 0;

class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function die(code, message) {
  throw new ExitError(code, message);
}

function loadKey() {
  if (process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_API_KEY.trim()) {
    return process.env.AI_GATEWAY_API_KEY.trim();
  }
  const keyFile = process.env.JEV_KEY_FILE || DEFAULT_KEY_FILE;
  let raw;
  try {
    raw = readFileSync(keyFile, 'utf8');
  } catch {
    die(2, `No API key. Set AI_GATEWAY_API_KEY or create ${keyFile}`);
  }
  const key = raw.trim();
  if (!key) die(2, `API key file is empty: ${keyFile}`);
  return key;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function isFallbackSignal(status, bodyText) {
  if (status === 402 || status === 429) return true;
  return /insufficient|quota|credit|billing|payment required|exceeded your|out of funds/i.test(bodyText);
}

function usd(n) {
  const s = Number(n).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  return '$' + (s === '' || s === '$' ? '0' : s);
}

function writeStdout(text) {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const raw = argv.includes('--raw');
  const args = argv.filter((a) => a !== '--raw');

  let inputPath = args[0];
  if (!inputPath) {
    if (process.stdin.isTTY) die(2, 'Usage: node jev.mjs <payload.json> [--raw]');
    inputPath = '-';
  }

  let payloadText;
  try {
    payloadText = inputPath === '-' ? await readStdin() : readFileSync(inputPath, 'utf8');
  } catch (err) {
    die(2, `Could not read payload: ${err.message}`);
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (err) {
    die(2, `Payload is not valid JSON: ${err.message}`);
  }

  if (!payload || typeof payload !== 'object') die(2, 'Payload must be a JSON object.');
  if (payload.state === undefined) die(2, 'Payload needs a "state" field.');
  if (!payload.questions || typeof payload.questions !== 'object' || !Object.keys(payload.questions).length) {
    die(2, 'Payload needs a non-empty "questions" object.');
  }

  const body = { model: payload.model || DEFAULT_MODEL, state: payload.state, questions: payload.questions };
  const key = loadKey();

  const started = performance.now();
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    die(1, `JEV_ERROR network: ${err.message}`);
  }
  const latencyMs = Math.round(performance.now() - started);

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON body, keep raw text */
  }

  if (!response.ok) {
    const compact = text.length > 4000 ? text.slice(0, 4000) + '...(truncated)' : text;
    if (isFallbackSignal(response.status, text)) {
      writeStdout(
        JSON.stringify(
          {
            fallback_required: true,
            status: response.status,
            error: data ?? compact,
            hint: 'Stop using Jev for this task. Answer with native reasoning and tell the user the fallback triggered.',
            latency_ms: latencyMs,
          },
          null,
          2
        )
      );
      die(3, `JEV_FALLBACK: HTTP ${response.status} - insufficient credits / quota / rate limit. Use native reasoning.`);
    }
    writeStdout(JSON.stringify({ ok: false, status: response.status, error: data ?? compact, latency_ms: latencyMs }, null, 2));
    die(1, `JEV_ERROR: HTTP ${response.status}`);
  }

  if (raw) {
    writeStdout(text);
    return;
  }

  const usage = data?.usage || {};
  const gatewayMeta = data?.provider_metadata?.gateway || {};
  const computed = (usage.input_tokens || 0) * INPUT_USD_PER_TOKEN + (usage.output_tokens || 0) * OUTPUT_USD_PER_TOKEN;
  const chargedUsd = gatewayMeta.cost !== undefined ? Number(gatewayMeta.cost) : computed;
  const marketUsd = gatewayMeta.marketCost !== undefined ? Number(gatewayMeta.marketCost) : computed;

  const out = {
    model: data?.model ?? body.model,
    answers: data?.answers ?? null,
    usage: {
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
    },
    _meta: {
      latency_ms: latencyMs,
      charged_usd: chargedUsd,
      charged_usd_display: usd(chargedUsd),
      market_cost_usd: marketUsd,
      market_cost_usd_display: usd(marketUsd),
      priced_by: gatewayMeta.cost !== undefined ? 'gateway' : 'list-price-table',
      generation_id: gatewayMeta.generationId ?? null,
      resolved_provider: gatewayMeta.routing?.resolvedProvider ?? null,
    },
  };

  writeStdout(JSON.stringify(out, null, 2));
}

try {
  await main();
  process.exitCode = 0;
} catch (err) {
  if (err instanceof ExitError) {
    if (err.message) process.stderr.write(err.message.endsWith('\n') ? err.message : err.message + '\n');
    process.exitCode = err.code;
  } else {
    process.stderr.write(`JEV_ERROR unexpected: ${err?.stack || err}\n`);
    process.exitCode = 1;
  }
}
