import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { BadGatewayError, BadRequestError } from '#util/errors';

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

const normalizeHostname = (hostname: string) => {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
};

const isBlockedHostname = (hostname: string) => {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa')
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

  return true;
};

export const resolveHost: HostResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true });
  return addresses.map(({ address, family }) => ({ address, family }));
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

export const assertSafeRemoteUrl = async (
  input: string,
  resolver: HostResolver = resolveHost,
  signal?: AbortSignal,
) => {
  let url: URL;

  try {
    url = new URL(input);
  } catch (cause) {
    throw new BadRequestError('The URL is not valid', undefined, cause);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestError('The URL protocol is not supported');
  }

  if (url.username || url.password) {
    throw new BadRequestError('URLs containing credentials are not supported');
  }

  const hostname = normalizeHostname(url.hostname);

  if (!hostname || isBlockedHostname(hostname)) {
    throw new BadRequestError('The URL resolves to a disallowed host');
  }

  const literalFamily = isIP(hostname);

  if (literalFamily) {
    if (isBlockedAddress(hostname)) {
      throw new BadRequestError('The URL resolves to a disallowed host');
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

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new BadRequestError('The URL resolves to a disallowed host');
  }

  return url;
};
