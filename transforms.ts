import { Ruleset } from '@pulumi/cloudflare';
import {
  RulesetRule,
  RulesetRuleActionParametersHeader,
} from '@pulumi/cloudflare/types/input';
import {
  ComponentResource,
  ComponentResourceOptions,
  ResourceOptions,
} from '@pulumi/pulumi';

import { domainsToZones, loadConfig } from './utils';

// The types of transforms that can be applied to a domain
interface DomainTransform {
  requestHeaders?: HeaderModification[];
  responseHeaders?: HeaderModification[];
}

// The fields present on every type of transformation
interface BaseModification {
  // A description of what the transform does
  description: string;
  // Whether to disable the rule
  disabled?: boolean;
  // An expression for when the transform should execute
  when: string;
}

// An expression to evaluate for the header's value
interface DynamicHeader {
  name: string;
  expression: string;
}

// A static value to apply to a header
interface StaticHeader {
  name: string;
  value: string;
}

// Modifies the request/response headers
interface HeaderModification extends BaseModification {
  dynamic?: DynamicHeader[];
  remove?: string[];
  static?: StaticHeader[];
}

interface Args {
  // The domains that the rules should be applied to
  domains: string[];
}

class Transforms extends ComponentResource {
  constructor(name: string, args: Args, opts?: ComponentResourceOptions) {
    super(
      'wafflehacks:infrastructure:Transforms',
      name,
      { options: opts },
      opts,
    );

    const defaultResourceOptions: ResourceOptions = { parent: this };
    const { domains } = args;

    // Load the specification and zones
    const transformSets =
      loadConfig<Record<string, DomainTransform>>('transforms.yml');
    const zones = domainsToZones(domains, defaultResourceOptions);

    // Create the transform rules for each domain
    for (const domain in transformSets) {
      // Get the zone id
      const zone = zones[domain];
      if (!zone)
        throw new Error(`not configured to modify records on domain ${domain}`);

      // Create all the rules
      const spec = transformSets[domain];
      if (spec.requestHeaders) {
        new Ruleset(
          `ruleset-request-headers-${domain}`,
          {
            kind: 'zone',
            zoneId: zone,
            name: 'default',
            phase: 'http_request_late_transform',
            rules: this.headerRules(spec.requestHeaders),
          },
          defaultResourceOptions,
        );
      }
      if (spec.responseHeaders) {
        new Ruleset(
          `ruleset-response-headers-${domain}`,
          {
            kind: 'zone',
            zoneId: zone,
            name: 'default',
            phase: 'http_response_headers_transform',
            rules: this.headerRules(spec.responseHeaders),
          },
          defaultResourceOptions,
        );
      }
    }

    this.registerOutputs();
  }

  headerRules = (modifications: HeaderModification[]): RulesetRule[] =>
    modifications.map((m) => ({
      action: 'rewrite',
      description: m.description,
      expression: m.when === 'always' ? 'true' : m.when,
      enabled: !m.disabled,
      actionParameters: {
        headers: this.buildHeaders(m.dynamic, m.remove, m.static),
      },
    }));

  buildHeaders(
    dynamics: DynamicHeader[] = [],
    removes: string[] = [],
    statics: StaticHeader[] = [],
  ): RulesetRuleActionParametersHeader[] {
    const headers: RulesetRuleActionParametersHeader[] = [];

    for (const d of dynamics) headers.push({ ...d, operation: 'set' });
    for (const s of statics) headers.push({ ...s, operation: 'set' });
    for (const r of removes) headers.push({ operation: 'remove', name: r });

    return headers;
  }
}

export default Transforms;
