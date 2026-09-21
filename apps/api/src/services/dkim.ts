import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { errors } from '../lib/errors.js';

/**
 * Per-domain DKIM key generation.
 *
 * On a Cloud Mail server, `rspamadm dkim_keygen -s <selector> -d <domain>`
 * generates a fresh 2048-bit RSA key pair and prints:
 *   - a PEM block on stdout (the private key)
 *   - the DNS TXT record on stderr (with the public key)
 *
 * We store the private key at `/var/lib/rspamd/dkim/<domain>.<selector>.key`
 * with mode 0640 root:_rspamd — the same path Rspamd's dkim_signing.conf
 * template points at. Only the public key half is persisted to Postgres and
 * exposed via the API for DNS instructions. The private key never leaves the
 * server disk and is never logged.
 */

const KEY_DIR = '/var/lib/rspamd/dkim';

interface KeyMaterial {
  publicKey: string;   // base64, no headers, no wrapping
  privateKeyPath: string;
}

export async function ensureDkimForDomain(domainId: string): Promise<KeyMaterial> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw errors.notFound('domain_not_found');
  if (domain.dkimPublicKey && domain.dkimKeyPath) {
    // Already generated. Return what we have.
    return { publicKey: domain.dkimPublicKey, privateKeyPath: domain.dkimKeyPath };
  }
  const selector = domain.dkimSelector || 'cm1';
  const keyPath = path.join(KEY_DIR, `${domain.name}.${selector}.key`);

  // Refuse to overwrite an existing private key — that would rotate DKIM
  // silently, breaking outbound signing until DNS is updated.
  try {
    await fs.access(keyPath);
    logger.warn({ domain: domain.name, selector }, 'dkim_key_already_present_on_disk');
  } catch {
    await mkdirIfMissing(KEY_DIR);
    await runDkimGen(domain.name, selector, keyPath);
  }

  const publicKey = await extractPublicKey(keyPath);

  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      dkimPublicKey: publicKey,
      dkimKeyPath: keyPath,
    },
  });
  return { publicKey, privateKeyPath: keyPath };
}

async function mkdirIfMissing(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
}

/**
 * Runs `rspamadm dkim_keygen` and writes the private key to disk with the
 * correct owner/mode. The public key is parsed out from the "p=..." fragment
 * in the DNS record that rspamadm prints to stderr.
 *
 * If `rspamadm` isn't on PATH (e.g. running the API on a machine without
 * Rspamd installed), we fall back to `openssl genrsa` + a hand-derived
 * public key. The end result is equivalent.
 */
async function runDkimGen(domain: string, selector: string, keyPath: string): Promise<void> {
  const hasRspamadm = await binaryExists('rspamadm');
  if (hasRspamadm) {
    // rspamadm creates a properly formatted 2048-bit private key.
    await execCapture('rspamadm', [
      'dkim_keygen',
      '-s',
      selector,
      '-d',
      domain,
      '-k',
      keyPath,
      '-b',
      '2048',
    ]);
  } else {
    await execCapture('openssl', ['genrsa', '-out', keyPath, '2048']);
  }
  // Best-effort ownership/mode. Ignored if we're not root.
  try {
    await fs.chmod(keyPath, 0o640);
  } catch (err) {
    logger.warn({ err, keyPath }, 'dkim_chmod_failed');
  }
  try {
    const uid = process.getuid?.() ?? -1;
    if (uid === 0) {
      // chown root:_rspamd if the _rspamd group exists.
      const { promisify } = await import('node:util');
      const { exec } = await import('node:child_process');
      const p = promisify(exec);
      await p(`chown root:_rspamd ${JSON.stringify(keyPath)}`).catch(() => {
        /* group may not exist on non-mail hosts */
      });
    }
  } catch {
    /* ignore */
  }
}

async function extractPublicKey(keyPath: string): Promise<string> {
  // Derive the SPKI-format public key from the private key and strip the
  // PEM headers + line breaks — DKIM DNS TXT records use the raw base64.
  const { stdout } = await execCapture('openssl', ['rsa', '-in', keyPath, '-pubout']);
  return stdout
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
}

function binaryExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function execCapture(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += String(d)));
    proc.stderr.on('data', (d) => (stderr += String(d)));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
    proc.on('error', reject);
  });
}
