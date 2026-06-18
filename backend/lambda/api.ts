import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const JOBS_TABLE = process.env.JOBS_TABLE!;

export async function handler(event: any) {
  const path = event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (method === "POST" && path === "/api/transcribe") {
    const { model = "Xenova/whisper-small.en", language } = JSON.parse(event.body || "{}");
    const jobId = randomUUID();
    const key = `${jobId}.bin`;
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: UPLOADS_BUCKET,
        Key: key,
        Metadata: { jobid: jobId, model, language: language || "" },
      }),
      { expiresIn: 900 },
    );
    return json({ jobId, uploadUrl });
  }

  if (method === "GET" && path.startsWith("/api/jobs/")) {
    const id = path.split("/").pop();
    const r = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { id } }));
    return json(r.Item ?? { status: "unknown" });
  }

  return { statusCode: 404, body: "not found" };
}

const json = (b: unknown) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(b),
});
