import { readFileSync } from 'fs';
import { join } from 'path';

import {
  Record as CloudflareRecord,
  PageRule,
  getZone,
} from '@pulumi/cloudflare';
import {
  ComponentResource,
  ComponentResourceOptions,
  Input,
  ResourceOptions,
} from '@pulumi/pulumi';
import { parse } from 'yaml';

// A record pointing to a server created by Pulumi.
// This will create two DNS records per instance: one for
// IPv4 and one for IPv6.
interface ServerRecord {
  kind: 'server';
  to: string;
}

// A raw DNS record
interface RawRecord {
  kind: 'raw';
  to: string;
  type: string;
  proxied?: boolean;
}

// Use a page rule to perform a redirection
interface RedirectRecord {
  kind: 'redirect';
  to: string;
  path?: string;
  type?: 'permanent' | 'temporary';
}

type RecordSpec = ServerRecord | RawRecord | RedirectRecord;
type RecordSet = Record<string, RecordSpec>;

interface Server {
  v4: Input<string>;
  v6: Input<string>;
}

interface Args {
  // The domains that records can be created for
  domains: string[];
  // The servers that can be automatically mapped
  servers: Record<string, Server>;
}

class Dns extends ComponentResource {
  constructor(name: string, args: Args, opts?: ComponentResourceOptions) {
    super('wafflehacks:infrastructure:Dns', name, { options: opts }, opts);

    const defaultResourceOptions: ResourceOptions = { parent: this };
    const { domains, servers } = args;

    // Load the records and zones
    const recordSets = this.load();
    const zones = this.domainsToZones(domains, defaultResourceOptions);

    // Create the records for each domain
    for (const domain in recordSets) {
      // Get the zone id
      const zone = zones[domain];
      if (!zone)
        throw new Error(
          `not configured to modify records on domain '${domain}'`,
        );

      // Create each subdomain
      const records = recordSets[domain];
      for (const subdomain in records) {
        const record = records[subdomain];

        switch (record.kind) {
          case 'raw':
            new CloudflareRecord(
              `record-raw-${record.type}-${subdomain}.${domain}`,
              {
                name: subdomain,
                ttl: 1,
                type: record.type,
                value: record.to,
                proxied: record.proxied,
                zoneId: zone,
              },
              defaultResourceOptions,
            );
            break;

          case 'redirect':
            const path = record.path || '';
            const statusCode = record.type === 'permanent' ? 301 : 302;

            new PageRule(
              `record-redirect-${subdomain}.${domain}`,
              {
                actions: {
                  forwardingUrl: {
                    statusCode,
                    url: record.to,
                  },
                },
                target: `${subdomain}.${domain}${path}`,
                zoneId: zone,
              },
              defaultResourceOptions,
            );
            break;

          case 'server':
            const server = servers[record.to];
            if (!server)
              throw new Error(`server '${record.to}' does not exist`);

            new CloudflareRecord(
              `record-server-A-${subdomain}.${domain}`,
              {
                name: subdomain,
                ttl: 1,
                type: 'A',
                value: server.v4,
                proxied: true,
                zoneId: zone,
              },
              defaultResourceOptions,
            );
            new CloudflareRecord(
              `record-server-AAAA-${subdomain}.${domain}`,
              {
                name: subdomain,
                ttl: 1,
                type: 'AAAA',
                value: server.v6,
                proxied: true,
                zoneId: zone,
              },
              defaultResourceOptions,
            );
            break;

          default:
            throw new Error(`unknown record kind for '${subdomain}.${domain}'`);
        }
      }
    }

    this.registerOutputs();
  }

  load(): Record<string, RecordSet> {
    const path = join(__dirname, 'records.yml');
    const content = readFileSync(path, {
      encoding: 'utf-8',
    });

    return parse(content);
  }

  domainsToZones(domains: string[], options: ResourceOptions) {
    return domains.reduce<Record<string, Promise<string>>>((obj, name) => {
      obj[name] = getZone({ name }, options).then((z) => z.id);
      return obj;
    }, {});
  }
}

export default Dns;
