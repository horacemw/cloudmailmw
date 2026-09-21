import type { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { errors } from '../lib/errors.js';

/**
 * Returns the settings a user needs to type into Outlook / Thunderbird / iOS
 * Mail / Android Mail. Does NOT expose any password — the user's own mailbox
 * password is what they'll type. If we ever move to app-passwords, this
 * endpoint would issue and return one alongside.
 */
const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/mailboxes/:id/client-config', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const mailbox = await prisma.mailbox.findFirst({
        where: { id, tenantId: req.currentTenant!.id },
      });
      if (!mailbox) throw errors.notFound('mailbox_not_found');
      const host = env.CLOUDMAIL_INITIAL_MAIL_HOST;

      return {
        emailAddress: mailbox.address,
        username: mailbox.address,
        incoming: {
          protocol: 'IMAP',
          host,
          port: 993,
          security: 'SSL/TLS',
          authentication: 'Normal password',
        },
        outgoing: {
          protocol: 'SMTP',
          host,
          port: 587,
          security: 'STARTTLS',
          authentication: 'Normal password',
        },
        thunderbirdAutoconfig: `https://autoconfig.${mailbox.address.split('@')[1]}/mail/config-v1.1.xml`,
        outlook: {
          summary:
            'Add an IMAP/SMTP account manually in Outlook. Cloud Mail does not currently expose ActiveSync; use IMAP + SMTP with the settings above.',
        },
        mobile: {
          apple:
            'On iPhone/iPad choose Settings → Mail → Accounts → Add Account → Other → Add Mail Account. Enter your address and password, then use the values above for incoming and outgoing.',
          android:
            'On Android choose Settings → Accounts → Add Account → Personal (IMAP), then enter the values above.',
        },
      };
    },
  });
};

export default routes;
