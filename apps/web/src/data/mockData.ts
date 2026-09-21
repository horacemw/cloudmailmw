import type { Email, Folder, Notification } from '@/types';

/**
 * Time helpers — anchored to a deterministic "now" for stable snapshots.
 */
const NOW = new Date();
const iso = (mins: number): string =>
  new Date(NOW.getTime() - mins * 60_000).toISOString();

/* ─── Folders ──────────────────────────────────────────────────────── */

export const SYSTEM_FOLDERS: Folder[] = [
  { id: 'inbox', name: 'Inbox', system: true },
  { id: 'starred', name: 'Starred', system: true },
  { id: 'snoozed', name: 'Snoozed', system: true },
  { id: 'sent', name: 'Sent', system: true },
  { id: 'drafts', name: 'Drafts', system: true },
  { id: 'archive', name: 'Archive', system: true },
  { id: 'spam', name: 'Spam', system: true },
  { id: 'trash', name: 'Trash', system: true },
];

export const CUSTOM_FOLDERS: Folder[] = [
  { id: 'projects', name: 'Projects', system: false },
  { id: 'finance', name: 'Finance', system: false },
  { id: 'hr', name: 'HR', system: false },
  { id: 'meetings', name: 'Meetings', system: false },
  { id: 'personal', name: 'Personal', system: false },
  { id: 'notes', name: 'Notes', system: false },
];

/* ─── Current user ─────────────────────────────────────────────────── */

export const CURRENT_USER = {
  name: 'Horace Chipembere',
  email: 'info@future4all.org',
  initials: 'HC',
};

/* ─── Emails ───────────────────────────────────────────────────────── */

const otpBody = (code: string): string => `
  <div style="font-family: Poppins, sans-serif;">
    <div style="text-align:center; padding: 8px 0 16px;">
      <div style="display:inline-block; background:#EAF7EF; color:#087443; font-weight:700;
                  padding:6px 12px; border-radius:6px; letter-spacing:0.3px;">FDH Bank</div>
    </div>
    <h2 style="text-align:center; font-weight:600; margin:16px 0 4px;">Your One Time Password (OTP)</h2>
    <p style="text-align:center; color:#66736C; margin-top:0;">Use this code to complete your sign-in.</p>
    <p style="text-align:center; color:#66736C; margin:24px 0 8px;">Your one time password is</p>
    <div style="text-align:center; margin: 12px 0 24px;">
      <div style="display:inline-block; background:#F4FBF7; border:1px solid #CBECD8;
                  color:#087443; font-size:38px; letter-spacing:8px; font-weight:700;
                  padding: 14px 26px; border-radius: 12px;">${code}</div>
    </div>
    <p style="text-align:center; color:#66736C;">This code will expire in <strong>5 minutes</strong>.</p>
    <p style="color:#66736C; font-size:13px; margin-top:24px;">
      If you did not request this login, please ignore this email or contact FDH Bank support immediately.
    </p>
    <p style="color:#8A9690; font-size:12px; margin-top:20px;">
      Warmly,<br/>FDH OneClick Team<br/>FDH Bank plc
    </p>
  </div>
`;

const meetingBody = (title: string, when: string): string => `
  <p>Hi Horace,</p>
  <p>You've been invited to <strong>${title}</strong>.</p>
  <p><strong>When:</strong> ${when}<br/>
     <strong>Where:</strong> Google Meet — <a href="#">meet.cloudmail.dev/${Math.random().toString(36).slice(2, 8)}</a><br/>
     <strong>Duration:</strong> 45 minutes</p>
  <p>An agenda is attached. Please respond so we can finalise the room booking.</p>
  <p>Thanks,<br/>The Team</p>
`;

const invoiceBody = (num: string, amount: string): string => `
  <p>Dear customer,</p>
  <p>Please find attached invoice <strong>${num}</strong> for the amount of <strong>${amount}</strong>.</p>
  <p>Payment is due within 14 days. You can pay online using the secure link in the invoice, or via bank transfer.</p>
  <p>If you have any questions about this invoice, reply to this email and our finance team will assist you.</p>
  <p>Kind regards,<br/>Finance Team</p>
`;

export const MOCK_EMAILS: Email[] = [
  {
    id: 'e1',
    folderId: 'inbox',
    from: { name: 'FDH OneClick', email: 'oneclickfdh11@fdh.co.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'FDH One time password',
    preview: 'Your one time password is 744490. This code will expire in 5 minutes.',
    bodyHtml: otpBody('744490'),
    timestamp: iso(2),
    read: false,
    starred: false,
    trusted: true,
    labels: ['important', 'finance'],
  },
  {
    id: 'e2',
    folderId: 'inbox',
    from: { name: 'FDH OneClick', email: 'oneclickfdh11@fdh.co.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'FDH One time password',
    preview: 'Your one time password is 512087. This code will expire in 5 minutes.',
    bodyHtml: otpBody('512087'),
    timestamp: iso(28),
    read: false,
    starred: false,
    trusted: true,
    labels: ['important', 'finance'],
  },
  {
    id: 'e3',
    folderId: 'inbox',
    from: { name: 'FDH OneClick', email: 'oneclickfdh11@fdh.co.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Salaries Batch — verified and awaiting approval',
    preview: 'The salaries payment batch for September has been verified and is awaiting your approval.',
    bodyHtml: `
      <p>Dear Approver,</p>
      <p>The salaries payment batch <strong>SB-2024-09</strong> has been verified by the maker and is
      now awaiting your approval.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin:12px 0;">
        <tr><td style="color:#66736C;">Batch reference</td><td><strong>SB-2024-09</strong></td></tr>
        <tr><td style="color:#66736C;">Total amount</td><td><strong>MWK 48,320,000</strong></td></tr>
        <tr><td style="color:#66736C;">Beneficiaries</td><td>142 employees</td></tr>
        <tr><td style="color:#66736C;">Verified by</td><td>Chikondi Mvula</td></tr>
      </table>
      <p>Please log in to FDH OneClick to review and approve.</p>
      <p>FDH OneClick Team</p>
    `,
    timestamp: iso(180),
    read: true,
    starred: true,
    trusted: true,
    labels: ['finance', 'work'],
  },
  {
    id: 'e4',
    folderId: 'inbox',
    from: { name: 'FDH OneClick', email: 'oneclickfdh11@fdh.co.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'FDH One time password',
    preview: 'Your one time password is 210044. This code will expire in 5 minutes.',
    bodyHtml: otpBody('210044'),
    timestamp: iso(240),
    read: true,
    starred: false,
    trusted: true,
  },
  {
    id: 'e5',
    folderId: 'inbox',
    from: { name: 'FDH OneClick', email: 'oneclickfdh11@fdh.co.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'FDH One time password',
    preview: 'Your one time password is 883710. This code will expire in 5 minutes.',
    bodyHtml: otpBody('883710'),
    timestamp: iso(320),
    read: true,
    starred: false,
    trusted: true,
  },
  {
    id: 'e6',
    folderId: 'inbox',
    from: { name: 'FDH OneClick', email: 'oneclickfdh11@fdh.co.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'FDH One time password',
    preview: 'Your one time password is 004619. This code will expire in 5 minutes.',
    bodyHtml: otpBody('004619'),
    timestamp: iso(360),
    read: true,
    starred: false,
    trusted: true,
  },
  {
    id: 'e7',
    folderId: 'inbox',
    from: { name: 'Salaries Batch', email: 'payroll@future4all.org' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Payment Confirmation — September payroll',
    preview: 'This is to confirm that the September payroll batch was processed successfully.',
    bodyHtml: `
      <p>Hi Horace,</p>
      <p>This is to confirm that the September payroll batch was processed successfully at 10:12
      this morning. All 142 employees have received their credit alerts.</p>
      <p>Full remittance schedule is attached for your records.</p>
      <p>— Payroll</p>
    `,
    timestamp: iso(720),
    read: true,
    starred: false,
    attachments: [{ id: 'a1', name: 'payroll-sep-2024.pdf', size: '218 KB', type: 'pdf' }],
    labels: ['finance', 'work'],
  },
  {
    id: 'e8',
    folderId: 'inbox',
    from: { name: 'UNDP Webmail', email: 'no-reply@undp.org' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Password Reset Requested',
    preview: 'A password reset was requested for your UNDP account. If this was you, follow the link.',
    bodyHtml: `
      <p>Hello Horace,</p>
      <p>A password reset was requested for your UNDP account. If this was you, use the button below
      to set a new password. The link is valid for one hour.</p>
      <p style="text-align:center; margin:24px 0;">
        <a href="#" style="background:#159447;color:#fff;padding:10px 20px;border-radius:8px;
        text-decoration:none;font-weight:600;">Reset password</a>
      </p>
      <p style="color:#66736C;font-size:13px;">If you did not request this, you can safely ignore this
      email — your password will not change.</p>
    `,
    timestamp: iso(1440),
    read: false,
    starred: false,
    trusted: true,
    labels: ['important'],
  },
  {
    id: 'e9',
    folderId: 'inbox',
    from: { name: 'ACB ECMS', email: 'noreply@acbmw.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'System Notification — statement ready',
    preview: 'Your account statement for the period ending 30 September is now available.',
    bodyHtml: `
      <p>Dear customer,</p>
      <p>Your account statement for the period ending <strong>30 September</strong> is now
      available. Log in to ACB ECMS to download.</p>
      <p>Thank you for banking with ACB.</p>
    `,
    timestamp: iso(1500),
    read: true,
    starred: false,
    trusted: true,
    attachments: [{ id: 'a2', name: 'statement-sep.pdf', size: '96 KB', type: 'pdf' }],
    labels: ['finance'],
  },
  {
    id: 'e10',
    folderId: 'inbox',
    from: { name: 'Google', email: 'no-reply@accounts.google.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Security alert — new sign-in on Windows',
    preview: 'Your Google account was just signed into from a new Windows device.',
    bodyHtml: `
      <p>Hi Horace,</p>
      <p>Your Google Account was just signed into from a new Windows device. If this was you,
      you don't need to do anything.</p>
      <p>If not, review your recent activity and secure your account.</p>
    `,
    timestamp: iso(1600),
    read: true,
    starred: false,
    trusted: true,
    labels: ['important'],
  },
  {
    id: 'e11',
    folderId: 'inbox',
    from: { name: 'Amina Kondowe', email: 'amina.k@future4all.org' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Q4 planning — draft agenda attached',
    preview: 'Here is the draft agenda for our Q4 planning session next week. Let me know what to add.',
    bodyHtml: `
      <p>Hi Horace,</p>
      <p>Attached is the draft agenda for our Q4 planning session on Tuesday. I've allowed 20
      minutes at the end for open items — feel free to slot anything in.</p>
      <p>Let me know if we should invite the operations team.</p>
      <p>Best,<br/>Amina</p>
    `,
    timestamp: iso(60 * 26),
    read: false,
    starred: true,
    attachments: [{ id: 'a3', name: 'Q4-agenda-draft.docx', size: '42 KB', type: 'doc' }],
    labels: ['work'],
  },
  {
    id: 'e12',
    folderId: 'inbox',
    from: { name: 'Cloud Mail', email: 'welcome@cloudmail.dev' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Welcome to Cloud Mail — your email, anywhere',
    preview: 'Thanks for joining Cloud Mail. Here are a few tips to get the most out of your inbox.',
    bodyHtml: `
      <p>Hi Horace,</p>
      <p>Welcome to <strong>Cloud Mail</strong> — the professional email platform for teams that
      value simplicity, reliability and security.</p>
      <ul>
        <li>Press <strong>C</strong> to compose a new message</li>
        <li>Press <strong>/</strong> to search your entire inbox</li>
        <li>Press <strong>?</strong> to see all keyboard shortcuts</li>
      </ul>
      <p>We're glad to have you.</p>
      <p>— The Cloud Mail team</p>
    `,
    timestamp: iso(60 * 40),
    read: true,
    starred: true,
    trusted: true,
    labels: ['personal'],
  },
  {
    id: 'e13',
    folderId: 'inbox',
    from: { name: 'GitHub', email: 'noreply@github.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: '[cloudmail/api] PR #148 ready for review',
    preview: '@chikondi opened a pull request: Add rate-limiter middleware. 4 files changed.',
    bodyHtml: `
      <p><strong>@chikondi</strong> opened a pull request in <code>cloudmail/api</code>:</p>
      <blockquote><p><strong>Add rate-limiter middleware</strong><br/>
      Adds sliding-window rate limiting per API key with Redis backend.</p></blockquote>
      <p>4 files changed · 218 additions · 12 deletions</p>
    `,
    timestamp: iso(60 * 44),
    read: true,
    starred: false,
    labels: ['work'],
  },
  {
    id: 'e14',
    folderId: 'inbox',
    from: { name: 'Stripe', email: 'billing@stripe.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Your invoice INV-2094 is available',
    preview: 'Invoice INV-2094 for $89.00 has been posted to your account.',
    bodyHtml: invoiceBody('INV-2094', '$89.00'),
    timestamp: iso(60 * 48),
    read: true,
    starred: false,
    trusted: true,
    attachments: [{ id: 'a4', name: 'invoice-INV-2094.pdf', size: '54 KB', type: 'pdf' }],
    labels: ['finance'],
  },
  {
    id: 'e15',
    folderId: 'inbox',
    from: { name: 'Zoom', email: 'no-reply@zoom.us' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Meeting invitation: Weekly stand-up',
    preview: 'You are invited to Weekly stand-up on Monday, 09:00 CAT.',
    bodyHtml: meetingBody('Weekly stand-up', 'Monday, 09:00 CAT'),
    timestamp: iso(60 * 60),
    read: true,
    starred: false,
    labels: ['work'],
  },
  {
    id: 'e16',
    folderId: 'inbox',
    from: { name: 'Design Weekly', email: 'hello@designweekly.co' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'The 5 best design systems of 2024, and what to steal',
    preview: 'This week: a deep-dive into how Linear, Vercel and Stripe evolved their design tokens.',
    bodyHtml: `
      <p>Hey there,</p>
      <p>This week we're looking at five design systems that shipped meaningful improvements in
      2024 — Linear's semantic tokens, Vercel's typography scale, Stripe's colour ramps, and two
      you might not have heard of.</p>
      <p><a href="#">Read on the web →</a></p>
    `,
    timestamp: iso(60 * 72),
    read: true,
    starred: false,
    labels: ['personal'],
  },
  {
    id: 'e17',
    folderId: 'inbox',
    from: { name: 'HR — Future4All', email: 'hr@future4all.org' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Reminder — annual policy acknowledgement due',
    preview: 'Please acknowledge the updated 2024 code of conduct by Friday.',
    bodyHtml: `
      <p>Hi Horace,</p>
      <p>A gentle reminder to acknowledge the updated 2024 code of conduct in the HR portal by
      Friday. The full document is attached.</p>
      <p>Thank you.</p>
    `,
    timestamp: iso(60 * 90),
    read: false,
    starred: false,
    attachments: [{ id: 'a5', name: 'code-of-conduct-2024.pdf', size: '312 KB', type: 'pdf' }],
    labels: ['work'],
  },
  {
    id: 'e18',
    folderId: 'inbox',
    from: { name: 'Notion', email: 'team@notion.so' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Chikondi shared "Cloud Mail — architecture notes"',
    preview: 'Chikondi added you as an editor to a new page.',
    bodyHtml: `
      <p>Chikondi shared a page with you: <a href="#"><strong>Cloud Mail — architecture notes</strong></a></p>
      <p>You have edit access.</p>
    `,
    timestamp: iso(60 * 96),
    read: true,
    starred: false,
    labels: ['work'],
  },
  {
    id: 'e19',
    folderId: 'inbox',
    from: { name: 'Airtel Money', email: 'notify@airtel.mw' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Transaction alert — MWK 25,000 sent',
    preview: 'You sent MWK 25,000 to +265 999 000 111. Reference: TXN-88213.',
    bodyHtml: `
      <p>You have sent <strong>MWK 25,000</strong> to +265 999 000 111.</p>
      <p>Reference: <strong>TXN-88213</strong><br/>Balance: MWK 182,410</p>
    `,
    timestamp: iso(60 * 110),
    read: true,
    starred: false,
    trusted: true,
    labels: ['finance'],
  },
  {
    id: 'e20',
    folderId: 'inbox',
    from: { name: 'LinkedIn', email: 'invitations@linkedin.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'You have 3 new connection requests',
    preview: 'Amina Kondowe, Blessings Phiri and one other want to connect.',
    bodyHtml: `
      <p>You have 3 new connection requests waiting for you on LinkedIn.</p>
      <p><a href="#">View invitations →</a></p>
    `,
    timestamp: iso(60 * 130),
    read: true,
    starred: false,
    labels: ['personal'],
  },
  {
    id: 'e21',
    folderId: 'inbox',
    from: { name: 'AWS Billing', email: 'no-reply@aws.amazon.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'AWS Invoice available — September 2024',
    preview: 'Your AWS invoice for September 2024 in the amount of $412.09 is ready.',
    bodyHtml: invoiceBody('AWS-SEP-2024', '$412.09'),
    timestamp: iso(60 * 160),
    read: true,
    starred: false,
    trusted: true,
    attachments: [{ id: 'a6', name: 'aws-sep-invoice.pdf', size: '128 KB', type: 'pdf' }],
    labels: ['finance', 'work'],
  },
  {
    id: 'e22',
    folderId: 'inbox',
    from: { name: 'Calendar', email: 'calendar-notification@cloudmail.dev' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Reminder — Board meeting tomorrow, 14:00',
    preview: 'Board meeting tomorrow at 14:00 CAT in the main boardroom.',
    bodyHtml: meetingBody('Board meeting', 'Tomorrow, 14:00 CAT'),
    timestamp: iso(60 * 190),
    read: true,
    starred: true,
    labels: ['work'],
  },
  {
    id: 'e23',
    folderId: 'inbox',
    from: { name: 'Blessings Phiri', email: 'blessings@future4all.org' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Weekend plans?',
    preview: 'Fancy grabbing coffee on Saturday? The new place near the lake has finally opened.',
    bodyHtml: `
      <p>Hey Horace,</p>
      <p>Fancy grabbing coffee on Saturday? The new place near the lake has finally opened —
      apparently the flat whites are worth the drive.</p>
      <p>Let me know.</p>
      <p>B.</p>
    `,
    timestamp: iso(60 * 220),
    read: true,
    starred: false,
    labels: ['personal'],
  },
  {
    id: 'e24',
    folderId: 'inbox',
    from: { name: 'Figma', email: 'no-reply@figma.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Amina left a comment on "Cloud Mail — Inbox v2"',
    preview: '"Love the reading pane spacing here — matches the density we agreed on."',
    bodyHtml: `
      <p><strong>Amina</strong> left a comment on <em>Cloud Mail — Inbox v2</em>:</p>
      <blockquote><p>Love the reading pane spacing here — matches the density we agreed on.</p></blockquote>
    `,
    timestamp: iso(60 * 260),
    read: true,
    starred: false,
    labels: ['work'],
  },
  {
    id: 'e25',
    folderId: 'inbox',
    from: { name: 'Cloudflare', email: 'noreply@cloudflare.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'DNS record change confirmation',
    preview: 'The MX record for future4all.org was updated 3 minutes ago.',
    bodyHtml: `
      <p>The <strong>MX</strong> record for <code>future4all.org</code> was updated at 09:14 CAT.</p>
      <p>If this change was not made by you, revert it immediately from the Cloudflare dashboard.</p>
    `,
    timestamp: iso(60 * 300),
    read: true,
    starred: false,
    trusted: true,
    labels: ['important', 'work'],
  },
  {
    id: 'e26',
    folderId: 'inbox',
    from: { name: 'Kayak', email: 'trips@kayak.com' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Your trip to Cape Town in 3 weeks',
    preview: 'Check-in opens in 24 hours. Here is a summary of your itinerary.',
    bodyHtml: `
      <p>Your trip to Cape Town starts in 3 weeks. Check-in for your outbound flight opens in
      24 hours.</p>
      <p>Full itinerary attached.</p>
    `,
    timestamp: iso(60 * 400),
    read: true,
    starred: false,
    attachments: [{ id: 'a7', name: 'itinerary-CPT.pdf', size: '88 KB', type: 'pdf' }],
    labels: ['travel', 'personal'],
  },
  /* ─── Sent ──────────────────────────────────────────────────────── */
  {
    id: 's1',
    folderId: 'sent',
    from: { name: CURRENT_USER.name, email: CURRENT_USER.email },
    to: [{ name: 'Amina Kondowe', email: 'amina.k@future4all.org' }],
    subject: 'Re: Q4 planning — draft agenda attached',
    preview: 'Thanks — I have added two items under "operations". Otherwise looks great.',
    bodyHtml: `
      <p>Thanks Amina,</p>
      <p>I've added two items under "operations". Otherwise this looks great — happy to share
      with the wider group.</p>
      <p>H.</p>
    `,
    timestamp: iso(60 * 25),
    read: true,
    starred: false,
  },
  {
    id: 's2',
    folderId: 'sent',
    from: { name: CURRENT_USER.name, email: CURRENT_USER.email },
    to: [{ name: 'Blessings Phiri', email: 'blessings@future4all.org' }],
    subject: 'Re: Weekend plans?',
    preview: 'Saturday works — 10:30 at the new place. See you there.',
    bodyHtml: `<p>Saturday works — 10:30 at the new place. See you there.</p><p>H.</p>`,
    timestamp: iso(60 * 200),
    read: true,
    starred: false,
  },
  /* ─── Draft ─────────────────────────────────────────────────────── */
  {
    id: 'd1',
    folderId: 'drafts',
    from: { name: CURRENT_USER.name, email: CURRENT_USER.email },
    to: [{ name: 'Finance', email: 'finance@future4all.org' }],
    subject: 'Q4 budget — first pass',
    preview: 'Attached is a first-pass Q4 budget for review. Highlights: headcount +2, ...',
    bodyHtml: `
      <p>Hi Finance team,</p>
      <p>Attached is a first-pass Q4 budget for review. Highlights: headcount +2, ...</p>
    `,
    timestamp: iso(60 * 8),
    read: true,
    starred: false,
    draft: true,
  },
  /* ─── Spam ──────────────────────────────────────────────────────── */
  {
    id: 'sp1',
    folderId: 'spam',
    from: { name: 'Lottery Winnings Intl.', email: 'winner@lotterypromo.info' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'CONGRATULATIONS!! You have won $1,000,000',
    preview: 'Dear winner, kindly respond with your details to claim.',
    bodyHtml: `<p>Dear winner, kindly respond with your details to claim.</p>`,
    timestamp: iso(60 * 300),
    read: false,
    starred: false,
  },
  {
    id: 'sp2',
    folderId: 'spam',
    from: { name: 'Crypto Signals Pro', email: 'signals@crypto-pro.biz' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: '🚀 10x your portfolio this week',
    preview: 'Exclusive signals from our AI trading engine — limited spots.',
    bodyHtml: `<p>Exclusive signals from our AI trading engine — limited spots.</p>`,
    timestamp: iso(60 * 420),
    read: false,
    starred: false,
  },
  {
    id: 'sp3',
    folderId: 'spam',
    from: { name: 'Support Team', email: 'support@paypall-verify.top' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Action required: verify your account',
    preview: 'Please verify your account within 24 hours to avoid suspension.',
    bodyHtml: `<p>Please verify your account within 24 hours to avoid suspension.</p>`,
    timestamp: iso(60 * 600),
    read: false,
    starred: false,
  },
  /* ─── Trash ─────────────────────────────────────────────────────── */
  {
    id: 't1',
    folderId: 'trash',
    from: { name: 'Old Newsletter', email: 'archive@oldnews.example' },
    to: [{ name: 'Horace Chipembere', email: CURRENT_USER.email }],
    subject: 'Last week in tech',
    preview: 'The weekly roundup you deleted.',
    bodyHtml: `<p>The weekly roundup you deleted.</p>`,
    timestamp: iso(60 * 800),
    read: true,
    starred: false,
  },
];

/* ─── Notifications ────────────────────────────────────────────────── */

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    kind: 'new-mail',
    title: 'New message',
    message: 'FDH OneClick sent you a one time password',
    timestamp: iso(2),
    read: false,
  },
  {
    id: 'n2',
    kind: 'security',
    title: 'New sign-in on Windows',
    message: 'Google Account was signed into from a new device',
    timestamp: iso(1600),
    read: false,
  },
  {
    id: 'n3',
    kind: 'draft',
    title: 'Draft saved',
    message: '"Q4 budget — first pass" saved 8 minutes ago',
    timestamp: iso(8),
    read: true,
  },
  {
    id: 'n4',
    kind: 'storage',
    title: 'Storage at 68%',
    message: '6.8 GB of 10 GB used — consider upgrading',
    timestamp: iso(300),
    read: true,
  },
];
