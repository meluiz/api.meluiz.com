/* ///////////////////////////////////////////////// */

const CHARSET_PRESCAN_BYTES = 1_024;

/* ///////////////////////////////////////////////// */

const charsetFromBom = (bytes: Uint8Array) => {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be';
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le';
  }

  return undefined;
};

const charsetFromContentType = (contentType: string) => {
  return /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType)?.[1];
};

const charsetFromMeta = (bytes: Uint8Array) => {
  // Simplified version of the HTML encoding prescan. Latin-1 maps every byte to
  // one character, so ASCII markup reads correctly whatever the real encoding is.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, CHARSET_PRESCAN_BYTES));
  const label = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1];

  // A <meta> that claims UTF-16 is always wrong: it could not have been read as ASCII
  return label?.toLowerCase().startsWith('utf-16') ? 'utf-8' : label;
};

const createDecoder = (label: string | undefined) => {
  if (label) {
    try {
      return new TextDecoder(label as Bun.Encoding);
    } catch {
      // Unknown labels fall back to UTF-8 instead of failing the whole request
    }
  }

  return new TextDecoder('utf-8');
};

/* ///////////////////////////////////////////////// */

/** Decode an HTML body following the spec's precedence: BOM, transport header, <meta>. */
export const decodeDocument = (bytes: Uint8Array, contentType: string) => {
  const label =
    charsetFromBom(bytes) ?? charsetFromContentType(contentType) ?? charsetFromMeta(bytes);

  return createDecoder(label).decode(bytes);
};
