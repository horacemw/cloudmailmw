import { env } from '../config/env.js';

/**
 * Loopback TLS identity override.
 *
 * When the API is co-located with Dovecot/Postfix (typical single-box deploy)
 * we dial 127.0.0.1 for speed. The mail server presents a Let's Encrypt cert
 * issued for the public hostname (`mail.digiskills.live`); Node's default
 * identity check compares the cert's SAN against the connection host and
 * refuses with ERR_TLS_CERT_ALTNAME_INVALID because 127.0.0.1 is not a SAN.
 *
 * The fix is NOT to disable cert validation. Instead, override the identity
 * target with the DNS name the cert is actually issued for. TLS still
 * validates the chain, the SAN, and expiry — we're only telling Node "when
 * you check the cert's SAN, compare it against this hostname rather than the
 * literal IP I dialed."
 *
 * Split deployments (API on host A, Dovecot on host B with public hostname)
 * fall through to `undefined`, which lets the socket options default to the
 * dialed host, preserving normal identity checks.
 */
export function loopbackTlsOptions(host: string): { servername: string } | undefined {
  if (host === '127.0.0.1' || host === '::1' || host === 'localhost') {
    return { servername: env.CLOUDMAIL_INITIAL_MAIL_HOST };
  }
  return undefined;
}
