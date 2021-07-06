import { createPathMatcher, createLocationMatcher, resolvePath } from '../src/utils';

describe('resolvePath should', () => {
  test('normalize the base arg', () => {
    const expected = '/base';
    const actual = resolvePath('base', '');
    expect(actual).toBe(expected);
  });

  test('normalize the path arg', () => {
    const expected = '/path';
    const actual = resolvePath('', 'path');
    expect(actual).toBe(expected);
  });

  test('normalize the from arg', () => {
    const expected = '/from';
    const actual = resolvePath('', '', 'from');
    expect(actual).toBe(expected);
  });

  test('returns the default path when all ags are empty', () => {
    const expected = '/';
    const actual = resolvePath('', '');
    expect(actual).toBe(expected);
  });

  test('resolve root path against base and ignore from', () => {
    const expected = '/base';
    const actual = resolvePath('/base', '/', '/base/foo');
    expect(actual).toBe(expected);
  });

  test('resolve rooted paths against base and ignore from', () => {
    const expected = '/base/bar';
    const actual = resolvePath('/base', '/bar', '/base/foo');
    expect(actual).toBe(expected);
  });

  test('resolve empty path against from', () => {
    const expected = '/base/foo';
    const actual = resolvePath('/base', '', '/base/foo');
    expect(actual).toBe(expected);
  });

  test('resolve relative paths against from', () => {
    const expected = '/base/foo/bar';
    const actual = resolvePath('/base', 'bar', '/base/foo');
    expect(actual).toBe(expected);
  });

  test('prepend base if from does not start with it', () => {
    const expected = '/base/foo/bar';
    const actual = resolvePath('/base', 'bar', '/foo');
    expect(actual).toBe(expected);
  });

  test(`test start of from against base case-insensitive`, () => {
    const expected = '/BASE/foo/bar';
    const actual = resolvePath('/base', 'bar', 'BASE/foo');
    expect(actual).toBe(expected);
  });
});

describe('createPathMatcher should', () => {
  test('return empty object when location matches simple path', () => {
    const expected = { path: '/foo/bar', params: {}};
    const matcher = createPathMatcher('/foo/bar');
    const match = matcher('/foo/bar');
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test('return null when location does not match', () => {
    const expected = null;
    const matcher = createPathMatcher('/foo/bar');
    const match = matcher('/foo/baz');
    expect(match).toEqual(expected);
  });

  test('return params collection when location matches parameterized path', () => {
    const expected = { path: '/foo/abc-123', params: { id: 'abc-123' }};
    const matcher = createPathMatcher('/foo/:id');
    const match = matcher('/foo/abc-123');
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test('match past end when end when ending in a /*', () => {
    const expected = { path: '/foo/bar', params: {}}
    const matcher = createPathMatcher('/foo/bar/*');
    const match = matcher('/foo/bar/baz');
    expect(match).not.toBe(null);
    expect(match!.path).toBe(expected.path);
    expect(match!.params).toEqual(expected.params);
  });

  test('not match past end when not ending in a /*', () => {
    const expected = null;
    const matcher = createPathMatcher('/foo/bar');
    const match = matcher('/foo/bar/baz');
    expect(match).toBe(expected);
  });
});

describe('createLocationMatcher should', () => {
  test('match past end when end option is false', () => {
    const expected = true;
    const matcher = createLocationMatcher('/foo/bar');
    const match = matcher('/foo/bar/baz');
    expect(match).toBe(expected);
  });

  test('not match past end when end option is true', () => {
    const expected = false;
    const matcher = createLocationMatcher('/foo/bar', true);
    const match = matcher('/foo/bar/baz');
    expect(match).toBe(expected);
  });
});
