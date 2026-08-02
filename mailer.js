require("dotenv").config();

const nodemailer = require("nodemailer");


const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail";


// Debug
console.log(
  "GMAIL USER:",
  process.env.GMAIL_USER ? "FOUND" : "MISSING"
);

console.log(
  "GMAIL PASS:",
  process.env.GMAIL_PASS ? "FOUND" : "MISSING"
);



async function sendViaGmail({ to, subject, html }) {

  console.log("=== GMAIL START ===");

  const dns = require("dns");

  const transporter = nodemailer.createTransport({

    host: "smtp.gmail.com",

    port: 465,

    secure: true,

    lookup(hostname, options, callback) {

      console.log("LOOKUP:", hostname);

      dns.lookup(
        hostname,
        { family: 4, all: false },
        (err, address, family) => {

          console.log("DNS RESULT:", err, address, family);

          callback(err, address, family);

        }
      );

    },

    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },

    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,

  });

  await transporter.sendMail({

    from: `Kemara <${process.env.GMAIL_USER}>`,

    to,

    subject,

    html,

  });

  console.log("=== GMAIL SUCCESS ===");

}






async function sendViaResend({ to, subject, html }) {


  console.log("=== RESEND START ===");


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






async function sendViaSendGrid({
  to,
  subject,
  html
}){


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






const providers = {


  gmail: sendViaGmail,


  resend: sendViaResend,


  sendgrid: sendViaSendGrid,


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






module.exports = {

  sendMail

};