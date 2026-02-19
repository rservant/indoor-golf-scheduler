/**
 * HTML Sanitization Utility
 * Provides secure methods for handling user input and preventing XSS attacks
 */

export interface SanitizationResult {
  sanitizedContent: string;
  wasModified: boolean;
  removedElements: string[];
  appliedEscaping: string[];
}

export interface SecurityContext {
  sanitizedSearchTerm: string;
  originalSearchTerm: string;
  isInputSafe: boolean;
  sanitizationApplied: string[];
}

export class SecurityValidationError extends Error {
  constructor(
    message: string,
    public readonly input: string,
    public readonly violationType: string
  ) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}

/**
 * Comprehensive HTML sanitization utility for preventing XSS attacks
 */
export class HTMLSanitizer {
  private static readonly MAX_INPUT_LENGTH = 10000;
  private static readonly DANGEROUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^>]*>/gi,
    /<link\b[^>]*>/gi,
    /<meta\b[^>]*>/gi,
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi
  ];

  /**
   * Escape HTML special characters to prevent XSS
   */
  static escapeHTML(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    if (input.length > this.MAX_INPUT_LENGTH) {
      throw new SecurityValidationError(
        'Input exceeds maximum allowed length',
        input.substring(0, 100) + '...',
        'length_exceeded'
      );
    }
    
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Sanitize content for use in HTML attributes
   */
  static sanitizeForAttribute(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    if (input.length > this.MAX_INPUT_LENGTH) {
      throw new SecurityValidationError(
        'Attribute value exceeds maximum allowed length',
        input.substring(0, 100) + '...',
        'attribute_length_exceeded'
      );
    }
    
    // Remove any potentially dangerous characters for attributes
    return input
      .replace(/[<>"'&]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '');
  }

  /**
   * Remove or neutralize script tags and dangerous elements
   */
  static removeScriptTags(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    let sanitized = input;
    
    // Remove dangerous patterns
    this.DANGEROUS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    return sanitized;
  }

  /**
   * Comprehensive sanitization with detailed result
   */
  static sanitizeWithResult(input: string): SanitizationResult {
    if (typeof input !== 'string') {
      const stringInput = String(input);
      return {
        sanitizedContent: stringInput,
        wasModified: input !== stringInput,
        removedElements: [],
        appliedEscaping: ['type_conversion']
      };
    }

    const original = input;
    const removedElements: string[] = [];
    const appliedEscaping: string[] = [];
    
    // Check for dangerous patterns and track what was removed
    this.DANGEROUS_PATTERNS.forEach((pattern, index) => {
      const matches = input.match(pattern);
      if (matches) {
        removedElements.push(...matches);
      }
    });
    
    // Remove dangerous elements
    let sanitized = this.removeScriptTags(input);
    
    // Apply HTML escaping
    const escaped = this.escapeHTML(sanitized);
    
    if (escaped !== sanitized) {
      appliedEscaping.push('html_entities');
    }
    
    return {
      sanitizedContent: escaped,
      wasModified: original !== escaped,
      removedElements,
      appliedEscaping
    };
  }

  /**
   * Validate if search term is safe
   */
  static isValidSearchTerm(input: string): boolean {
    if (typeof input !== 'string') {
      return false;
    }
    
    if (input.length > this.MAX_INPUT_LENGTH) {
      return false;
    }
    
    // Check for dangerous patterns
    return !this.DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
  }

  /**
   * Create a text node safely (alternative to innerHTML)
   */
  static createTextNode(text: string): Text {
    return document.createTextNode(text);
  }

  /**
   * Set text content safely
   */
  static setTextContent(element: HTMLElement, text: string): void {
    element.textContent = text;
  }

  /**
   * Create security context for tracking sanitization
   */
  static createSecurityContext(searchTerm: string): SecurityContext {
    const result = this.sanitizeWithResult(searchTerm);
    
    return {
      sanitizedSearchTerm: result.sanitizedContent,
      originalSearchTerm: searchTerm,
      isInputSafe: !result.wasModified,
      sanitizationApplied: result.appliedEscaping
    };
  }

  /**
   * Sanitize text content (combines removal and escaping)
   */
  static sanitizeText(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    // First remove dangerous elements
    const cleaned = this.removeScriptTags(input);
    
    // Then escape HTML
    return this.escapeHTML(cleaned);
  }

  /**
   * Validate and sanitize URL for href attributes
   */
  static sanitizeURL(url: string): string {
    if (typeof url !== 'string') {
      return '';
    }
    
    // Remove dangerous protocols
    const cleaned = url.replace(/^(javascript|data|vbscript):/gi, '');
    
    // Only allow safe protocols
    if (!/^(https?|mailto|tel|#):/i.test(cleaned) && !cleaned.startsWith('#') && !cleaned.startsWith('/')) {
      return '#';
    }
    
    return this.sanitizeForAttribute(cleaned);
  }

  /**
   * Batch sanitize multiple inputs
   */
  static sanitizeBatch(inputs: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(inputs)) {
      sanitized[key] = this.sanitizeText(value);
    }
    
    return sanitized;
  }
}