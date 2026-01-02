Title: Cloudinary retry/background job and logging replacement

Summary:
Implement a background retry mechanism for Cloudinary deletions and replace console logging with a structured logger (pino) across the project.

Problems to solve:
- Failed Cloudinary deletes result in orphaned images; current code only logs and does not retry.
- `console.log`/`console.error` usage is inconsistent and lacks levels or structured context.

Planned changes (high level):
1. Add a `jobQueue` module (using bullmq or node-resque) with a single `cloudinary-delete` job type.
   - When deletion to Cloudinary fails, enqueue a retry job with backoff metadata.
   - Provide a scheduled worker that attempts retries and emits metrics/logs when max retries reached.
2. Extract Cloudinary operations into `modules/upload/worker.service.js` and `modules/upload/api.service.js`.
   - `api.service` exposes `deleteBatchFromCloudinary()` that returns results and throws on unrecoverable errors.
   - `worker.service` handles enqueuing and background deletion.
3. Replace `console.*` usages with `pino` logger.
   - Add logger instance export `utils/logger.js` and use across modules.
   - Keep `console` in small one-off scripts for now; update server files in a staged manner.
4. Add unit & integration tests for retry job handling and Cloudinary failure cases.

Files to change (examples):
- modules/upload/upload.service.js -> move deletion logic to `api.service` and add wrapper that enqueues retry job on failure.
- modules/upload/worker.service.js -> new file for actual background deletion logic.
- modules/products/products.service.js -> call wrapper (which will asynchronously queue retry jobs as needed).
- config/logger.js -> new pino logger factory. Replace top-level console calls gradually.

Acceptance criteria:
- Failed Cloudinary deletions enqueue a retry job and do not block the main request.
- Worker retries failed deletions with exponential backoff up to N retries.
- Logs contain structured contexts (productId, vendorId, publicId) for deletions.
- Added tests cover actual enqueuing and retry behavior (with mocks).

Notes:
- Use feature-flag or env var (CLOUDINARY_RETRY=true) to enable background job in stages.
- Keep current safeDeleteBatch as backwards-compatible, but prefer new `enqueueDeleteBatch` for production.

