'use strict';

const {
  generateRedemptionCode,
  generateShareCode,
  generateVerificationCode,
  generatePasswordResetToken,
  generateSecureToken,
  generateOTP,
} = require('../../src/utils/tokenGenerator');

describe('tokenGenerator', () => {
  describe('generateRedemptionCode', () => {
    it('should generate a code in XXXX-XXXX format', () => {
      const code = generateRedemptionCode();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateRedemptionCode());
      }
      // Very unlikely to have duplicates in 100 iterations
      expect(codes.size).toBeGreaterThan(95);
    });

    it('should always be 9 characters (4+dash+4)', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRedemptionCode();
        expect(code.length).toBe(9);
      }
    });

    it('should only contain uppercase alphanumeric characters and a dash', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRedemptionCode();
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      }
    });
  });

  describe('generateShareCode', () => {
    it('should generate a 12-character alphanumeric string', () => {
      const code = generateShareCode();
      expect(typeof code).toBe('string');
      expect(code.length).toBe(12);
    });

    it('should only contain alphanumeric characters', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateShareCode();
        expect(code).toMatch(/^[a-z0-9]{12}$/);
      }
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateShareCode());
      }
      expect(codes.size).toBeGreaterThan(95);
    });
  });

  describe('generateVerificationCode', () => {
    it('should generate a 6-digit numeric string', () => {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should be within 100000-999999 range', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateVerificationCode();
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });
  });

  describe('generatePasswordResetToken', () => {
    it('should generate a UUID v4 format token', () => {
      const token = generatePasswordResetToken();
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generatePasswordResetToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate a hex string of specified byte length', () => {
      const token = generateSecureToken(32);
      expect(token).toMatch(/^[a-f0-9]+$/);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should default to 32 bytes (64 hex chars)', () => {
      const token = generateSecureToken();
      expect(token.length).toBe(64);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 20; i++) {
        tokens.add(generateSecureToken());
      }
      expect(tokens.size).toBe(20);
    });
  });

  describe('generateOTP', () => {
    it('should generate a 6-digit OTP by default', () => {
      const otp = generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should generate OTP of custom length', () => {
      const otp = generateOTP(4);
      expect(otp).toMatch(/^\d{4}$/);
    });

    it('should be within valid range for given length', () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOTP(6);
        const num = parseInt(otp, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });
  });
});
