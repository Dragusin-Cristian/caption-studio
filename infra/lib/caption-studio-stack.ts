import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as path from "node:path";

interface CaptionStudioStackProps extends cdk.StackProps {
  appDomain: string;
  hostedZone: route53.IHostedZone;
  certificate: acm.ICertificate;
}

export class CaptionStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CaptionStudioStackProps) {
    super(scope, id, props);

    const clientBucket = new s3.Bucket(this, "Client", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const distribution = new cloudfront.Distribution(this, "ClientDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(clientBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
      domainNames: [props.appDomain],
      certificate: props.certificate,
    });

    new route53.ARecord(this, "ClientAlias", {
      zone: props.hostedZone,
      recordName: props.appDomain,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    new s3deploy.BucketDeployment(this, "DeployClient", {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, "../../client/dist"))],
      destinationBucket: clientBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    const allowedOrigins = [
      `https://${distribution.distributionDomainName}`,
      `https://${props.appDomain}`,
      "http://localhost:5173",
    ];

    const uploads = new s3.Bucket(this, "Uploads", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins,
        allowedHeaders: ["*"],
      }],
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
      cors: [{
        allowedMethods: [s3.HttpMethods.GET],
        allowedOrigins,
        allowedHeaders: ["*"],
      }],
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

    const burn = new lambda.DockerImageFunction(this, "Burn", {
      code: lambda.DockerImageCode.fromImageAsset(backendRoot, {
        file: "docker/burn.Dockerfile",
        assetName: "burn-lambda",
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      memorySize: 3008,
      timeout: cdk.Duration.minutes(15),
      ephemeralStorageSize: cdk.Size.gibibytes(10),
      architecture: lambda.Architecture.X86_64,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOADS_BUCKET: uploads.bucketName,
        RESULTS_BUCKET: results.bucketName,
        JOBS_TABLE: jobs.tableName,
      },
    });
    uploads.grantRead(burn);
    results.grantWrite(burn);
    jobs.grantWriteData(burn);

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
        BURN_FN: burn.functionName,
      },
    });
    uploads.grantPut(api);
    results.grantRead(api);
    jobs.grantReadData(api);
    jobs.grantWriteData(api);
    burn.grantInvoke(api);

    const apiUrl = api.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins,
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ["*"],
      },
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: apiUrl.url });
    new cdk.CfnOutput(this, "ClientUrl", {
      value: `https://${props.appDomain}`,
    });
    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
