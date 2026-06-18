import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "node:path";

export class CaptionStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const uploads = new s3.Bucket(this, "Uploads", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const chunks = new s3.Bucket(this, "Chunks", {
      // chunks are throwaway — expire after a day
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const results = new s3.Bucket(this, "Results", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const jobs = new dynamodb.Table(this, "Jobs", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const backendRoot = path.resolve(__dirname, "../../backend");

    const worker = new lambda.DockerImageFunction(this, "Worker", {
      code: lambda.DockerImageCode.fromImageAsset(backendRoot, {
        file: "docker/worker.Dockerfile",
        assetName: "worker-lambda",
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      memorySize: 3008,
      timeout: cdk.Duration.minutes(5),
      architecture: lambda.Architecture.X86_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        CHUNKS_BUCKET: chunks.bucketName,
      },
    });
    chunks.grantRead(worker);

    // Optional: keep one warm to avoid first-request cold start.
    // new lambda.Alias(this, "WorkerLive", {
    //   aliasName: "live",
    //   version: worker.currentVersion,
    //   provisionedConcurrentExecutions: 1,
    // });

    const orchestrator = new lambda.DockerImageFunction(this, "Orchestrator", {
      code: lambda.DockerImageCode.fromImageAsset(backendRoot, {
        file: "docker/orchestrator.Dockerfile",
        assetName: "orchestrator-lambda",
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      memorySize: 2048,
      timeout: cdk.Duration.minutes(10),
      architecture: lambda.Architecture.X86_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOADS_BUCKET: uploads.bucketName,
        CHUNKS_BUCKET: chunks.bucketName,
        RESULTS_BUCKET: results.bucketName,
        JOBS_TABLE: jobs.tableName,
        WORKER_FN: worker.functionName,
      },
    });
    uploads.grantRead(orchestrator);
    chunks.grantWrite(orchestrator);
    results.grantWrite(orchestrator);
    jobs.grantWriteData(orchestrator);
    worker.grantInvoke(orchestrator);

    uploads.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(orchestrator),
    );

    const api = new lambda.Function(this, "Api", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda/api.handler",
      code: lambda.Code.fromAsset(path.join(backendRoot, "dist")),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOADS_BUCKET: uploads.bucketName,
        RESULTS_BUCKET: results.bucketName,
        JOBS_TABLE: jobs.tableName,
      },
    });
    uploads.grantPut(api);
    results.grantRead(api);
    jobs.grantReadData(api);

    const apiUrl = api.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: { allowedOrigins: ["*"], allowedMethods: [lambda.HttpMethod.ALL] },
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: apiUrl.url });
  }
}