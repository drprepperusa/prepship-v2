#!/usr/bin/env node
/**
 * Parity Test: V1 (port 3001) vs V2 (port 4010)
 * Both point to same prepship.db
 * Compares endpoint responses for format, structure, and data differences
 */

import http from 'http';
import { URL } from 'url';

const V1_BASE = 'http://127.0.0.1:3001';
const V2_BASE = 'http://127.0.0.1:4010';

// Test endpoints with various filters
// Note: Skip /health for V1 as it doesn't have that endpoint
const TEST_CASES = [
  { name: 'Counts', endpoint: '/api/counts', params: {}, skipV1: false },
  { name: 'Init Data', endpoint: '/api/init-data', params: {}, skipV1: false },
  { name: 'Clients', endpoint: '/api/clients', params: {}, skipV1: false },
  { name: 'Orders (limit 5)', endpoint: '/api/orders', params: { limit: 5 }, skipV1: false },
  { name: 'Orders (status=shipped, limit 5)', endpoint: '/api/orders', params: { status: 'shipped', limit: 5 }, skipV1: false },
  { name: 'Inventory', endpoint: '/api/inventory', params: {}, skipV1: false },
  { name: 'Locations', endpoint: '/api/locations', params: {}, skipV1: false },
  { name: 'Shipments', endpoint: '/api/shipments', params: { status: 'pending', limit: 5 }, skipV1: false },
];

// Helper to build query string
function buildQuery(params) {
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

// Helper to make HTTP request with timeout
function makeRequest(baseUrl, endpoint, params, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${endpoint}${buildQuery(params)}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      timeout,
    };

    let completed = false;

    const req = http.request(options, (res) => {
      let data = '';
      const chunks = [];

      res.on('data', chunk => {
        chunks.push(chunk);
        data += chunk;
      });

      res.on('end', () => {
        if (completed) return;
        completed = true;

        try {
          const body = res.statusCode === 200 ? JSON.parse(data) : data;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            parseError: e.message,
          });
        }
      });
    });

    req.on('error', (err) => {
      if (completed) return;
      completed = true;
      reject(err);
    });

    req.on('timeout', () => {
      if (completed) return;
      completed = true;
      req.destroy();
      reject(new Error(`Timeout after ${timeout}ms`));
    });

    req.end();
  });
}

// Compare two responses
function compareResponses(v1, v2) {
  const diffs = [];

  if (v1.status !== v2.status) {
    diffs.push(`Status mismatch: V1=${v1.status}, V2=${v2.status}`);
  }

  if (!v1.body || !v2.body) {
    return diffs;
  }

  if (typeof v1.body !== 'object' || typeof v2.body !== 'object') {
    if (String(v1.body) !== String(v2.body)) {
      diffs.push(`Body mismatch (non-JSON response)`);
    }
    return diffs;
  }

  // Check keys at top level
  const v1Keys = Object.keys(v1.body).sort();
  const v2Keys = Object.keys(v2.body).sort();

  if (JSON.stringify(v1Keys) !== JSON.stringify(v2Keys)) {
    const missing = v2Keys.filter(k => !v1Keys.includes(k));
    const extra = v1Keys.filter(k => !v2Keys.includes(k));
    if (missing.length) diffs.push(`V2 missing keys: ${missing.join(', ')}`);
    if (extra.length) diffs.push(`V2 extra keys: ${extra.join(', ')}`);
  }

  // Check data volume for array responses
  if (Array.isArray(v1.body) && Array.isArray(v2.body)) {
    if (v1.body.length !== v2.body.length) {
      diffs.push(`Array length mismatch: V1=${v1.body.length}, V2=${v2.body.length}`);
    }
    // Check first item structure
    if (v1.body.length > 0 && v2.body.length > 0) {
      const v1Item = v1.body[0];
      const v2Item = v2.body[0];
      if (typeof v1Item === 'object' && typeof v2Item === 'object') {
        const v1ItemKeys = Object.keys(v1Item).sort();
        const v2ItemKeys = Object.keys(v2Item).sort();
        if (JSON.stringify(v1ItemKeys) !== JSON.stringify(v2ItemKeys)) {
          const missing = v2ItemKeys.filter(k => !v1ItemKeys.includes(k));
          const extra = v1ItemKeys.filter(k => !v2ItemKeys.includes(k));
          if (missing.length) diffs.push(`First item missing keys: ${missing.join(', ')}`);
          if (extra.length) diffs.push(`First item extra keys: ${extra.join(', ')}`);
        }
      }
    }
  }

  return diffs;
}

// Run all tests
async function runTests() {
  console.log('\n🔍 PREPSHIP PARITY TEST\n');
  console.log(`V1 Base: ${V1_BASE}`);
  console.log(`V2 Base: ${V2_BASE}`);
  console.log(`Database: /Users/djmac/.openclaw/workspace/prepship/prepship.db\n`);
  console.log('='.repeat(100));

  const results = [];

  for (const test of TEST_CASES) {
    process.stdout.write(`\n▶️  ${test.name}... `);

    try {
      const promises = [];

      if (!test.skipV1) {
        promises.push(makeRequest(V1_BASE, test.endpoint, test.params));
      } else {
        promises.push(Promise.resolve(null));
      }

      promises.push(makeRequest(V2_BASE, test.endpoint, test.params));

      const [v1, v2] = await Promise.all(promises);

      if (test.skipV1 && v1 === null) {
        // Only test V2
        if (v2.status === 200) {
          console.log('✅ PASS (V2 only)');
          results.push({ test: test.name, status: 'PASS', details: null });
        } else {
          console.log(`⚠️  V2 error: ${v2.status}`);
          results.push({ test: test.name, status: 'ERROR', details: { error: `V2 returned ${v2.status}` } });
        }
      } else {
        const diffs = compareResponses(v1, v2);

        if (diffs.length === 0 && v1.status === 200 && v2.status === 200) {
          console.log('✅ PASS');
          results.push({ test: test.name, status: 'PASS', details: null });
        } else {
          console.log('⚠️  MISMATCH');
          const details = {
            v1Status: v1?.status,
            v2Status: v2?.status,
            diffs,
            v1KeyCount: v1?.body && typeof v1.body === 'object' ? Object.keys(v1.body).length : 'N/A',
            v2KeyCount: v2?.body && typeof v2.body === 'object' ? Object.keys(v2.body).length : 'N/A',
          };
          console.log(`   Diffs: ${diffs.length > 0 ? diffs.join(' | ') : '(structural differences)'}`);
          results.push({ test: test.name, status: 'MISMATCH', details });
        }
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      results.push({ test: test.name, status: 'ERROR', details: { error: err.message } });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(100));
  console.log('\n📊 SUMMARY\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'MISMATCH').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  console.log(`✅ Passed: ${passed}/${TEST_CASES.length}`);
  console.log(`⚠️  Mismatches: ${failed}`);
  console.log(`❌ Errors: ${errors}`);

  if (failed > 0) {
    console.log('\n⚠️  MISMATCHES DETECTED:\n');
    results.filter(r => r.status === 'MISMATCH').forEach(r => {
      console.log(`\n${r.test}:`);
      r.details.diffs.forEach(d => console.log(`  - ${d}`));
    });
  }

  if (errors > 0) {
    console.log('\n❌ ERRORS:\n');
    results.filter(r => r.status === 'ERROR').forEach(r => {
      console.log(`${r.test}: ${r.details.error}`);
    });
  }

  console.log('\n' + '='.repeat(100) + '\n');

  process.exit(failed > 0 || errors > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
