require("dotenv").config();

const nodemailer = require("nodemailer");

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail";

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



async function sendViaResend({ to, subject, html }) {

  console.log("=== RESEND START ===");

  console.log("TO:", to);

  console.log(
    "RESEND KEY:",
    process.env.RESEND_API_KEY ? "FOUND" : "MISSING"
  );

  console.log(
    "FROM:",
    process.env.RESEND_FROM
  );


  const { Resend } = require("resend");

  const resend = new Resend(
    process.env.RESEND_API_KEY
  );


  const result = await resend.emails.send({

    from: process.env.RESEND_FROM,

    to,

    subject,

    html,

  });


  console.log(result);


  if(result.error){

    throw new Error(
      result.error.message
    );

  }


  console.log("=== RESEND SUCCESS ===");

}




async function sendViaSendGrid({to,subject,html}){

  const sgMail = require("@sendgrid/mail");


  sgMail.setApiKey(
    process.env.SENDGRID_API_KEY
  );


  await sgMail.send({

    to,

    from: process.env.SENDGRID_FROM,

    subject,

    html

  });


}



const providers={

  gmail:sendViaGmail,

  resend:sendViaResend,

  sendgrid:sendViaSendGrid

};



async function sendMail(options){

  console.log(
    "EMAIL PROVIDER:",
    EMAIL_PROVIDER
  );


  const provider =
    providers[EMAIL_PROVIDER];


  if(!provider){

    throw new Error(
      "Unknown email provider"
    );

  }


  return provider(options);

}



module.exports={
  sendMail
};