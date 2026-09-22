/**
 * Command Delayed GC: npm run images:gc [--dry-run] [--batch 100]
 * Gọi service thật src/lib/image-gc.server.ts (không nhân bản logic).
 * Exit code != 0 khi có storage/db failure.
 */
import fs from "node:fs";
import { runImageGc } from "@/lib/image-gc.server";

// Nạp .env (convention các script khác: backfill-image-assets.mjs, seed-admin.mjs)
for (const line of fs.readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const dryRun = process.argv.includes("--dry-run");
const batchIdx = process.argv.indexOf("--batch");
const batchSize = batchIdx >= 0 ? Number(process.argv[batchIdx + 1]) || 100 : 100;

const report = await runImageGc({ batchSize, dryRun });
console.log(JSON.stringify(report, null, 2));
if (report.storageFailures > 0 || report.dbFailures > 0) {
  console.error(`[image-gc] FAILURES: storage=${report.storageFailures} db=${report.dbFailures}`);
  process.exitCode = 1;
}
