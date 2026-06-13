#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CaptionStudioStack } from '../lib/caption-studio-stack';

const app = new cdk.App();
new CaptionStudioStack(app, "CaptionStudio", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
