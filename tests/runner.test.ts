import { normalizeOutput } from '../src/core/runner';

describe('normalizeOutput', () => {
    test('passes through a clean single line', () => {
        expect(normalizeOutput('hello')).toBe('hello');
    });

    test('strips trailing spaces from each line', () => {
        expect(normalizeOutput('abc   \ndef  ')).toBe('abc\ndef');
    });

    test('strips trailing blank lines', () => {
        expect(normalizeOutput('answer\n\n\n')).toBe('answer');
    });

    test('preserves internal blank lines', () => {
        expect(normalizeOutput('a\n\nb')).toBe('a\n\nb');
    });

    test('handles empty string', () => {
        expect(normalizeOutput('')).toBe('');
    });

    test('handles only whitespace', () => {
        expect(normalizeOutput('   \n   \n')).toBe('');
    });

    test('strips trailing spaces and trailing blank lines together', () => {
        expect(normalizeOutput('1 2  \n3  \n\n')).toBe('1 2\n3');
    });

    test('preserves leading whitespace (indentation)', () => {
        expect(normalizeOutput('  2\n  3')).toBe('  2\n  3');
    });
});
