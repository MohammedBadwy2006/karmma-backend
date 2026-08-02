require("dotenv").config();

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  console.log("=== RESEND START ===");
  console.log("TO:", to);

  const result = await resend.emails.send({
    from: "Kemara <onboarding@resend.dev>",
    to,
    subject,
    html,
  });

  console.log("RESEND RESULT:");
  console.dir(result, { depth: null });

  console.log("=== RESEND SUCCESS ===");
}

module.exports = {
  sendMail,
};