// #431 — first real test using the Vitest scaffold set up as part of the
// CRA -> Vite migration (there were no tests under CRA; react-scripts test
// had nothing to run). Picked these three pure helper functions because
// they're the most decision-heavy, easiest-to-get-wrong logic in the
// frontend that has zero React/DOM/fetch dependencies — a genuine test,
// not a placeholder just to prove the harness works.
import { describe, it, expect } from 'vitest';
import { getDisplayName, getInitials, getFirstName } from './userDisplay';

describe('getDisplayName', () => {
  it('prefers a trimmed user_metadata.name when present', () => {
    expect(getDisplayName({ user_metadata: { name: '  Ada Lovelace  ' }, email: 'ada@example.com' })).toBe('Ada Lovelace');
  });

  it('falls back to the email local-part when name is missing', () => {
    expect(getDisplayName({ email: 'ada@example.com' })).toBe('ada');
  });

  it('falls back to "there" when neither name nor email is present', () => {
    expect(getDisplayName({})).toBe('there');
    expect(getDisplayName(null)).toBe('there');
    expect(getDisplayName(undefined)).toBe('there');
  });

  it('treats a whitespace-only name the same as a missing one', () => {
    expect(getDisplayName({ user_metadata: { name: '   ' }, email: 'ada@example.com' })).toBe('ada');
  });
});

describe('getInitials', () => {
  it('returns "?" for empty or missing input', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
  });

  it('takes the first two characters of a single-word name', () => {
    expect(getInitials('ada')).toBe('AD');
  });

  it('takes the first letter of the first and last words for multi-word names', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
    expect(getInitials('Ada Katherine Lovelace')).toBe('AL');
  });
});

describe('getFirstName', () => {
  it('returns the only word for a single-word name', () => {
    expect(getFirstName('Ada')).toBe('Ada');
  });

  it('treats a two-word name as Western "First Last"', () => {
    expect(getFirstName('Ada Lovelace')).toBe('Ada');
  });

  it('splits after a recognised Vietnamese middle-name marker', () => {
    expect(getFirstName('Nguyễn Thị Lan Anh')).toBe('Lan Anh');
    expect(getFirstName('Nguyễn Văn Minh')).toBe('Minh');
  });

  it('falls back to the last word when no marker is recognised', () => {
    expect(getFirstName('Some Unrecognised Format Name')).toBe('Name');
  });

  it('returns an empty string for empty or missing input', () => {
    expect(getFirstName('')).toBe('');
    expect(getFirstName(null)).toBe('');
    expect(getFirstName(undefined)).toBe('');
  });
});
