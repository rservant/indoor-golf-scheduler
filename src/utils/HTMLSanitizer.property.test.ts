
import * as fc from 'fast-check';
import { HTMLSanitizer } from './HTMLSanitizer';

describe('HTMLSanitizer Property Tests', () => {
    test('sanitizeText should never throw and always return a string', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                const result = HTMLSanitizer.sanitizeText(text);
                return typeof result === 'string';
            })
        );
    });

    test('sanitizeText should not contain script tags', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                const result = HTMLSanitizer.sanitizeText(text);
                return !/<script/i.test(result);
            })
        );
    });

    test('escapeHTML should escape special characters', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                const result = HTMLSanitizer.escapeHTML(text);
                return !/[<>&"']/.test(result) || result.includes('&');
            })
        );
    });
});
