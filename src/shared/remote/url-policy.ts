import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { BadGatewayError, BadRequestError } from '@/core/http';

/* ///////////////////////////////////////////////// */

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/* ///////////////////////////////////////////////// */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

const BLOCKED_IPV4_SUBNETS = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata endpoints
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, including broadcast
] as const;

// IPv4-mapped addresses (::ffff:0:0/96) need no entry: BlockList checks them
// against the IPv4 subnets above (verified on Node and Bun). The transition
// ranges below embed an IPv4 address in other ways, so they are blocked whole;
// none of them is needed to reach a public website.
const BLOCKED_IPV6_SUBNETS = [
  ['::', 96], // unspecified, loopback and deprecated IPv4-compatible addresses
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
] as const;

// The Fetch standard's "bad ports": browsers refuse them because they belong to
// protocols (SMTP, SSH, IRC...) that an HTTP request could be smuggled into
const BLOCKED_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101,
  102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427,
  465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990,
  993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667,
  6668, 6669, 6679, 6697, 10080,
]);

const blockedAddresses = new BlockList();

for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

/* ///////////////////////////////////////////////// */

const disallowedHost = () => {
  return new BadRequestError('The URL resolves to a disallowed host');
};

const normalizeHostname = (hostname: string) => {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
};

const isBlockedHostname = (hostname: string) => {
  return (
    hostname === 'localhost' ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
};

const isBlockedAddress = (address: string) => {
  const family = isIP(address);

  if (family === 4) {
    return blockedAddresses.check(address, 'ipv4');
  }

  if (family === 6) {
    return blockedAddresses.check(address, 'ipv6');
  }

  // Anything that is not a valid IP literal is refused rather than guessed at
  return true;
};

const parsePort = (url: URL) => {
  // WHATWG URL leaves the port empty when it matches the protocol default
  if (url.port) {
    return Number(url.port);
  }

  return url.protocol === 'https:' ? 443 : 80;
};

const resolveWithSignal = (
  resolver: HostResolver,
  hostname: string,
  signal?: AbortSignal,
): Promise<readonly ResolvedAddress[]> => {
  if (!signal) {
    return resolver(hostname);
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  // DNS lookups cannot be cancelled; this only stops waiting for the result
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);

    signal.addEventListener('abort', onAbort, { once: true });

    resolver(hostname)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
  });
};

/* ///////////////////////////////////////////////// */

export const resolveHost: HostResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true });
  return addresses.map(({ address, family }) => ({ address, family }));
};

/**
 * Refuse URLs that could reach private infrastructure: non-http(s) protocols,
 * embedded credentials, unsafe ports, internal hostnames, and hosts resolving to
 * any non-public address.
 *
 * Known limitation: the address is checked here, but the fetch resolves the host
 * again on its own. A DNS server that answers differently between the two lookups
 * (DNS rebinding) can slip past this check.
 */
export const assertSafeRemoteUrl = async (
  input: string,
  resolver: HostResolver = resolveHost,
  signal?: AbortSignal,
) => {
  const url = URL.parse(input);

  if (!url) {
    throw new BadRequestError('The URL is not valid');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BadRequestError('The URL protocol is not supported');
  }

  if (url.username || url.password) {
    throw new BadRequestError('URLs containing credentials are not supported');
  }

  if (BLOCKED_PORTS.has(parsePort(url))) {
    throw new BadRequestError('The URL port is not allowed');
  }

  // WHATWG URL already canonicalizes numeric hosts ("2130706433", "0x7f.1", "127.1")
  // into dotted IPv4, so the literal check below sees the real address
  const hostname = normalizeHostname(url.hostname);

  if (!hostname || isBlockedHostname(hostname)) {
    throw disallowedHost();
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw disallowedHost();
    }

    return url;
  }

  let addresses: readonly ResolvedAddress[];

  try {
    addresses = await resolveWithSignal(resolver, hostname, signal);
  } catch (cause) {
    if (signal?.aborted) {
      throw cause;
    }

    throw new BadGatewayError('The resource host could not be resolved', undefined, cause);
  }

  if (addresses.length === 0) {
    throw new BadGatewayError('The resource host could not be resolved');
  }

  // Every address must be public: the client may connect to any of them
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw disallowedHost();
  }

  return url;
};
