// Import the entirety of s3 pending https://github.com/pulumi/pulumi-aws/issues/1925
import { s3 } from '@pulumi/aws';
import { Policy } from '@pulumi/aws/iam';
import {
  ComponentResource,
  CustomResourceOptions,
  Output,
  ResourceOptions,
  interpolate,
} from '@pulumi/pulumi';

interface Args {
  // The name of the bucket to create
  name: string;
}

class CMS extends ComponentResource {
  public readonly policy: Output<string>;

  constructor(name: string, args: Args, opts?: CustomResourceOptions) {
    super('wafflehacks:infrastructure:CMS', name, { options: opts }, opts);

    const defaultResourceOptions: ResourceOptions = { parent: this };
    const { name: bucketName } = args;

    const bucket = new s3.BucketV2(
      `${name}-bucket`,
      {
        bucketPrefix: bucketName,
      },
      defaultResourceOptions,
    );

    new s3.BucketAclV2(
      `${name}-acl`,
      {
        bucket: bucket.id,
        acl: 'private',
      },
      defaultResourceOptions,
    );

    const policy = new Policy(
      `${name}-policy`,
      {
        policy: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                's3:DeleteObject',
                's3:GetObject',
                's3:GetObjectAcl',
                's3:PutObject',
                's3:PutObjectAcl',
              ],
              Resource: [interpolate`arn:aws:s3:::${bucket.id}/*`],
            },
            {
              Effect: 'Allow',
              Action: ['s3:ListBucket'],
              Resource: [interpolate`arn:aws:s3:::${bucket.id}`],
            },
          ],
        },
      },
      defaultResourceOptions,
    );
    this.policy = policy.name;

    this.registerOutputs();
  }
}

export default CMS;
