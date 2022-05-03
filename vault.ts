import { getCallerIdentity } from '@pulumi/aws';
import { Policy, User, UserPolicyAttachment } from '@pulumi/aws/iam';
import {
  ComponentResource,
  CustomResourceOptions,
  Input,
  ResourceOptions,
  interpolate,
} from '@pulumi/pulumi';

interface Args {
  // The path to prefix resources with
  path?: string;
  // The policies that can be assigned by the vault user
  policies?: Input<string>[];
}

class Vault extends ComponentResource {
  constructor(name: string, args: Args, opts?: CustomResourceOptions) {
    super('wafflehacks:infrastructure:Vault', name, { options: opts }, opts);

    const defaultResourceOptions: ResourceOptions = { parent: this };
    const { path = '/', policies = [] } = args;

    const accountId = getCallerIdentity({}).then((c) => c.accountId);

    const policy = new Policy(
      `${name}-policy`,
      {
        name,
        description:
          'Allows a Hashicorp Vault instance to manage AWS credentials',
        policy: {
          Version: '2012-10-17',
          Statement: [
            {
              // Allow creating access keys and managing vault-created users
              Effect: 'Allow',
              Action: [
                'iam:CreateAccessKey',
                'iam:DeleteAccessKey',
                'iam:DeleteUser',
                'iam:ListAccessKeys',
                'iam:ListAttachedUserPolicies',
                'iam:ListGroupsForUser',
                'iam:ListUserPolicies',
              ],
              Resource: [interpolate`arn:aws:iam::${accountId}:user/vault-*`],
            },
            {
              // Allow assigning policies and creating users with policies
              Effect: 'Allow',
              Action: [
                'iam:AttachUserPolicy',
                'iam:CreateUser',
                'iam:DeleteUserPolicy',
                'iam:DetachUserPolicy',
                'iam:PutUserPolicy',
              ],
              Resource: [interpolate`arn:aws:iam::${accountId}:user/vault-*`],
              Condition: {
                StringEquals: {
                  'iam:PermissionsBoundary': policies.map(
                    (policy) =>
                      interpolate`arn:aws:iam::${accountId}:policy/${policy}`,
                  ),
                },
              },
            },
            {
              // Allow rotating the current user's access token
              Effect: 'Allow',
              Action: [
                'iam:CreateAccessKey',
                'iam:DeleteAccessKey',
                'iam:GetUser',
              ],
              Resource: [
                interpolate`arn:aws:iam::${accountId}:user${path}\${aws:username}`,
              ],
            },
          ],
        },
      },
      defaultResourceOptions,
    );

    const user = new User(
      `${name}-user`,
      {
        name,
        path,
      },
      defaultResourceOptions,
    );

    new UserPolicyAttachment(
      `${name}-policy-attachment`,
      {
        user: user.name,
        policyArn: policy.arn,
      },
      defaultResourceOptions,
    );

    this.registerOutputs();
  }
}

export default Vault;
