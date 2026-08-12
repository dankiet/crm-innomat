import fs from "node:fs";
import path from "node:path";
import { StorageClient } from "@supabase/storage-js";

const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const bucket = (process.env.SUPABASE_STORAGE_BUCKET ?? "crm-images").trim();
const prefix = (process.env.SUPABASE_STORAGE_PREFIX ?? "crm").replace(/^\/+|\/+$/g, "");
const outputDir = path.resolve("public", "images");

if (!url || !key) {
  throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY");
}

const storage = new StorageClient(`${url}/storage/v1`, {
  apikey: key,
  Authorization: `Bearer ${key}`,
});
fs.mkdirSync(outputDir, { recursive: true });

const objects = [];
for (let offset = 0; ; offset += 1_000) {
  const { data, error } = await storage.from(bucket).list(prefix, {
    limit: 1_000,
    offset,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`Không liệt kê được Storage: ${error.message}`);
  objects.push(...(data ?? []).filter((item) => item.name && item.id));
  if (!data || data.length < 1_000) break;
}

let downloaded = 0;
let existing = 0;
const pending = [];
for (const object of objects) {
  const safeName = path.basename(object.name);
  if (safeName !== object.name) continue;
  const destination = path.join(outputDir, safeName);
  if (fs.existsSync(destination)) {
    existing++;
    continue;
  }
  pending.push({ object, destination });
}

const concurrency = 8;
for (let offset = 0; offset < pending.length; offset += concurrency) {
  const batch = pending.slice(offset, offset + concurrency);
  await Promise.all(
    batch.map(async ({ object, destination }) => {
      const { data, error } = await storage.from(bucket).download(`${prefix}/${object.name}`);
      if (error || !data) {
        throw new Error(`Không tải được ${object.name}: ${error?.message ?? "unknown"}`);
      }
      fs.writeFileSync(destination, Buffer.from(await data.arrayBuffer()));
      downloaded++;
    }),
  );
  if (downloaded % 100 < concurrency) {
    console.log(`[backup] đã tải ${downloaded}/${pending.length} file`);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  bucket,
  prefix,
  objects: objects.map((object) => ({
    name: object.name,
    size: object.metadata?.size ?? null,
    updated_at: object.updated_at ?? null,
  })),
};
fs.writeFileSync(
  path.join(outputDir, "storage-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`[backup] ${objects.length} object: ${downloaded} mới, ${existing} đã có`);
