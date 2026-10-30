import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

let transporter = null;

// Initialize mail transporter
const getTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // Development / fallback transporter with ethereal or console logger
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'windows',
      buffer: true
    });
  }

  return transporter;
};

/**
 * Send an email
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const mailer = await getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"AutoQuiz Pro System" <no-reply@autoquiz.edu>';

    const info = await mailer.sendMail({
      from: fromAddress,
      to,
      subject,
      text: text || html.replace(/<[^>]*>?/gm, ''),
      html
    });

    console.log(`✉️ [EMAIL SENT] To: ${to} | Subject: "${subject}"`);
    return { success: true, messageId: info.messageId, to };
  } catch (err) {
    console.error(`❌ [EMAIL SEND ERROR] To: ${to} - ${err.message}`);
    // Return gracefully so process does not crash if SMTP is unconfigured
    return { success: false, error: err.message, to };
  }
};

/**
 * Format expiry display string (e.g., "1 hour", "5 hours", "1 day")
 */
export const formatExpiryLabel = (expiresIn) => {
  if (expiresIn === '1h' || expiresIn === 1 || expiresIn === '1 hour') return '1 Hour';
  if (expiresIn === '5h' || expiresIn === 5 || expiresIn === '5 hours') return '5 Hours';
  if (expiresIn === '1d' || expiresIn === 24 || expiresIn === '1 day') return '1 Day (24 Hours)';
  return `${expiresIn}`;
};

/**
 * Send teacher invitation email with code and explicit expiry time
 */
export const sendTeacherInvitationEmail = async ({
  to,
  inviteCode,
  expiresInLabel,
  expiresAt,
  universityName = 'AutoQuiz Pro University'
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const registerUrl = `${clientUrl}/faculty-register?code=${encodeURIComponent(inviteCode)}&email=${encodeURIComponent(to)}`;
  const formattedExpiry = new Date(expiresAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const subject = `Faculty Invitation Code for ${universityName} (Expires in ${expiresInLabel})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0f9ff; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #bae6fd; padding: 32px; box-shadow: 0 4px 16px rgba(14, 165, 233, 0.12); }
        .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .badge { background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; display: inline-block; }
        .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 12px 0 8px 0; }
        .desc { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
        .code-box { background: #f8fafc; border: 2px dashed #38bdf8; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
        .code-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .code-value { font-family: 'Courier New', monospace; font-size: 28px; font-weight: 800; color: #0284c7; letter-spacing: 0.1em; }
        .expiry-banner { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 18px 0; display: flex; gap: 10px; font-size: 14px; color: #92400e; }
        .btn { display: inline-block; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff !important; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 8px; margin: 16px 0; text-align: center; }
        .footer { font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">
          <span class="badge">OFFICIAL INVITATION</span>
        </div>
        <h1 class="title">Welcome to Educator Studio</h1>
        <p class="desc">
          You have been officially invited by an Administrator at <strong>${universityName}</strong> to join AutoQuiz Pro as an Educator/Teacher.
        </p>

        <div class="code-box">
          <div class="code-label">Your Single-Use Teacher Invitation Code</div>
          <div class="code-value">${inviteCode}</div>
        </div>

        <div class="expiry-banner">
          <div>
            <strong>⏱️ Expiry Notice:</strong><br>
            This code expires in <strong>${expiresInLabel}</strong> (valid until <strong>${formattedExpiry}</strong>). You will not be able to use this code after this time.
          </div>
        </div>

        <p class="desc">
          Click below to onboard and set up your Educator account. This invitation is bound to your email address (<code>${to}</code>):
        </p>

        <div style="text-align: center;">
          <a href="${registerUrl}" class="btn" target="_blank">Accept Invitation & Register</a>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
          Or open this link directly in your browser: <br>
          <a href="${registerUrl}" style="color: #0284c7; word-break: break-all;">${registerUrl}</a>
        </p>

        <div class="footer">
          AutoQuiz Pro &bull; Institutional Academic Assessment System<br>
          If you did not request or expect this invitation, please contact your university administration.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject,
    html,
    text: `You have been invited to ${universityName} on AutoQuiz Pro.\n\nYour Invitation Code: ${inviteCode}\nExpiration: ${expiresInLabel} (until ${formattedExpiry})\n\nRegister here: ${registerUrl}`
  });
};

/**
 * Send teacher approval/rejection notification
 */
export const sendTeacherApprovalNotification = async ({
  to,
  teacherName,
  approved,
  universityName = 'AutoQuiz Pro University'
}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const loginUrl = `${clientUrl}/login`;
  const subject = approved
    ? `Your Teacher Account at ${universityName} Has Been Approved`
    : `Teacher Account Status Update for ${universityName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b; }
        .card { max-width: 540px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 28px; border: 1px solid #e2e8f0; }
        .btn { display: inline-block; background: #0284c7; color: #fff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Hello ${teacherName || 'Educator'},</h2>
        ${approved
          ? `<p>Your teacher registration at <strong>${universityName}</strong> has been officially <strong>approved</strong> by the university administrator.</p>
             <p>You can now sign in to access your Educator Studio, courses, and AI quiz generation tools.</p>
             <a href="${loginUrl}" class="btn">Sign In to Dashboard</a>`
          : `<p>Your teacher registration request at <strong>${universityName}</strong> has been <strong>rejected</strong> or requires further verification.</p>
             <p>Please contact your institutional administrator for more information.</p>`
        }
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject,
    html,
    text: approved
      ? `Your teacher registration at ${universityName} has been approved. Sign in at: ${loginUrl}`
      : `Your teacher registration request at ${universityName} has been rejected. Please contact your admin.`
  });
};
