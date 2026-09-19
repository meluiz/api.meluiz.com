import type { RemoteResourceKind, RemoteResourceSignal } from '../../../schemas';
import type { ProbeContext } from './probe';

import { discard, readBody } from '@/shared/remote';

import { describeFailure, probe } from './probe';

/* ///////////////////////////////////////////////// */

const MAX_IMAGE_BYTES = 5_000_000;
const ICO_TYPES = new Set(['image/x-icon', 'image/vnd.microsoft.icon']);

/* ///////////////////////////////////////////////// */

interface Dimensions {
  width?: number;
  height?: number;
}

const isIco = (bytes: Uint8Array) => {
  // ICONDIR header: reserved 0, type 1 (icon)
  return bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0;
};

/**
 * Largest entry of an ICO file, read from its directory. Bun.Image cannot decode
 * ICO, and without this every classic favicon.ico was reported as broken.
 */
const measureIco = (bytes: Uint8Array): Dimensions | null => {
  if (bytes.byteLength < 6 || !isIco(bytes)) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, true);

  if (count === 0 || bytes.byteLength < 6 + count * 16) {
    return null;
  }

  let width = 0;
  let height = 0;

  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    // A stored 0 means 256 pixels
    width = Math.max(width, view.getUint8(entry) || 256);
    height = Math.max(height, view.getUint8(entry + 1) || 256);
  }

  return { width, height };
};

const svgLength = (tag: string, attribute: 'width' | 'height') => {
  // Only unitless or px lengths are absolute; "100%" or "2em" depend on context.
  // The leading whitespace keeps "stroke-width" from matching.
  const pattern = new RegExp(
    `\\s${attribute}\\s*=\\s*["']?\\s*([\\d.]+)(px)?\\s*["'\\s/>]`,
    'i',
  );
  const value = Number(pattern.exec(tag)?.[1]);

  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** Size of the root <svg> element, falling back to its viewBox. */
const measureSvg = (bytes: Uint8Array): Dimensions => {
  const tag = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(bytes))?.[0] ?? '';
  const viewBox =
    /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);

  return {
    width: svgLength(tag, 'width') ?? (Number(viewBox?.[1]) || undefined),
    height: svgLength(tag, 'height') ?? (Number(viewBox?.[2]) || undefined),
  };
};

const measureImage = async (
  bytes: Uint8Array,
  contentType: string,
): Promise<Dimensions | null> => {
  if (contentType === 'image/svg+xml') {
    return measureSvg(bytes);
  }

  if (ICO_TYPES.has(contentType) || isIco(bytes)) {
    return measureIco(bytes);
  }

  try {
    const { height, width } = await new Bun.Image(bytes).metadata();
    return { width, height };
  } catch {
    return null;
  }
};

/* ///////////////////////////////////////////////// */

/** Fetch a declared image and verify its status, MIME type and real dimensions. */
export const inspectImage = async (
  kind: RemoteResourceKind,
  url: string,
  context: ProbeContext,
): Promise<RemoteResourceSignal> => {
  try {
    const { response } = await probe(url, context, 'image/*');
    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();

    const result: RemoteResourceSignal = { kind, url, status: response.status, contentType };

    if (response.status !== 200) {
      await discard(response);
      return { ...result, error: `The resource responded with status ${response.status}` };
    }

    if (!contentType?.startsWith('image/')) {
      await discard(response);
      return { ...result, error: 'The resource did not return an image MIME type' };
    }

    const { bytes } = await readBody(response, {
      maxBytes: MAX_IMAGE_BYTES,
      overflow: 'throw',
    });
    const dimensions = await measureImage(bytes, contentType);

    if (!dimensions) {
      return {
        ...result,
        bytes: bytes.byteLength,
        error: 'The image body could not be decoded',
      };
    }

    return { ...result, bytes: bytes.byteLength, ...dimensions };
  } catch (cause) {
    return { kind, url, ...describeFailure(cause) };
  }
};
