import nodemailer from 'nodemailer';
import { config } from '../config.js';

// When no SMTP server is configured, reset links are printed to the console and
// kept in memory. Tests read them from here; nothing is ever sent.
export const outbox = [];

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sendResetEmail(user, link) {
  const subject = 'Reset your Cadence password';
  const text = [
    `Hi ${user.name},`,
    '',
    `Use this link to choose a new password. It works once and expires in ${config.resetMinutes} minutes:`,
    link,
    '',
    "If you didn't ask for this, ignore this email. Your password stays the same.",
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;color:#14201e">
      <p>Hi ${escapeHtml(user.name)},</p>
      <p>Use this link to choose a new password. It works once and expires in ${config.resetMinutes} minutes.</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#0e7c6b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
      <p style="color:#55655f;font-size:14px">If you didn't ask for this, ignore this email. Your password stays the same.</p>
    </div>`;

  const smtp = getTransport();
  if (!smtp) {
    outbox.push({ to: user.email, link, at: new Date() });
    if (outbox.length > 50) outbox.shift();
    console.log(`\n[mail] Password reset link for ${user.email}\n       ${link}\n`);
    return;
  }
  await smtp.sendMail({ from: config.smtp.from, to: user.email, subject, text, html });
}
