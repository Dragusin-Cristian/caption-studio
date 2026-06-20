#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ClientStack } from '../lib/client-stack';
import { BackendStack } from '../lib/backend-stack';
import { CertStack } from '../lib/cert-stack';
import { AppStagingSynthesizer } from '@aws-cdk/app-staging-synthesizer-alpha';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';

const app = new cdk.App({
  defaultStackSynthesizer: AppStagingSynthesizer.defaultResources({
    appId: "caption-studio",
    stagingBucketEncryption: BucketEncryption.S3_MANAGED,
  }),
});

const ROOT_DOMAIN = "caption-studio.site";
const APP_DOMAIN = "app.caption-studio.site";

const certStack = new CertStack(app, "CaptionStudioCert", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  crossRegionReferences: true,
  rootDomain: ROOT_DOMAIN,
  appDomain: APP_DOMAIN,
});

const clientStack = new ClientStack(app, "CaptionStudioClient", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  crossRegionReferences: true,
  appDomain: APP_DOMAIN,
  hostedZone: certStack.hostedZone,
  certificate: certStack.certificate,
});

new BackendStack(app, "CaptionStudioBackend", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  appDomain: APP_DOMAIN,
  distribution: clientStack.distribution,
});
