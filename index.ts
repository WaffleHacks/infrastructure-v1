import { ProjectResources, Vpc, getProject } from '@pulumi/digitalocean';
import { Config } from '@pulumi/pulumi';
import ApplicationPortal from '@wafflehacks/application-portal';
import DiscordLinking from '@wafflehacks/discord-linking';
import Mailer from '@wafflehacks/mailer';

import CMS from './cms';
import DNS from './dns';
import Server from './server';
import Transforms from './transforms';
import Vault from './vault';

const config = new Config();

const project = getProject({
  name: config.require('project'),
});

const vpc = new Vpc('network', {
  ipRange: '10.93.35.0/24',
  name: 'waffle-network',
  region: config.require('regions.digitalocean'),
});

const primary = new Server('primary', {
  name: 'waffle-primary',
  size: 's-2vcpu-4gb',
  vpcId: vpc.id,
});

new ProjectResources('project-resources', {
  project: project.then((p) => p.id),
  resources: [primary.droplet],
});

new DNS('records', {
  domains: config.requireObject('domains'),
  servers: {
    'waffle-primary': {
      v4: primary.ipv4,
      v6: primary.ipv6,
    },
  },
});
new Transforms('transforms', { domains: config.requireObject('domains') });

// Configure the applications
const applicationPortal = new ApplicationPortal('application-portal', {
  domain: 'apply.wafflehacks.org',
  resumesBucket: 'wafflehacks-resumes',
  profilesTopic: config.requireSecret('application-portal.profiles-topic'),
});
const cms = new CMS('cms', {
  name: 'wafflehacks-cms',
  fromAddress: 'cms@wafflehacks.org',
});
const discordLinking = new DiscordLinking('discord-linking', {
  domain: 'discord.wafflehacks.org',
  region: 'us-west-2',
  apiGateway: config.requireSecret('profiles.api-gateway'),
});
const mailer = new Mailer('mailer', {
  fromDomains: config.requireObject('email-domains'),
});

// Setup the AWS configuration for Hashicorp Vault
new Vault('vault', {
  path: '/wafflehacks/',
  policies: [
    ...applicationPortal.policies,
    cms.policy,
    discordLinking.policy,
    mailer.policy,
  ],
});
