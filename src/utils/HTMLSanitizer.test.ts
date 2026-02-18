import { HTMLSanitizer, SecurityValidationError } from './HTMLSanitizer';

describe('HTMLSanitizer', () => {
    describe('escapeHTML', () => {
        it('escapes all HTML special characters', () => {
            const result = HTMLSanitizer.escapeHTML('<script>alert("xss")</script>');
            expect(result).toContain('&lt;');
            expect(result).toContain('&gt;');
            expect(result).toContain('&quot;');
            expect(result).not.toContain('<script>');
        });

        it('escapes ampersands', () => {
            expect(HTMLSanitizer.escapeHTML('a & b')).toBe('a &amp; b');
        });

        it('escapes single quotes', () => {
            expect(HTMLSanitizer.escapeHTML("it's")).toBe('it&#x27;s');
        });

        it('returns unchanged string when no special chars present', () => {
            expect(HTMLSanitizer.escapeHTML('hello world')).toBe('hello world');
        });

        it('handles empty string', () => {
            expect(HTMLSanitizer.escapeHTML('')).toBe('');
        });

        it('converts non-string input to string', () => {
            expect(HTMLSanitizer.escapeHTML(42 as any)).toBe('42');
        });

        it('throws SecurityValidationError for oversized input', () => {
            const longInput = 'a'.repeat(10001);
            expect(() => HTMLSanitizer.escapeHTML(longInput)).toThrow(SecurityValidationError);
        });
    });

    describe('sanitizeForAttribute', () => {
        it('removes dangerous characters from attribute values', () => {
            const result = HTMLSanitizer.sanitizeForAttribute('value" onclick="alert(1)');
            expect(result).not.toContain('"');
            expect(result).not.toContain('onclick=');
        });

        it('removes javascript: protocol', () => {
            const result = HTMLSanitizer.sanitizeForAttribute('javascript:alert(1)');
            expect(result).not.toContain('javascript:');
        });
    });

    describe('removeScriptTags', () => {
        it('removes script tags and content', () => {
            const result = HTMLSanitizer.removeScriptTags('<p>safe</p><script>evil()</script>');
            expect(result).not.toContain('<script');
            expect(result).toContain('<p>safe</p>');
        });

        it('removes iframe tags', () => {
            const result = HTMLSanitizer.removeScriptTags('<iframe src="evil.html"></iframe>');
            expect(result).not.toContain('<iframe');
        });
    });

    describe('sanitizeWithResult', () => {
        it('reports when content was modified', () => {
            const result = HTMLSanitizer.sanitizeWithResult('<b>bold & "quoted"</b>');
            expect(result.wasModified).toBe(true);
            expect(result.appliedEscaping).toContain('html_entities');
        });

        it('tracks removed elements', () => {
            const result = HTMLSanitizer.sanitizeWithResult('<script>bad()</script> safe text');
            expect(result.removedElements.length).toBeGreaterThan(0);
        });
    });

    describe('isValidSearchTerm', () => {
        it('returns true for safe input', () => {
            expect(HTMLSanitizer.isValidSearchTerm('golf schedule')).toBe(true);
        });

        it('returns false for input with script tags', () => {
            expect(HTMLSanitizer.isValidSearchTerm('<script>alert(1)</script>')).toBe(false);
        });

        it('returns false for non-string input', () => {
            expect(HTMLSanitizer.isValidSearchTerm(null as any)).toBe(false);
        });

        it('returns false for oversized input', () => {
            expect(HTMLSanitizer.isValidSearchTerm('a'.repeat(10001))).toBe(false);
        });
    });

    describe('sanitizeURL', () => {
        it('allows https URLs', () => {
            expect(HTMLSanitizer.sanitizeURL('https://example.com')).not.toBe('#');
        });

        it('blocks javascript: URLs', () => {
            const result = HTMLSanitizer.sanitizeURL('javascript:alert(1)');
            expect(result).not.toContain('javascript:');
        });

        it('returns # for unknown protocols', () => {
            expect(HTMLSanitizer.sanitizeURL('ftp://dangerous.com')).toBe('#');
        });

        it('allows relative paths', () => {
            expect(HTMLSanitizer.sanitizeURL('/page')).not.toBe('#');
        });

        it('allows hash links', () => {
            expect(HTMLSanitizer.sanitizeURL('#section')).not.toBe('#');
        });
    });

    describe('sanitizeBatch', () => {
        it('sanitizes all values in the record', () => {
            const result = HTMLSanitizer.sanitizeBatch({
                name: '<b>John</b>',
                bio: 'A & B',
            });
            expect(result.name).not.toContain('<b>');
            expect(result.bio).toContain('&amp;');
        });
    });

    describe('createSecurityContext', () => {
        it('creates context for safe input', () => {
            const ctx = HTMLSanitizer.createSecurityContext('golf');
            expect(ctx.isInputSafe).toBe(true);
            expect(ctx.originalSearchTerm).toBe('golf');
        });

        it('creates context for unsafe input', () => {
            const ctx = HTMLSanitizer.createSecurityContext('<script>bad</script>');
            expect(ctx.isInputSafe).toBe(false);
        });
    });
});
