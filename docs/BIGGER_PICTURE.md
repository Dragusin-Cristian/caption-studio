# The Bigger Picture — What This Migration Involves

A friendly tour of what you're signing up for if you take the Lambda migration on.
See `DEPLOY_MIGRATION.md` for the technical design.

## The big picture

Right now your backend is one NestJS process that forks 4 worker children on the same machine. You're trading that for a small constellation of AWS pieces that talk to each other through S3 and DynamoDB. Same code logic, mostly — just spread across the network instead of across CPU cores.

## What actually changes

**1. Uploads stop going through your API.**
Today the client POSTs the file to NestJS. After the migration, the client asks the API for a presigned S3 URL and uploads directly to S3. This is the single biggest behavior change on the client side — one extra round-trip, but your API never has to hold a video in memory again.

**2. The pipeline becomes event-driven.**
Dropping a file into S3 fires an event that wakes up the orchestrator Lambda. No more "API receives request → kicks off job synchronously." The client polls a status endpoint to know when it's done.

**3. Workers become network calls instead of forks.**
`pool.run(segment)` becomes `lambda.invoke(WorkerFn, segment)`. Same input, same output, just over HTTPS. The win: instead of 4 parallel workers, you get up to ~50 in parallel per file, because each segment is its own Lambda invocation.

**4. Job state moves to DynamoDB.**
The current in-memory `JobsService` can't work when the orchestrator and the API are different Lambda instances. DynamoDB is the shared scratchpad — write progress from the orchestrator, read it from the API.

## What you actually have to build

- **Two Docker images.** The worker image bakes the 250 MB whisper model in. The orchestrator image bakes ffmpeg in. Both are arm64 Lambda containers.
- **Three Lambda handlers** (`api.ts`, `orchestrator.ts`, `worker.ts`). Mostly thin wrappers around code you already have — `subtitles.util.ts`, the audio extraction logic, the worker body from `whisper.worker.mjs`.
- **A CDK stack** (~80 lines) that declares the buckets, table, functions, IAM grants, and the S3 → orchestrator notification.
- **Client tweaks** to do the presigned-upload dance and poll for status.

## What stays exactly the same

- `subtitles.util.ts` (segmenting, cue merging, SRT/VTT).
- The whisper worker logic itself.
- The audio extraction logic.
- `npm run dev` against NestJS for local development — the `src/` tree stays.

## The unknowns worth checking early

- **Does whisper-small.en q8 actually run on arm64 Lambda?** Transformers.js's ONNX runtime has arm64 binaries, but a 10-minute smoke test would save you a day of debugging later. If it's rocky, x86_64 works fine — costs ~25% more but isn't a blocker.
- **ffmpeg on arm64.** `ffmpeg-static` doesn't ship reliable arm64 Linux binaries, so you'll either fetch a static build yourself or run the orchestrator on x86_64 (totally fine — workers are where the GB-seconds go).
- **Cold starts.** ~4–8 s on a fresh worker. The `provisionedConcurrentExecutions: 1` alias keeps one warm so the first request of the day doesn't get spanked. Drop it if your account hits provisioned-concurrency limits.

## Rough effort

If nothing surprises you: a long focused day to get the happy path deploying, another day for the client-side upload/polling rewrite, then a day or two of "huh, why does ffmpeg do that on Lambda" debugging. Call it a week, comfortably.

## What you're getting for the trouble

- Zero idle cost (vs. a ~$50/mo Fargate task).
- Elastic parallelism — a 30-minute video transcribes roughly as fast as a 5-minute one, because the chunks fan out.
- No more "my laptop's fans are screaming" while running locally against real workloads.

The break-even vs. Fargate is around 30k files/month — under that, Lambda wins on price too.
