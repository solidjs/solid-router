// We want to ensure the characters "%" and "/" remain in percent-encoded
// form when normalizing paths, so replace them with their encoded form after
// decoding the rest of the path
const SEGMENT_RESERVED_CHARS = /%|\//g;
export function normalizeSegment(segment: string): string {
  if (segment.length < 3 || segment.indexOf("%") === -1) return segment;
  return decodeURIComponent(segment).replace(
    SEGMENT_RESERVED_CHARS,
    encodeURIComponent
  );
}

// We do not want to encode these characters when generating dynamic path segments
// See https://tools.ietf.org/html/rfc3986#section-3.3
// sub-delims: "!", "$", "&", "'", "(", ")", "*", "+", ",", ";", "="
// others allowed by RFC 3986: ":", "@"
//
// First encode the entire path segment, then decode any of the encoded special chars.
//
// The chars "!", "'", "(", ")", "*" do not get changed by `encodeURIComponent`,
// so the possible encoded chars are:
// ['%24', '%26', '%2B', '%2C', '%3B', '%3D', '%3A', '%40'].
const PATH_SEGMENT_ENCODINGS = /%(?:2[46BC]|3[ABD]|40)/g;

export function encodePathSegment(str: string): string {
  return encodeURIComponent(str).replace(
    PATH_SEGMENT_ENCODINGS,
    decodeURIComponent
  );
}
