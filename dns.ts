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
  CustomResourceOptions,
  Input,
  ResourceOptions,
} from '@pulumi/pulumi';
import { parse } from 'yaml';

// Proxies the request through Cloudflare, but doesn't route anywhere
interface ProxyRecord {
  kind: 'proxy';
}

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
  priority?: number;
}

type RecordSpec = ProxyRecord | RawRecord | RedirectRecord | ServerRecord;
type RecordSet = Record<string, RecordSpec | RecordSpec[]>;

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
    const recordResourceOptions: CustomResourceOptions = {
      parent: this,
      deleteBeforeReplace: true,
    };
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
      const subdomains = recordSets[domain];
      for (const subdomain in subdomains) {
        const record = subdomain === '@' ? domain : `${subdomain}.${domain}`;

        const maybeSpecs = subdomains[subdomain];
        const specs = Array.isArray(maybeSpecs) ? maybeSpecs : [maybeSpecs];

        // Create all the specs
        for (const spec of specs) {
          switch (spec.kind) {
            case 'proxy':
              new CloudflareRecord(
                `record-proxy-${record}`,
                {
                  name: record,
                  ttl: 1,
                  type: 'AAAA',
                  value: '100::', // IPv6 discard prefix
                  proxied: true,
                  zoneId: zone,
                },
                recordResourceOptions,
              );
              break;

            case 'raw':
              new CloudflareRecord(
                `record-raw-${spec.type}-${record}`,
                {
                  name: record,
                  ttl: 1,
                  type: spec.type,
                  value: spec.to,
                  proxied: spec.proxied,
                  zoneId: zone,
                },
                recordResourceOptions,
              );
              break;

            case 'redirect':
              const path = spec.path || '';
              const statusCode = spec.type === 'permanent' ? 301 : 302;

              new PageRule(
                `record-redirect-${record}`,
                {
                  actions: {
                    forwardingUrl: {
                      statusCode,
                      url: spec.to,
                    },
                  },
                  priority: spec.priority,
                  target: record + path,
                  zoneId: zone,
                },
                defaultResourceOptions,
              );
              break;

            case 'server':
              const server = servers[spec.to];
              if (!server)
                throw new Error(`server '${spec.to}' does not exist`);

              new CloudflareRecord(
                `record-server-A-${record}`,
                {
                  name: record,
                  ttl: 1,
                  type: 'A',
                  value: server.v4,
                  proxied: true,
                  zoneId: zone,
                },
                recordResourceOptions,
              );
              new CloudflareRecord(
                `record-server-AAAA-${record}`,
                {
                  name: record,
                  ttl: 1,
                  type: 'AAAA',
                  value: server.v6,
                  proxied: true,
                  zoneId: zone,
                },
                recordResourceOptions,
              );
              break;

            default:
              throw new Error(`unknown record kind for '${record}'`);
          }
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
