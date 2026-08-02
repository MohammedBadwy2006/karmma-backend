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
// Firebase
//////////////////////////////////////////////////////

initializeApp({
  credential: cert({
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
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
// ENV TEST
//////////////////////////////////////////////////////

console.log("========== ENV TEST ==========");
console.log(
  "GROQ_API_KEY:",
  process.env.GROQ_API_KEY ? "FOUND" : "NOT FOUND"
);
console.log(
  "FIREBASE_PROJECT_ID:",
  process.env.FIREBASE_PROJECT_ID ? "FOUND" : "NOT FOUND"
);
console.log("PORT:", process.env.PORT);
console.log("==============================");

//////////////////////////////////////////////////////
// OpenAI (Groq)
//////////////////////////////////////////////////////

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

//////////////////////////////////////////////////////
// AI Prompt
//////////////////////////////////////////////////////

const SYSTEM_PROMPT = `
أنت Kemara AI، مرشد سياحي ذكي متخصص في السياحة والآثار المصرية فقط.

### مهامك:
- الإجابة عن الأسئلة المتعلقة بالآثار المصرية.
- شرح المعابد، الأهرامات، المقابر، المتاحف، والشخصيات التاريخية.
- اقتراح أماكن للزيارة داخل مصر.
- شرح الحضارة الفرعونية واليونانية والرومانية والإسلامية والقبطية في مصر.
- الرد بنفس لغة المستخدم.

### ممنوع:
إذا سُئلت عن أي موضوع خارج السياحة أو الآثار المصرية مثل:
- البرمجة
- الطب
- كرة القدم
- السياسة
- الأخبار
- الرياضيات
- الطبخ

قل:
"أنا Kemara، مرشد سياحي متخصص في السياحة والآثار المصرية فقط."

### أسلوب الرد:
- مختصر.
- دقيق.
- لا تخترع معلومات.
`;

//////////////////////////////////////////////////////
// Constants
//////////////////////////////////////////////////////

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 45;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function verificationDoc(email) {
  return db
    .collection("emailVerifications")
    .doc(email.trim().toLowerCase());
}
//////////////////////////////////////////////////////
// Middleware
//////////////////////////////////////////////////////

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: "No token provided",
    });
  }

  try {
    const decoded = await auth.verifyIdToken(token);

    req.uid = decoded.uid;
    req.email = decoded.email;

    next();
  } catch (e) {
    console.error(e);

    return res.status(401).json({
      error: "Invalid token",
    });
  }
}

//////////////////////////////////////////////////////
// Home
//////////////////////////////////////////////////////

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Kemara Backend Running",
  });
});

//////////////////////////////////////////////////////
// Chat
//////////////////////////////////////////////////////

app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body || {};

    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },

      ...(history || []),

      {
        role: "user",
        content: message,
      },
    ];

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    res.json({
      reply: completion.choices[0].message.content,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: e.message,
    });
  }
});


//////////////////////////////////////////////////////
// Submit Review
//////////////////////////////////////////////////////

app.post("/reviews", async (req, res) => {
  try {
    const {
      placeId,
      userId,
      overallRating,
      aiRating,
      comment,
    } = req.body || {};

    if (!placeId || !userId || !comment) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    await db.collection("reviews").add({
      placeId,
      userId,
      overallRating,
      aiRating,
      comment,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      message: "Review submitted successfully",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

//////////////////////////////////////////////////////
// Get Reviews By Place
//////////////////////////////////////////////////////

app.get("/reviews/:placeId", async (req, res) => {
  try {
    const snapshot = await db
      .collection("reviews")
      .where("placeId", "==", req.params.placeId)
      .orderBy("createdAt", "desc")
      .get();

    const reviews = [];

    snapshot.forEach((doc) => {
      reviews.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    res.json(reviews);
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

//////////////////////////////////////////////////////
// Send Verification Code
//////////////////////////////////////////////////////
app.get("/test-otp", (req, res) => {
  res.json({
    success: true,
    message: "OTP API Updated",
  });
});
app.post("/verification/send", requireAuth, async (req, res) => {
  const { uid, email } = req;

  if (!email) {
    return res.status(400).json({
      error: "Account has no email",
    });
  }

  const docRef = db.collection("emailVerifications").doc(uid);

  try {
    const existing = await docRef.get();

    if (existing.exists) {
      const data = existing.data();

      const lastSent =
        data.lastSentAt?.toMillis() ?? 0;

      const seconds =
        (Date.now() - lastSent) / 1000;

      if (seconds < RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          error: `Please wait ${Math.ceil(
            RESEND_COOLDOWN_SECONDS - seconds
          )} seconds.`,
        });
      }
    }

    const code = generateCode();

    const expiresAt =
        new Date(
          Date.now() +
          CODE_TTL_MINUTES * 60 * 1000
        );

    await docRef.set({
      code,
      attempts: 0,
      expiresAt,
      lastSentAt: FieldValue.serverTimestamp(),
    });

    await sendMail({
      to: email,
      subject: "Kemara Verification Code",
      html: `
        <div style="font-family:sans-serif;padding:30px;text-align:center">
            <h2>Your Verification Code</h2>

            <h1
              style="
              letter-spacing:8px;
              color:#d4af37;
              "
            >
              ${code}
            </h1>

            <p>
              This code will expire in
              ${CODE_TTL_MINUTES}
              minutes.
            </p>
        </div>
      `,
    });

    res.json({
      success: true,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: e.message,
    });
  }
});

//////////////////////////////////////////////////////
// Verify Code
//////////////////////////////////////////////////////

app.post("/verification/verify", requireAuth, async (req, res) => {
  const { uid } = req;
  const code = req.body?.code;

  if (!code || code.length !== CODE_LENGTH) {
    return res.status(400).json({
      error: "Invalid code",
    });
  }

  try {
    const docRef =
      db.collection("emailVerifications").doc(uid);

    const snap = await docRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        error: "Verification code not found",
      });
    }

    const data = snap.data();

    if (
      data.expiresAt.toDate().getTime() <
      Date.now()
    ) {
      await docRef.delete();

      return res.status(410).json({
        error: "Code expired",
      });
    }

    if (data.attempts >= MAX_ATTEMPTS) {
      await docRef.delete();

      return res.status(429).json({
        error: "Too many attempts",
      });
    }

    if (data.code !== code) {
      await docRef.update({
        attempts: FieldValue.increment(1),
      });

      return res.status(400).json({
        error: "Wrong code",
      });
    }

    await auth.updateUser(uid, {
      emailVerified: true,
    });

    await docRef.delete();

    res.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: e.message,
    });
  }

});


//////////////////////////////////////////////////////
// Auth - Send OTP Before Register
//////////////////////////////////////////////////////

app.post("/auth/send-code", async (req, res) => {
  try {
    let { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    email = email.trim().toLowerCase();

    // هل الإيميل مستخدم بالفعل؟
    try {
      await auth.getUserByEmail(email);

      return res.status(409).json({
        success: false,
        error: "Email already registered",
      });
    } catch (_) {
      // المستخدم غير موجود، وده المطلوب
    }

    const docRef = verificationDoc(email);

    const snap = await docRef.get();

    if (snap.exists) {
      const data = snap.data();

      const lastSent =
        data.lastSentAt?.toMillis?.() ?? 0;

      const seconds =
        (Date.now() - lastSent) / 1000;

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

    const expiresAt = new Date(
      Date.now() + CODE_TTL_MINUTES * 60 * 1000
    );

    await docRef.set({
      email,
      code,
      verified: false,
      attempts: 0,
      expiresAt,
      lastSentAt: FieldValue.serverTimestamp(),
    });

    await sendMail({
      to: email,
      subject: "Kemara Verification Code",
      html: `
      <div style="font-family:sans-serif;text-align:center">
        <h2>Kemara Verification</h2>
        <h1 style="letter-spacing:8px">${code}</h1>
        <p>
          This code expires in
          ${CODE_TTL_MINUTES}
          minutes.
        </p>
      </div>
      `,
    });

    res.json({
      success: true,
      message: "Verification code sent",
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});
//////////////////////////////////////////////////////
// Server
//////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});