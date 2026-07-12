import { test, expect } from 'vitest';
import { normalizeUrl } from './url';

test('adds https:// when scheme missing', () => {
	expect(normalizeUrl('example.com')).toBe('https://example.com/');
	expect(normalizeUrl('example.com/path')).toBe('https://example.com/path');
});

test('keeps an existing http/https scheme', () => {
	expect(normalizeUrl('http://a.com/')).toBe('http://a.com/');
	expect(normalizeUrl('https://a.com/')).toBe('https://a.com/');
});

test('allows mailto', () => {
	expect(normalizeUrl('mailto:x@y.com')).toBe('mailto:x@y.com');
});

test('rejects unsafe or empty', () => {
	expect(normalizeUrl('javascript:alert(1)')).toBe('');
	expect(normalizeUrl('  ')).toBe('');
	expect(normalizeUrl(null)).toBe('');
});
