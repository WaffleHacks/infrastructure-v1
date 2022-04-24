import { Droplet, Firewall } from '@pulumi/digitalocean';
import {
  ComponentResource,
  ComponentResourceOptions,
  Config,
  Input,
  Output,
  ResourceOptions,
} from '@pulumi/pulumi';

const config = new Config();

interface Args {
  // The name for the server
  name: Input<string>;
  // The size slug for the server
  size: Input<string>;
  // The ID of the VPC
  vpcId: Input<string>;
}

class Server extends ComponentResource {
  public readonly droplet: Output<string>;
  public readonly ipv4: Output<string>;
  public readonly ipv6: Output<string>;

  constructor(name: string, args: Args, opts?: ComponentResourceOptions) {
    super('wafflehacks:infrastructure:Server', name, { options: opts }, opts);

    const defaultResourceOptions: ResourceOptions = { parent: this };
    const { name: dropletName, size, vpcId } = args;

    const droplet = new Droplet(
      `${name}-droplet`,
      {
        image: '86718194', // Debian 10 x64
        ipv6: true,
        name: dropletName,
        region: config.require('regions.digitalocean'),
        size,
        vpcUuid: vpcId,
      },
      defaultResourceOptions,
    );

    this.ipv4 = droplet.ipv4Address;
    this.ipv6 = droplet.ipv6Address;
    this.droplet = droplet.dropletUrn;

    new Firewall(
      `${name}-firewall`,
      {
        dropletIds: [droplet.id.apply((id) => parseInt(id))],
        name: dropletName,
        inboundRules: [80, 443].map((port) => ({
          portRange: port.toString(),
          protocol: 'tcp',
          sourceAddresses: ['0.0.0.0/0', '::/0'],
        })),
        outboundRules: [
          {
            portRange: '1-65535',
            protocol: 'udp',
            destinationAddresses: ['0.0.0.0/0', '::/0'],
          },
          {
            portRange: '1-65535',
            protocol: 'tcp',
            destinationAddresses: ['0.0.0.0/0', '::/0'],
          },
        ],
      },
      defaultResourceOptions,
    );

    this.registerOutputs();
  }
}

export default Server;
