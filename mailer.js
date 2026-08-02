require("dotenv").config();

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail";

//////////////////////////////////////////////////////
// Gmail
//////////////////////////////////////////////////////

async function sendViaGmail({ to, subject, html }) {
  const nodemailer = require("nodemailer");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Kemara" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

//////////////////////////////////////////////////////
// Resend
//////////////////////////////////////////////////////

async function sendViaResend({ to, subject, html }) {
  const { Resend } = require("resend");

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }
}

//////////////////////////////////////////////////////
// SendGrid
//////////////////////////////////////////////////////

async function sendViaSendGrid({ to, subject, html }) {
  const sgMail = require("@sendgrid/mail");

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  await sgMail.send({
    to,
    from: process.env.SENDGRID_FROM,
    subject,
    html,
  });
}

//////////////////////////////////////////////////////
// Provider
//////////////////////////////////////////////////////

const providers = {
  gmail: sendViaGmail,
  resend: sendViaResend,
  sendgrid: sendViaSendGrid,
};

async function sendMail(options) {
  const provider = providers[EMAIL_PROVIDER];

  if (!provider) {
    throw new Error(
      `Unknown EMAIL_PROVIDER: ${EMAIL_PROVIDER}`
    );
  }

  return provider(options);
}

module.exports = {
  sendMail,
};