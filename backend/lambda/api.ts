import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const lambda = new LambdaClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET!;
const JOBS_TABLE = process.env.JOBS_TABLE!;
const BURN_FN = process.env.BURN_FN!;

const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;

export async function handler(event: any) {
  const path = event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (method === "POST" && path === "/api/transcribe") {
    const { model = "Xenova/whisper-small.en", language, fileSize } = JSON.parse(event.body || "{}");
    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return json({ error: "fileSize required" }, 400);
    }
    if (size > MAX_UPLOAD_BYTES) {
      const limitMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
      return json({ error: `Video exceeds ${limitMb} MB limit` }, 413);
    }
    const jobId = randomUUID();
    const key = `${jobId}.bin`;
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: UPLOADS_BUCKET,
        Key: key,
        ContentLength: size,
        Metadata: { jobid: jobId, model, language: language || "" },
      }),
      { expiresIn: 900 },
    );
    return json({ jobId, uploadUrl });
  }

  if (method === "POST" && path === "/api/burn") {
    const body = JSON.parse(event.body || "{}");
    const { jobId, srt, mode, style, videoWidth, videoHeight } = body;
    if (!jobId || !srt || !mode) {
      return json({ error: "jobId, srt, mode required" }, 400);
    }
    await ddb.send(new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { id: jobId },
      UpdateExpression: "set burnStatus=:s, burnResultKey=:k, burnError=:e",
      ExpressionAttributeValues: { ":s": "burning", ":k": null, ":e": null },
    }));
    await lambda.send(new InvokeCommand({
      FunctionName: BURN_FN,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({
        jobId,
        srt,
        mode: mode === "hard" ? "hard" : "soft",
        style: { ...style, videoWidth, videoHeight },
      })),
    }));
    return json({ jobId });
  }

  if (method === "GET" && path.startsWith("/api/jobs/")) {
    const id = path.split("/").pop();
    const r = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { id } }));
    const item: any = r.Item;
    if (!item) return json({ status: "unknown" });

    if (item.status === "done" && item.resultKey) {
      const obj = await s3.send(new GetObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: item.resultKey,
      }));
      const text = await obj.Body!.transformToString();
      item.result = JSON.parse(text);
    }

    if (item.burnStatus === "done" && item.burnResultKey) {
      item.burnDownloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: RESULTS_BUCKET,
          Key: item.burnResultKey,
          ResponseContentDisposition: `attachment; filename="${item.id}-subtitled.mp4"`,
          ResponseContentType: "video/mp4",
        }),
        { expiresIn: 3600 },
      );
    }

    return json(item);
  }

  return { statusCode: 404, body: "not found" };
}

const json = (b: unknown, statusCode = 200) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(b),
});
