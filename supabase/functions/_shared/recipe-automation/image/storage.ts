// F2 Recipe Automation — Step 09: upload to the existing `crop-photos` bucket.
//
// A separate, injectable seam (like agent-runner.ts's `AgentRunner`) rather than calling
// `client.storage` directly from image-stage.ts — `FakeSupabaseClient` (infra/testing/, shared by
// every other stage's tests) has no `.storage` surface, and extending it for one stage's benefit
// would touch shared Step 05 test infra out of this step's scope. Tests inject a fake
// `ImageStorageUploader` instead; production wires the real Supabase Storage client.
import type { SupabaseClient } from "../infra/supabase-admin.ts";
import { RecipeAutomationError } from "../infra/errors.ts";
import { IMAGE_STORAGE_BUCKET } from "../schemas.ts";

export interface ImageStorageUploader {
  /** Uploads `bytes` to `path` within the fixed `crop-photos` bucket, returning its public URL.
   * Must be idempotent for an identical (path, bytes) pair — see SupabaseImageStorageUploader's
   * "already exists" handling below, which this stage's idempotency contract depends on. */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<{ publicUrl: string }>;
  /** Downloads bytes at `path` — used only to reuse a previously-generated 'source' asset without
   * another paid Gemini call (this step's idempotency requirement). */
  download(path: string): Promise<Uint8Array>;
}

export class SupabaseImageStorageUploader implements ImageStorageUploader {
  constructor(private readonly client: SupabaseClient) {}

  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<{ publicUrl: string }> {
    const bucket = this.client.storage.from(IMAGE_STORAGE_BUCKET);
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });

    // A duplicate-path upload (a retried invocation re-uploading the exact same object this
    // stage's own idempotency check already decided to reuse) is not a failure — Supabase Storage
    // reports it as a 409/"already exists" error, which this stage-runner treats the same as a
    // fresh successful upload rather than failing the job over.
    if (error && !/already exists/i.test(error.message ?? "")) {
      throw new RecipeAutomationError({
        code: "IMAGE_STORAGE_UPLOAD_FAILED",
        message: "recipe-stage-image storage upload failed",
        stage: "image",
        retryable: true,
        details: { path },
      });
    }

    const { data } = bucket.getPublicUrl(path);
    return { publicUrl: data.publicUrl };
  }

  async download(path: string): Promise<Uint8Array> {
    const bucket = this.client.storage.from(IMAGE_STORAGE_BUCKET);
    const { data, error } = await bucket.download(path);
    if (error || !data) {
      throw new RecipeAutomationError({
        code: "IMAGE_STORAGE_DOWNLOAD_FAILED",
        message: "recipe-stage-image storage download failed",
        stage: "image",
        retryable: true,
        details: { path },
      });
    }
    return new Uint8Array(await data.arrayBuffer());
  }
}
