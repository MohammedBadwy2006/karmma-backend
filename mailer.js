require("dotenv").config();

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  console.log("=== RESEND START ===");

  const result = await resend.emails.send({
    from: "Kemara <onboarding@resend.dev>",
    to,
    subject,
    html,
  });

  console.log(result);

  console.log("=== RESEND SUCCESS ===");
}

module.exports = {
  sendMail,
};