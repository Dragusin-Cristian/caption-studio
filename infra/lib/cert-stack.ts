import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

interface CertStackProps extends cdk.StackProps {
  rootDomain: string;
  appDomain: string;
}

export class CertStack extends cdk.Stack {
  readonly hostedZone: route53.IHostedZone;
  readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);

    const zone = new route53.HostedZone(this, "Zone", {
      zoneName: props.rootDomain,
    });
    this.hostedZone = zone;

    this.certificate = new acm.Certificate(this, "Cert", {
      domainName: props.rootDomain,
      subjectAlternativeNames: [props.appDomain],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    new cdk.CfnOutput(this, "Nameservers", {
      description: "Paste these into Namecheap > Domain > Nameservers > Custom DNS",
      value: cdk.Fn.join(",", zone.hostedZoneNameServers ?? []),
    });
  }
}
