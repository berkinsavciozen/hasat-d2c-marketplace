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

/**
 * Admin cover regeneration (admin/regenerate-cover.ts) needs more than the image stage's
 * write-once `upload` + `download`: it overwrites a recipe's live cover files, reads candidate
 * files that may legitimately be absent (-> 409, not a 500), and deletes candidates. Kept as a
 * separate interface/class so the image stage's own upsert:false contract above is untouched.
 */
export interface ImageStorageAdmin {
  /** Uploads with upsert — replaces an existing object at `path`. */
  overwrite(path: string, bytes: Uint8Array, contentType: string): Promise<{ publicUrl: string }>;
  /** Downloads `path`, or returns null when no object exists there. Other failures throw. */
  downloadIfExists(path: string): Promise<Uint8Array | null>;
  /** Deletes `paths`; absent objects are not an error. */
  remove(paths: string[]): Promise<void>;
  publicUrl(path: string): string;
}

export class SupabaseImageStorageAdmin implements ImageStorageAdmin {
  constructor(private readonly client: SupabaseClient) {}

  async overwrite(path: string, bytes: Uint8Array, contentType: string): Promise<{ publicUrl: string }> {
    const bucket = this.client.storage.from(IMAGE_STORAGE_BUCKET);
    // Short CDN cache: these paths are rewritten in place (candidates on every regenerate, the live
    // cover on apply), so the default 1h public cache would keep serving the previous image.
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: true, cacheControl: "60" });
    if (error) {
      throw new RecipeAutomationError({
        code: "IMAGE_STORAGE_UPLOAD_FAILED",
        message: "cover storage upload failed",
        retryable: true,
        details: { path },
      });
    }
    return { publicUrl: this.publicUrl(path) };
  }

  async downloadIfExists(path: string): Promise<Uint8Array | null> {
    const bucket = this.client.storage.from(IMAGE_STORAGE_BUCKET);
    const { data, error } = await bucket.download(path);
    if (error) {
      // storage-js surfaces a missing object as a StorageApiError "Object not found" (HTTP 400/404).
      const status = (error as { status?: number }).status;
      if (/not.?found/i.test(error.message ?? "") || status === 400 || status === 404) return null;
      throw new RecipeAutomationError({
        code: "IMAGE_STORAGE_DOWNLOAD_FAILED",
        message: "cover storage download failed",
        retryable: true,
        details: { path },
      });
    }
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  async remove(paths: string[]): Promise<void> {
    const { error } = await this.client.storage.from(IMAGE_STORAGE_BUCKET).remove(paths);
    if (error) {
      throw new RecipeAutomationError({
        code: "IMAGE_STORAGE_REMOVE_FAILED",
        message: "cover storage remove failed",
        retryable: true,
        details: { paths },
      });
    }
  }

  publicUrl(path: string): string {
    return this.client.storage.from(IMAGE_STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
