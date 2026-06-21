import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as path from "node:path";

interface LandingStackProps extends cdk.StackProps {
  rootDomain: string;
  hostedZone: route53.IHostedZone;
  certificate: acm.ICertificate;
}

export class LandingStack extends cdk.Stack {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: LandingStackProps) {
    super(scope, id, props);

    const landingBucket = new s3.Bucket(this, "Landing", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    this.distribution = new cloudfront.Distribution(this, "LandingDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(landingBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      domainNames: [props.rootDomain],
      certificate: props.certificate,
    });

    new route53.ARecord(this, "LandingAlias", {
      zone: props.hostedZone,
      recordName: props.rootDomain,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(this.distribution),
      ),
    });

    new s3deploy.BucketDeployment(this, "DeployLanding", {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, "../../landing"))],
      destinationBucket: landingBucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "LandingUrl", {
      value: `https://${props.rootDomain}`,
    });
    new cdk.CfnOutput(this, "LandingCloudFrontUrl", {
      value: `https://${this.distribution.distributionDomainName}`,
    });
  }
}
