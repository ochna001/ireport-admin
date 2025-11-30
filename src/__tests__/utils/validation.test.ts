/**
 * Validation Utility Tests
 * Tests for input validation functions used across the admin app
 */

import { describe, it, expect } from 'vitest';

// ============================================
// VALIDATION FUNCTIONS (extracted for testing)
// ============================================

/**
 * Validates email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validates Philippine phone number format
 * Accepts: +63 9XX XXX XXXX, 09XX XXX XXXX, 09XXXXXXXXX
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s\-]/g, '');
  // Philippine mobile: starts with 09 or +639, 11-12 digits
  const phMobileRegex = /^(\+63|0)9\d{9}$/;
  return phMobileRegex.test(cleaned);
};

/**
 * Validates name (letters, spaces, hyphens, apostrophes)
 */
export const isValidName = (name: string): boolean => {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  // Allow letters (including accented), spaces, hyphens, apostrophes
  const nameRegex = /^[a-zA-ZÀ-ÿ\s\-']+$/;
  return nameRegex.test(trimmed);
};

/**
 * Validates password strength
 * Requirements: 8+ chars, uppercase, lowercase, number
 */
export const isValidPassword = (password: string): boolean => {
  return password.length >= 8 &&
         /[A-Z]/.test(password) &&
         /[a-z]/.test(password) &&
         /[0-9]/.test(password);
};

/**
 * Validates UUID format
 */
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validates incident status
 */
export const isValidStatus = (status: string): boolean => {
  const validStatuses = ['pending', 'assigned', 'in_progress', 'resolved', 'closed'];
  return validStatuses.includes(status.toLowerCase());
};

/**
 * Validates agency type
 */
export const isValidAgencyType = (type: string): boolean => {
  const validTypes = ['pnp', 'bfp', 'pdrrmo'];
  return validTypes.includes(type.toLowerCase());
};

/**
 * Sanitizes string input to prevent XSS
 */
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Calculates age from date of birth
 */
export const calculateAge = (dob: string): number => {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// ============================================
// TEST SUITES
// ============================================

describe('Email Validation', () => {
  it('should accept valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.org')).toBe(true);
    expect(isValidEmail('officer@pnp.gov.ph')).toBe(true);
    expect(isValidEmail('admin+test@ireport.com')).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('no@domain')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
    expect(isValidEmail('double@@at.com')).toBe(false);
  });

  it('should trim whitespace', () => {
    expect(isValidEmail('  test@example.com  ')).toBe(true);
  });
});

describe('Phone Number Validation', () => {
  it('should accept valid Philippine mobile numbers', () => {
    expect(isValidPhoneNumber('09171234567')).toBe(true);
    expect(isValidPhoneNumber('0917-123-4567')).toBe(true);
    expect(isValidPhoneNumber('0917 123 4567')).toBe(true);
    expect(isValidPhoneNumber('+639171234567')).toBe(true);
    expect(isValidPhoneNumber('+63 917 123 4567')).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    expect(isValidPhoneNumber('')).toBe(false);
    expect(isValidPhoneNumber('1234567890')).toBe(false);
    expect(isValidPhoneNumber('08171234567')).toBe(false); // Wrong prefix
    expect(isValidPhoneNumber('091712345')).toBe(false); // Too short
    expect(isValidPhoneNumber('091712345678')).toBe(false); // Too long
    expect(isValidPhoneNumber('abcdefghijk')).toBe(false);
  });
});

describe('Name Validation', () => {
  it('should accept valid names', () => {
    expect(isValidName('Juan Dela Cruz')).toBe(true);
    expect(isValidName('María José')).toBe(true);
    expect(isValidName("O'Brien")).toBe(true);
    expect(isValidName('Anne-Marie')).toBe(true);
    expect(isValidName('José García')).toBe(true);
  });

  it('should reject invalid names', () => {
    expect(isValidName('')).toBe(false);
    expect(isValidName('A')).toBe(false); // Too short
    expect(isValidName('Name123')).toBe(false); // Contains numbers
    expect(isValidName('Name@Special')).toBe(false); // Special chars
    expect(isValidName('<script>alert(1)</script>')).toBe(false); // XSS attempt
  });

  it('should enforce length limits', () => {
    expect(isValidName('AB')).toBe(true); // Minimum 2
    expect(isValidName('A'.repeat(100))).toBe(true); // Max 100
    expect(isValidName('A'.repeat(101))).toBe(false); // Over max
  });
});

describe('Password Validation', () => {
  it('should accept strong passwords', () => {
    expect(isValidPassword('Password1')).toBe(true);
    expect(isValidPassword('SecurePass123')).toBe(true);
    expect(isValidPassword('MyP@ssw0rd!')).toBe(true);
    expect(isValidPassword('Abcdefg1')).toBe(true);
  });

  it('should reject weak passwords', () => {
    expect(isValidPassword('')).toBe(false);
    expect(isValidPassword('short1A')).toBe(false); // Too short
    expect(isValidPassword('nouppercase1')).toBe(false);
    expect(isValidPassword('NOLOWERCASE1')).toBe(false);
    expect(isValidPassword('NoNumbers')).toBe(false);
    expect(isValidPassword('12345678')).toBe(false); // No letters
  });
});

describe('UUID Validation', () => {
  it('should accept valid UUIDs', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    expect(isValidUUID('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(true); // Uppercase
  });

  it('should reject invalid UUIDs', () => {
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // Incomplete
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false); // No dashes
    expect(isValidUUID('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false); // Invalid chars
  });
});

describe('Status Validation', () => {
  it('should accept valid statuses', () => {
    expect(isValidStatus('pending')).toBe(true);
    expect(isValidStatus('assigned')).toBe(true);
    expect(isValidStatus('in_progress')).toBe(true);
    expect(isValidStatus('resolved')).toBe(true);
    expect(isValidStatus('closed')).toBe(true);
    expect(isValidStatus('PENDING')).toBe(true); // Case insensitive
  });

  it('should reject invalid statuses', () => {
    expect(isValidStatus('')).toBe(false);
    expect(isValidStatus('invalid')).toBe(false);
    expect(isValidStatus('open')).toBe(false);
    expect(isValidStatus('completed')).toBe(false);
  });
});

describe('Agency Type Validation', () => {
  it('should accept valid agency types', () => {
    expect(isValidAgencyType('pnp')).toBe(true);
    expect(isValidAgencyType('bfp')).toBe(true);
    expect(isValidAgencyType('pdrrmo')).toBe(true);
    expect(isValidAgencyType('PNP')).toBe(true); // Case insensitive
  });

  it('should reject invalid agency types', () => {
    expect(isValidAgencyType('')).toBe(false);
    expect(isValidAgencyType('police')).toBe(false);
    expect(isValidAgencyType('fire')).toBe(false);
    expect(isValidAgencyType('invalid')).toBe(false);
  });
});

describe('Input Sanitization', () => {
  it('should escape HTML special characters', () => {
    expect(sanitizeInput('<script>')).toBe('&lt;script&gt;');
    expect(sanitizeInput('"quoted"')).toBe('&quot;quoted&quot;');
    expect(sanitizeInput("it's")).toBe("it&#x27;s");
    expect(sanitizeInput('path/to/file')).toBe('path&#x2F;to&#x2F;file');
  });

  it('should handle XSS attempts', () => {
    const xssAttempt = '<script>alert("XSS")</script>';
    const sanitized = sanitizeInput(xssAttempt);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('</script>');
  });

  it('should preserve safe text', () => {
    expect(sanitizeInput('Hello World')).toBe('Hello World');
    expect(sanitizeInput('Normal text 123')).toBe('Normal text 123');
  });
});

describe('Age Calculation', () => {
  it('should calculate age correctly', () => {
    const today = new Date();
    const year = today.getFullYear();
    
    // Someone born 25 years ago today
    const dob25 = `${year - 25}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(calculateAge(dob25)).toBe(25);
    
    // Someone born 30 years ago, 6 months ago
    const month6Ago = new Date(today);
    month6Ago.setMonth(month6Ago.getMonth() - 6);
    const dob30 = `${year - 30}-${String(month6Ago.getMonth() + 1).padStart(2, '0')}-${String(month6Ago.getDate()).padStart(2, '0')}`;
    expect(calculateAge(dob30)).toBe(30);
  });

  it('should handle birthday not yet occurred this year', () => {
    const today = new Date();
    const year = today.getFullYear();
    
    // Birthday is next month
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dobFuture = `${year - 20}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-15`;
    expect(calculateAge(dobFuture)).toBe(19); // Not 20 yet
  });
});
