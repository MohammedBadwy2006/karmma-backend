require("dotenv").config();

const nodemailer = require("nodemailer");

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail";

//////////////////////////////////////////////////////
// Gmail
//////////////////////////////////////////////////////

async function sendViaGmail({ to, subject, html }) {
  console.log("=== GMAIL START ===");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
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

  console.log("=== GMAIL SUCCESS ===");
}

//////////////////////////////////////////////////////
// Resend
//////////////////////////////////////////////////////

async function sendViaResend({ to, subject, html }) {
  console.log("=== RESEND START ===");

  console.log("TO:", to);

  console.log(
    "RESEND_API_KEY:",
    process.env.RESEND_API_KEY ? "FOUND" : "MISSING"
  );

  console.log(
    "RESEND_FROM:",
    process.env.RESEND_FROM || "MISSING"
  );


  const { Resend } = require("resend");

  const resend = new Resend(
    process.env.RESEND_API_KEY
  );


  console.log("BEFORE RESEND REQUEST");


  const { data, error } =
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to,
      subject,
      html,
    });


  console.log("AFTER RESEND REQUEST");

  console.log("DATA:", data);
  console.log("ERROR:", error);


  if (error) {
    throw new Error(error.message);
  }


  console.log("=== RESEND SUCCESS ===");
}


//////////////////////////////////////////////////////
// SendGrid
//////////////////////////////////////////////////////

async function sendViaSendGrid({ to, subject, html }) {
  console.log("=== SENDGRID START ===");

  const sgMail = require("@sendgrid/mail");

  sgMail.setApiKey(
    process.env.SENDGRID_API_KEY
  );

  await sgMail.send({
    to,
    from: process.env.SENDGRID_FROM,
    subject,
    html,
  });

  console.log("=== SENDGRID SUCCESS ===");
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

  console.log("===== SEND MAIL CALLED =====");

  console.log(
    "EMAIL PROVIDER:",
    EMAIL_PROVIDER
  );


  const provider =
    providers[EMAIL_PROVIDER];


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