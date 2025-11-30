/**
 * Security Tests for iReport Admin
 * Tests for authentication, authorization, and security vulnerabilities
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================
// SECURITY UTILITIES
// ============================================

/**
 * Checks if input contains potential SQL injection patterns
 */
export const containsSQLInjection = (input: string): boolean => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b)/i,
    /(\b(UNION|JOIN|WHERE|FROM|INTO)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\bOR\b\s+\d+\s*=\s*\d+)/i,
    /(\bAND\b\s+\d+\s*=\s*\d+)/i,
    /('|\"|;)/,
  ];
  
  return sqlPatterns.some(pattern => pattern.test(input));
};

/**
 * Checks if input contains potential XSS patterns
 */
export const containsXSS = (input: string): boolean => {
  const xssPatterns = [
    /<script\b[^>]*>/i,
    /<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<svg.*onload/i,
    /data:text\/html/i,
  ];
  
  return xssPatterns.some(pattern => pattern.test(input));
};

/**
 * Validates that a token/session is not expired
 */
export const isTokenExpired = (expiresAt: number): boolean => {
  return Date.now() >= expiresAt * 1000;
};

/**
 * Checks password against common weak passwords
 */
export const isCommonPassword = (password: string): boolean => {
  const commonPasswords = [
    'password', 'password1', 'password123', '123456', '12345678',
    'qwerty', 'abc123', 'monkey', 'master', 'dragon',
    'letmein', 'login', 'admin', 'welcome', 'iloveyou',
    'Password1', 'Password123', 'Admin123', 'Welcome1',
  ];
  return commonPasswords.includes(password.toLowerCase()) || 
         commonPasswords.includes(password);
};

/**
 * Validates role-based access
 */
export const hasPermission = (
  userRole: string, 
  requiredRoles: string[]
): boolean => {
  const roleHierarchy: Record<string, number> = {
    'Resident': 0,
    'Field Officer': 1,
    'Desk Officer': 2,
    'Chief': 3,
    'Admin': 4,
  };
  
  const userLevel = roleHierarchy[userRole] ?? -1;
  const requiredLevel = Math.min(
    ...requiredRoles.map(r => roleHierarchy[r] ?? Infinity)
  );
  
  return userLevel >= requiredLevel;
};

/**
 * Rate limiting check (simplified)
 */
export const isRateLimited = (
  attempts: number, 
  maxAttempts: number, 
  windowMs: number,
  firstAttemptTime: number
): boolean => {
  const now = Date.now();
  if (now - firstAttemptTime > windowMs) {
    return false; // Window expired, reset
  }
  return attempts >= maxAttempts;
};

// ============================================
// TEST SUITES
// ============================================

describe('SQL Injection Prevention', () => {
  it('should detect basic SQL injection attempts', () => {
    expect(containsSQLInjection("'; DROP TABLE users;--")).toBe(true);
    expect(containsSQLInjection("1 OR 1=1")).toBe(true);
    expect(containsSQLInjection("admin'--")).toBe(true);
    expect(containsSQLInjection("SELECT * FROM users")).toBe(true);
    expect(containsSQLInjection("1; DELETE FROM incidents")).toBe(true);
  });

  it('should detect UNION-based injection', () => {
    expect(containsSQLInjection("1 UNION SELECT * FROM users")).toBe(true);
    expect(containsSQLInjection("' UNION SELECT password FROM users--")).toBe(true);
  });

  it('should allow safe inputs', () => {
    expect(containsSQLInjection("John Doe")).toBe(false);
    expect(containsSQLInjection("Normal incident description")).toBe(false);
    expect(containsSQLInjection("Fire at 123 Main St")).toBe(false);
    expect(containsSQLInjection("test@example.com")).toBe(false);
  });

  it('should detect comment-based injection', () => {
    expect(containsSQLInjection("admin--")).toBe(true);
    expect(containsSQLInjection("admin#")).toBe(true);
    expect(containsSQLInjection("admin/* comment */")).toBe(true);
  });
});

describe('XSS Prevention', () => {
  it('should detect script tags', () => {
    expect(containsXSS("<script>alert('XSS')</script>")).toBe(true);
    expect(containsXSS("<SCRIPT>alert(1)</SCRIPT>")).toBe(true);
    expect(containsXSS("<script src='evil.js'></script>")).toBe(true);
  });

  it('should detect event handlers', () => {
    expect(containsXSS("<img onerror='alert(1)'>")).toBe(true);
    expect(containsXSS("<body onload='alert(1)'>")).toBe(true);
    expect(containsXSS("<div onclick='steal()'>")).toBe(true);
  });

  it('should detect javascript: URLs', () => {
    expect(containsXSS("javascript:alert(1)")).toBe(true);
    expect(containsXSS("<a href='javascript:void(0)'>")).toBe(true);
  });

  it('should detect iframe/object/embed tags', () => {
    expect(containsXSS("<iframe src='evil.com'>")).toBe(true);
    expect(containsXSS("<object data='evil.swf'>")).toBe(true);
    expect(containsXSS("<embed src='evil.swf'>")).toBe(true);
  });

  it('should allow safe inputs', () => {
    expect(containsXSS("Normal text")).toBe(false);
    expect(containsXSS("Fire reported at building")).toBe(false);
    expect(containsXSS("Contact: 09171234567")).toBe(false);
    expect(containsXSS("Email: test@example.com")).toBe(false);
  });
});

describe('Token Expiration', () => {
  it('should detect expired tokens', () => {
    const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    expect(isTokenExpired(expiredTime)).toBe(true);
  });

  it('should accept valid tokens', () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    expect(isTokenExpired(futureTime)).toBe(false);
  });

  it('should handle edge case at exact expiration', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(isTokenExpired(nowSeconds)).toBe(true); // Expired at this exact moment
  });
});

describe('Common Password Detection', () => {
  it('should detect common passwords', () => {
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('Password1')).toBe(true);
    expect(isCommonPassword('123456')).toBe(true);
    expect(isCommonPassword('qwerty')).toBe(true);
    expect(isCommonPassword('admin')).toBe(true);
  });

  it('should allow strong unique passwords', () => {
    expect(isCommonPassword('MyUn1queP@ss!')).toBe(false);
    expect(isCommonPassword('Xk9#mLp2$vN')).toBe(false);
    expect(isCommonPassword('iReport2024Secure!')).toBe(false);
  });
});

describe('Role-Based Access Control', () => {
  it('should grant access to users with sufficient role', () => {
    expect(hasPermission('Admin', ['Field Officer'])).toBe(true);
    expect(hasPermission('Chief', ['Desk Officer'])).toBe(true);
    expect(hasPermission('Desk Officer', ['Field Officer'])).toBe(true);
    expect(hasPermission('Admin', ['Admin'])).toBe(true);
  });

  it('should deny access to users with insufficient role', () => {
    expect(hasPermission('Resident', ['Field Officer'])).toBe(false);
    expect(hasPermission('Field Officer', ['Chief'])).toBe(false);
    expect(hasPermission('Desk Officer', ['Admin'])).toBe(false);
  });

  it('should handle unknown roles', () => {
    expect(hasPermission('Unknown', ['Field Officer'])).toBe(false);
    expect(hasPermission('Hacker', ['Admin'])).toBe(false);
  });

  it('should allow access when any required role matches', () => {
    expect(hasPermission('Field Officer', ['Resident', 'Field Officer'])).toBe(true);
    expect(hasPermission('Desk Officer', ['Field Officer', 'Chief'])).toBe(true);
  });
});

describe('Rate Limiting', () => {
  it('should block after max attempts', () => {
    const now = Date.now();
    expect(isRateLimited(5, 5, 60000, now - 30000)).toBe(true); // 5 attempts in 30s
    expect(isRateLimited(10, 5, 60000, now - 30000)).toBe(true); // Over limit
  });

  it('should allow after window expires', () => {
    const now = Date.now();
    expect(isRateLimited(10, 5, 60000, now - 120000)).toBe(false); // Window expired
  });

  it('should allow within limits', () => {
    const now = Date.now();
    expect(isRateLimited(3, 5, 60000, now - 30000)).toBe(false); // Under limit
    expect(isRateLimited(4, 5, 60000, now - 30000)).toBe(false);
  });
});

describe('Input Boundary Tests', () => {
  it('should handle empty inputs', () => {
    expect(containsSQLInjection('')).toBe(false);
    expect(containsXSS('')).toBe(false);
  });

  it('should handle very long inputs', () => {
    const longString = 'A'.repeat(10000);
    expect(containsSQLInjection(longString)).toBe(false);
    expect(containsXSS(longString)).toBe(false);
  });

  it('should handle unicode characters', () => {
    expect(containsSQLInjection('日本語テスト')).toBe(false);
    expect(containsXSS('Ñoño García')).toBe(false);
    expect(containsSQLInjection('🔥 Fire emergency')).toBe(false);
  });

  it('should handle null-like strings', () => {
    expect(containsSQLInjection('null')).toBe(false);
    expect(containsSQLInjection('undefined')).toBe(false);
    expect(containsXSS('NULL')).toBe(false);
  });
});

describe('Authentication Edge Cases', () => {
  it('should handle case sensitivity in roles', () => {
    // Roles should be case-sensitive
    expect(hasPermission('admin', ['Admin'])).toBe(false);
    expect(hasPermission('ADMIN', ['Admin'])).toBe(false);
    expect(hasPermission('Admin', ['Admin'])).toBe(true);
  });

  it('should handle whitespace in inputs', () => {
    expect(containsSQLInjection('  SELECT  ')).toBe(true);
    expect(containsXSS('  <script>  ')).toBe(true);
  });
});
