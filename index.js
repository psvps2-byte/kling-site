import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_BASE_URL = process.env.WORKER_BASE_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WORKER_BASE_URL) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

async function runOnce() {
  console.log("Worker tick", new Date().toISOString());

  const { data: jobs, error } = await supabase
    .from("generations")
    .select("*")
    .eq("status", "QUEUED")
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) throw error;
  if (!jobs || jobs.length === 0) {
    console.log("No queued jobs");
    return;
  }

  for (const job of jobs) {
    console.log("Processing", job.id);

    await supabase
      .from("generations")
      .update({ status: "RUNNING" })
      .eq("id", job.id);

    try {
      const url = `${WORKER_BASE_URL}/api/kling/history?task_id=${encodeURIComponent(job.result_url)}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) throw new Error(JSON.stringify(json));

      await supabase
        .from("generations")
        .update({
          status: "DONE",
          result_url: json?.imageUrls?.[0] || job.result_url,
        })
        .eq("id", job.id);

      console.log("DONE", job.id);
    } catch (e) {
      console.error("FAILED", job.id, e);

      await supabase
        .from("generations")
        .update({ status: "ERROR" })
        .eq("id", job.id);
    }
  }
}

runOnce()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
