import nodemailer from 'nodemailer';
import { config } from '../src/config.js';

// Tests the email login without starting the app, and never prints the password:
//   npm --prefix server run mail:check                      checks the login
//   npm --prefix server run mail:check -- you@example.com   also sends a test email to that address
//   ENV_FILE=.env.remote npm --prefix server run mail:check   uses the settings in server/.env.remote
const { host, port, user, pass, from } = config.smtp;
const to = process.argv[2];

if (!host || !user || !pass) {
  const missing = [!host && 'SMTP_HOST', !user && 'SMTP_USER', !pass && 'SMTP_PASS'].filter(Boolean).join(', ');
  console.error(`Not set: ${missing}. Add them to the settings file first.`);
  process.exit(1);
}

const spaces = /\s/.test(pass);
console.log(`Server    ${host}:${port}`);
console.log(`Login as  ${user}`);
console.log(`Password  ${pass.length} characters${spaces ? ' (contains spaces or tabs)' : ''}${pass.length === 16 && !spaces ? ' (looks like an app password)' : ''}`);

const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });

try {
  await transport.verify();
  console.log('\nOK. Gmail accepted the login.');
  if (to) {
    await transport.sendMail({ from, to, subject: 'Cadence email test', text: 'If you can read this, Cadence can send email.' });
    console.log(`Test email sent to ${to}. Check the inbox and the spam folder.`);
  }
} catch (err) {
  console.error(`\nFailed: ${err.message.split('\n')[0]}`);
  if (err.responseCode === 535) {
    console.error(
      [
        'Gmail refused this login. Common reasons:',
        '  - the app password was made in a different Google account than SMTP_USER',
        '  - 2-Step Verification is off, or the app password was deleted',
        '  - extra characters were pasted (check the length above: it should be 16 without spaces, 19 with)',
        '  - a normal Gmail password was used instead of an app password',
      ].join('\n')
    );
  }
  process.exit(1);
}
