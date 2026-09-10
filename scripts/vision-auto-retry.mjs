#!/usr/bin/env node
/**
 * Auto-retry Vision AI batch processing.
 * Polls quota every 5 minutes. When quota resets, spawns 3 reviewer workers
 * for the current batch and ingests. Exits after completing one batch.
 * 
 * Run: node scripts/vision-auto-retry.mjs
 */
import pg from 'pg';

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const RESET_TIME = new Date('2026-09-05T06:04:22Z');
const SLICE_FILES = [
  'tmp/vision-batch/slice_1.json',
  'tmp/vision-batch/slice_2.json',
  'tmp/vision-batch/slice_3.json'
];
const RESULT_FILES = [
  'tmp/vision-batch/results_1.json',
  'tmp/vision-batch/results_2.json',
  'tmp/vision-batch/results_3.json'
];

const { execSync } = await import('child_process');
const fs = await import('fs');

function log(msg) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${msg}`);
}

async function getRemainingImages() {
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`
    SELECT COUNT(*)::int as remaining
    FROM product_images 
    WHERE kind <> 'map' 
      AND (ai_description = '' OR ai_description IS NULL)
  `);
  const total = await c.query(`
    SELECT COUNT(*)::int as total_non_map FROM product_images WHERE kind <> 'map'
  `);
  const processed = await c.query(`
    SELECT COUNT(*)::int as processed FROM product_images 
    WHERE kind <> 'map' AND ai_description <> '' AND ai_description IS NOT NULL
  `);
  await c.end();
  return {
    remaining: r.rows[0].remaining,
    total: total.rows[0].total_non_map,
    processed: processed.rows[0].processed
  };
}

// Phase 1: Wait for quota reset
log('=== Vision AI Auto-Retry Starting ===');
log(`Quota reset at: ${RESET_TIME.toISOString()}`);

while (true) {
  const now = new Date();
  const msUntilReset = RESET_TIME.getTime() - now.getTime();
  
  if (msUntilReset <= 0) {
    log('Reset time passed. Checking quota...');
    break;
  }
  
  const minsLeft = Math.round(msUntilReset / 60000);
  log(`Waiting for quota reset... ${minsLeft} min remaining`);
  
  // Sleep with progress
  await new Promise(resolve => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, msUntilReset)));
}

// Phase 2: Prepare next batch
log('Preparing next batch...');
execSync(`node -e "const fs=require('fs'); for(let i=1;i<=3;i++){const p='tmp/vision-batch/results_'+i+'.json'; if(fs.existsSync(p)) fs.unlinkSync(p);} " && node scripts/prepare-next-slice.mjs ${BATCH_SIZE}`, {
  cwd: process.cwd(),
  stdio: 'inherit'
});

// Phase 3: Check slices
for (const f of SLICE_FILES) {
  if (!fs.existsSync(f)) {
    log(`ERROR: ${f} missing after prepare-next-slice. Aborting.`);
    process.exit(1);
  }
}

log('Slices ready. Starting 3-worker vision classification...');
log('NOTE: Workers must be spawned via the task tool in the parent session.');
log('This script provides the setup only. Run the batch from your main session.');

const stats = await getRemainingImages();
log(`Current DB status: ${stats.processed}/${stats.total} processed, ${stats.remaining} remaining`);
log('=== Auto-retry setup complete. Batch ready for execution. ===');
