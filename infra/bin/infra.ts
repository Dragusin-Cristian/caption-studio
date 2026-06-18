#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CaptionStudioStack } from '../lib/caption-studio-stack';
import { AppStagingSynthesizer } from '@aws-cdk/app-staging-synthesizer-alpha';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';

const app = new cdk.App({
  defaultStackSynthesizer: AppStagingSynthesizer.defaultResources({
    appId: "caption-studio",
    stagingBucketEncryption: BucketEncryption.S3_MANAGED,
  }),
});
new CaptionStudioStack(app, "CaptionStudio", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
