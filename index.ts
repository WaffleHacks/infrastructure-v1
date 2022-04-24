import {Vpc} from "@pulumi/digitalocean";
import { Config } from "@pulumi/pulumi";

import Dns from "./dns";
import Server from "./server";

const config = new Config();

const vpc = new Vpc("network", {
  ipRange: "10.93.35.0/24",
  name: "waffle-network",
  region: config.require("regions.digitalocean"),
});

const primary = new Server("primary", {
  name: "waffle-primary",
  size: "s-2vcpu-4gb",
  vpcId: vpc.id,
});

new Dns("records", {
  domains: config.requireObject("domains"),
  servers: {
    "waffle-primary": {
      v4: primary.ipv4,
      v6: primary.ipv6,
    }
  },
});
