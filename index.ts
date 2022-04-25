import { ProjectResources, Vpc, getProject } from '@pulumi/digitalocean';
import { Config } from '@pulumi/pulumi';

import CMS from './cms';
import DNS from './dns';
import Server from './server';
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

// Configure the applications
// const cms = new CMS('cms', { name: 'wafflehacks-cms' });

// Setup the AWS configuration for Hashicorp Vault
new Vault('vault', { path: '/wafflehacks/', policies: [] });
