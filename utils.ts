import { readFileSync } from 'fs';
import { join } from 'path';

import { getZone } from '@pulumi/cloudflare';
import { ResourceOptions } from '@pulumi/pulumi';
import { parse } from 'yaml';

/**
 * Convert a list of domains to a map of the domain to its Cloudflare zone ID
 * @param domains the domains to convert
 * @param options options for the resources
 */
export function domainsToZones(
  domains: string[],
  options: ResourceOptions,
): Record<string, Promise<string>> {
  return domains.reduce<Record<string, Promise<string>>>((obj, name) => {
    obj[name] = getZone({ name }, options).then((z) => z.id);
    return obj;
  }, {});
}

/**
 * Load configuration from a file into the specified type
 * @param file the file name to load
 */
export function loadConfig<T>(file: string): T {
  const path = join(__dirname, file);
  const content = readFileSync(path, { encoding: 'utf-8' });
  return parse(content);
}
