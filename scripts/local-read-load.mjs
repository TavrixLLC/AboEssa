/** Safe local read-only load baseline for AboEssa only. */
import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.LOAD_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(baseUrl)) {
  throw new Error('LOAD_BASE_URL must target local AboEssa only');
}
const concurrency = Math.max(1, Math.min(50, Number(process.env.LOAD_CONCURRENCY || 10)));
const durationMs = Math.max(1_000, Math.min(120_000, Number(process.env.LOAD_DURATION_MS || 10_000)));
const paths = ['/health', '/api/products?page=1&limit=20', '/api/auctions?page=1&limit=20'];
const samples = [];
let failures = 0;
let cursor = 0;
const deadline = performance.now() + durationMs;

async function worker() {
  while (performance.now() < deadline) {
    const path = paths[cursor++ % paths.length];
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      samples.push(performance.now() - started);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
samples.sort((a, b) => a - b);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))] || 0;
const result = {
  environment: 'local-laptop-baseline',
  concurrency,
  durationMs,
  requests: samples.length,
  failures,
  errorRate: samples.length ? failures / samples.length : 0,
  p50Ms: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  p99Ms: Number(percentile(0.99).toFixed(2)),
};
console.log(JSON.stringify(result));
if (failures > 0) process.exitCode = 1;
