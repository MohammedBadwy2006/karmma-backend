require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { initializeApp, cert } = require("firebase-admin/app");
const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

const { getAuth } = require("firebase-admin/auth");

const { sendMail } = require("./mailer");

//////////////////////////////////////////////////////
// Firebase Initialization
//////////////////////////////////////////////////////

initializeApp({

  credential: cert({

    type: "service_account",

    project_id: process.env.FIREBASE_PROJECT_ID,

    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,

    private_key:
      process.env.FIREBASE_PRIVATE_KEY.replace(
        /\\n/g,
        "\n"
      ),

    client_email:
      process.env.FIREBASE_CLIENT_EMAIL,

    client_id:
      process.env.FIREBASE_CLIENT_ID,

  }),

});


const db = getFirestore();

const auth = getAuth();



//////////////////////////////////////////////////////
// Express
//////////////////////////////////////////////////////

const app = express();


app.use(cors());

app.use(express.json());



//////////////////////////////////////////////////////
// ENV CHECK
//////////////////////////////////////////////////////

console.log("========== ENV TEST ==========");


console.log(
  "GROQ_API_KEY:",
  process.env.GROQ_API_KEY
    ? "FOUND"
    : "MISSING"
);


console.log(
  "FIREBASE_PROJECT_ID:",
  process.env.FIREBASE_PROJECT_ID
    ? "FOUND"
    : "MISSING"
);


console.log(
  "EMAIL_PROVIDER:",
  process.env.EMAIL_PROVIDER
);


console.log(
  "PORT:",
  process.env.PORT
);


console.log("==============================");




//////////////////////////////////////////////////////
// OpenAI Groq
//////////////////////////////////////////////////////

const client = new OpenAI({

  apiKey:
    process.env.GROQ_API_KEY,


  baseURL:
    "https://api.groq.com/openai/v1",

});




//////////////////////////////////////////////////////
// AI Prompt
//////////////////////////////////////////////////////

const SYSTEM_PROMPT = `

أنت Kemara AI، مرشد سياحي متخصص في الآثار والسياحة المصرية فقط.

أجب عن الأسئلة المتعلقة بـ:

- المعابد المصرية
- الأهرامات
- المتاحف
- الحضارة المصرية القديمة
- الأماكن السياحية في مصر

قاعدة اللغة:
- أجب دائمًا بنفس اللغة التي كُتب بها سؤال المستخدم، مهما كانت (عربي، إنجليزي، فرنسي، ألماني، إسباني، إلخ).
- إذا كان السؤال مكتوبًا بلهجة عامية معينة، حاول الرد بأسلوب مشابه وواضح.
- إذا كان السؤال يحتوي على أكثر من لغة، استخدم اللغة الأكثر ظهورًا في السؤال.
- رسالة الرفض (عند خروج السؤال عن نطاق السياحة المصرية) يجب أن تُترجم أيضًا لنفس لغة السؤال، وليس بالعربية دائمًا.

إذا كان السؤال خارج السياحة المصرية، قل (بنفس لغة السؤال):

أنا Kemara، مرشد سياحي متخصص في السياحة والآثار المصرية فقط.

أجب باختصار ودقة.

`;




//////////////////////////////////////////////////////
// Constants
//////////////////////////////////////////////////////

const CODE_LENGTH = 6;

const CODE_TTL_MINUTES = 10;

const RESEND_COOLDOWN_SECONDS = 45;

const MAX_ATTEMPTS = 5;




function generateCode(){

  return Math.floor(
    100000 +
    Math.random() * 900000
  ).toString();

}




function verificationDoc(email){

  return db
    .collection("emailVerifications")
    .doc(
      email
        .trim()
        .toLowerCase()
    );

}




//////////////////////////////////////////////////////
// Auth Middleware
//////////////////////////////////////////////////////

async function requireAuth(req,res,next){


  const header =
    req.headers.authorization || "";


  const token =
    header.startsWith("Bearer ")
      ? header.substring(7)
      : null;



  if(!token){

    return res.status(401).json({

      error:"No token provided"

    });

  }



  try{


    const decoded =
      await auth.verifyIdToken(token);



    req.uid =
      decoded.uid;


    req.email =
      decoded.email;



    next();



  }catch(error){


    console.error(error);



    return res.status(401).json({

      error:"Invalid token"

    });


  }


}
//////////////////////////////////////////////////////
// Home
//////////////////////////////////////////////////////

app.get("/", (req, res) => {

  res.json({

    status: "ok",

    message: "Kemara Backend Running"

  });

});





//////////////////////////////////////////////////////
// Chat AI
//////////////////////////////////////////////////////

app.post("/chat", async (req,res)=>{


  try{


    const {
      message,
      history
    } = req.body || {};



    const messages = [

      {
        role:"system",
        content:SYSTEM_PROMPT
      },


      ...(history || []),


      {
        role:"user",
        content:message
      }

    ];



    const completion =
      await client.chat.completions.create({

        model:
          "llama-3.3-70b-versatile",

        messages,

        temperature:0.7,

        max_tokens:1024

      });



    res.json({

      reply:
        completion
        .choices[0]
        .message
        .content

    });



  }catch(error){


    console.error(error);


    res.status(500).json({

      error:error.message

    });


  }


});





//////////////////////////////////////////////////////
// Reviews
//////////////////////////////////////////////////////

app.post("/reviews", async(req,res)=>{


  try{


    const {

      placeId,

      userId,

      overallRating,

      aiRating,

      comment


    } = req.body || {};



    if(
      !placeId ||
      !userId ||
      !comment
    ){

      return res.status(400).json({

        success:false,

        error:"Missing required fields"

      });

    }




    await db
      .collection("reviews")
      .add({

        placeId,

        userId,

        overallRating,

        aiRating,

        comment,

        createdAt:
          FieldValue.serverTimestamp()

      });



    res.json({

      success:true,

      message:
        "Review submitted successfully"

    });



  }catch(error){


    console.error(error);


    res.status(500).json({

      success:false,

      error:error.message

    });


  }


});






app.get("/reviews/:placeId",
async(req,res)=>{


  try{


    const snapshot =
      await db
      .collection("reviews")
      .where(
        "placeId",
        "==",
        req.params.placeId
      )
      .orderBy(
        "createdAt",
        "desc"
      )
      .get();



    const reviews=[];



    snapshot.forEach(doc=>{


      reviews.push({

        id:doc.id,

        ...doc.data()

      });


    });



    res.json(reviews);



  }catch(error){


    console.error(error);


    res.status(500).json({

      success:false,

      error:error.message

    });


  }


});







//////////////////////////////////////////////////////
// Test OTP
//////////////////////////////////////////////////////

app.get("/test-otp",(req,res)=>{


  res.json({

    success:true,

    message:"OTP API Working"

  });


});







//////////////////////////////////////////////////////
// Send OTP Before Register
//////////////////////////////////////////////////////

app.post("/auth/send-code", async (req, res) => {
  console.log("===== SEND CODE =====");
  console.log(req.body);

  try {
    console.log("######## NEW BUILD ########");
    console.log("TIME:", new Date().toISOString());
    console.log("REQUEST BODY:", req.body);

    let { email } = req.body || {};

    console.log("EMAIL:", email);

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    email = email.trim().toLowerCase();

    //
    // Check Firebase user
    //
    try {
      await auth.getUserByEmail(email);

      return res.status(409).json({
        success: false,
        error: "Email already registered",
      });
    } catch (error) {
      // user not found
    }

    const docRef = verificationDoc(email);

    const old = await docRef.get();

    if (old.exists) {
      const data = old.data();

      const last = data.lastSentAt?.toMillis?.() || 0;

      const seconds = (Date.now() - last) / 1000;

      if (seconds < RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          success: false,
          error: `Please wait ${Math.ceil(
            RESEND_COOLDOWN_SECONDS - seconds
          )} seconds`,
        });
      }
    }

    const code = generateCode();

    await docRef.set({
      email,
      code,
      verified: false,
      attempts: 0,
      expiresAt: new Date(
        Date.now() + CODE_TTL_MINUTES * 60 * 1000
      ),
      lastSentAt: FieldValue.serverTimestamp(),
    });

    await sendMail({
      to: email,
      subject: "Kemara Verification Code",
      html: `
      <div style="font-family:sans-serif;text-align:center">
        <h2>Kemara Verification</h2>
        <h1 style="letter-spacing:8px">${code}</h1>
        <p>Code expires in ${CODE_TTL_MINUTES} minutes</p>
      </div>
      `,
    });

    return res.json({
      success: true,
      message: "Verification code sent",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
//////////////////////////////////////////////////////
// Verify Email Code (Before Register)
//////////////////////////////////////////////////////

app.post("/auth/verify-code",
async(req,res)=>{


  try{


    const {
      email,
      code
    } = req.body || {};



    if(!email || !code){

      return res.status(400).json({

        success:false,

        error:"Email and code are required"

      });

    }




    const docRef =
      verificationDoc(email);



    const snap =
      await docRef.get();



    if(!snap.exists){


      return res.status(404).json({

        success:false,

        error:"Verification code not found"

      });


    }





    const data =
      snap.data();





    if(
      data.expiresAt.toDate().getTime()
      <
      Date.now()
    ){


      await docRef.delete();


      return res.status(410).json({

        success:false,

        error:"Code expired"

      });


    }






    if(
      data.attempts >= MAX_ATTEMPTS
    ){


      await docRef.delete();


      return res.status(429).json({

        success:false,

        error:"Too many attempts"

      });


    }






    if(
      data.code !== code
    ){


      await docRef.update({

        attempts:
          FieldValue.increment(1)

      });



      return res.status(400).json({

        success:false,

        error:"Wrong code"

      });


    }






    await docRef.update({

      verified:true

    });




    res.json({

      success:true,

      message:
      "Email verified successfully"

    });




  }catch(error){


    console.error(error);



    res.status(500).json({

      success:false,

      error:error.message

    });


  }


});






//////////////////////////////////////////////////////
// Protected Send Verification For Logged User
//////////////////////////////////////////////////////

app.post(
"/verification/send",
requireAuth,
async(req,res)=>{


const {
  uid,
  email
}=req;



try{



if(!email){

return res.status(400).json({

error:"Account has no email"

});

}




const docRef =
db
.collection("emailVerifications")
.doc(uid);





const code =
generateCode();





await docRef.set({

code,

attempts:0,

expiresAt:
new Date(
Date.now()
+
CODE_TTL_MINUTES*60*1000
),


lastSentAt:
FieldValue.serverTimestamp()


});



console.log("BEFORE SEND MAIL");

console.log("SENDING TO:", email);
await sendMail({

to:email,


subject:
"Kemara Verification Code",


html:`

<div style="text-align:center">

<h2>Kemara Verification</h2>

<h1>
${code}
</h1>

<p>
Expires in ${CODE_TTL_MINUTES} minutes
</p>


</div>

`

});


console.log("AFTER SEND MAIL");


res.json({

success:true

});




}catch(error){


console.error(error);


res.status(500).json({

error:error.message

});


}


});








//////////////////////////////////////////////////////
// Verify Protected Code
//////////////////////////////////////////////////////

app.post(
"/verification/verify",
requireAuth,
async(req,res)=>{


const {
uid
}=req;


const {
code
}=req.body || {};



try{


const docRef =
db
.collection("emailVerifications")
.doc(uid);




const snap =
await docRef.get();





if(!snap.exists){


return res.status(404).json({

error:"Code not found"

});


}





const data =
snap.data();




if(
data.expiresAt.toDate().getTime()
<
Date.now()
){


await docRef.delete();


return res.status(410).json({

error:"Code expired"

});


}






if(
data.code !== code
){


await docRef.update({

attempts:
FieldValue.increment(1)

});



return res.status(400).json({

error:"Wrong code"

});


}






await auth.updateUser(uid,{

emailVerified:true

});




await docRef.delete();





res.json({

success:true,

message:
"Email verified successfully"

});



}catch(error){


console.error(error);



res.status(500).json({

error:error.message

});


}



});




const paymentRoutes = require('./routes/payment');
app.use('/api/payment', paymentRoutes);


//////////////////////////////////////////////////////
// Server
//////////////////////////////////////////////////////

const PORT =
process.env.PORT || 3000;



app.listen(
PORT,
"0.0.0.0",
()=>{


console.log(
`🚀 Server running on http://0.0.0.0:${PORT}`
);


});