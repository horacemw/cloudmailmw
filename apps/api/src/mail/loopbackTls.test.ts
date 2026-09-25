import { describe, it, expect } from 'vitest';
import { loopbackTlsOptions } from './loopbackTls.js';

describe('loopbackTlsOptions', () => {
  it('returns {servername} for 127.0.0.1', () => {
    expect(loopbackTlsOptions('127.0.0.1')).toEqual({
      servername: process.env.CLOUDMAIL_INITIAL_MAIL_HOST,
    });
  });

  it('returns {servername} for ::1 (IPv6 loopback)', () => {
    expect(loopbackTlsOptions('::1')).toEqual({
      servername: process.env.CLOUDMAIL_INITIAL_MAIL_HOST,
    });
  });

  it('returns {servername} for localhost', () => {
    expect(loopbackTlsOptions('localhost')).toEqual({
      servername: process.env.CLOUDMAIL_INITIAL_MAIL_HOST,
    });
  });

  it('returns undefined for a real hostname (split deployment)', () => {
    expect(loopbackTlsOptions('mail.example.com')).toBeUndefined();
  });

  it('returns undefined for a public IP (not loopback)', () => {
    expect(loopbackTlsOptions('8.8.8.8')).toBeUndefined();
  });

  it('is case-sensitive on "localhost" — treat "LOCALHOST" as non-loopback', () => {
    // Documenting current behaviour; if we ever want case-insensitive
    // matching this test flags the intentional decision.
    expect(loopbackTlsOptions('LOCALHOST')).toBeUndefined();
  });
});
