require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const app = express();

app.use(cors());
app.use(express.json());

console.log("========== ENV TEST ==========");
console.log("GROQ_API_KEY:", process.env.GROQ_API_KEY ? "FOUND" : "NOT FOUND");
console.log("PORT:", process.env.PORT);
console.log("==============================");

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

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
- أي موضوع عام

بدلاً من ذلك قل:

"أنا Kemara، مرشد سياحي متخصص في السياحة والآثار المصرية فقط."

### أسلوب الرد:
- مختصر.
- دقيق.
- لا تخترع معلومات.
`;

//////////////////////////////////////////////////////
// Home
//////////////////////////////////////////////////////

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Karmma Backend Running",
  });
});

//////////////////////////////////////////////////////
// Chat
//////////////////////////////////////////////////////

app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

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
    } = req.body;

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
// Get Reviews
//////////////////////////////////////////////////////

app.get("/reviews/:placeId", async (req, res) => {
  try {
    const snapshot = await db
      .collection("reviews")
      .where("placeId", "==", req.params.placeId)
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
// Server
//////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});