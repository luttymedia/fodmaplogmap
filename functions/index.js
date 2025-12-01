const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "us-central1" });

// Define Free Tier Limit
const FREE_TIER_LIMIT = 5;

exports.analyzeFodmap = onCall(
  {
    secrets: ["GEMINI_API_KEY"],
    cors: true,
  },
  async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to use the AI Assistant."
      );
    }

    const uid = request.auth.uid;
    const userDocRef = db.collection("users").doc(uid);

    // 2. Monetization & Credit Check (Transaction for safety)
    await db.runTransaction(async (t) => {
      const doc = await t.get(userDocRef);
      
      if (!doc.exists) {
        // Should not happen for a logged-in user, but safety first
        throw new HttpsError("not-found", "User profile not found.");
      }

      const data = doc.data();
      const userProfile = data.userProfile || {};
      const isPremium = userProfile.isPremium === true;
      const usageCount = userProfile.aiUsageCount || 0;

      // --- THE GATEKEEPER ---
      if (!isPremium && usageCount >= FREE_TIER_LIMIT) {
        throw new HttpsError(
          "resource-exhausted", // This specific code triggers the UI banner
          "You have reached the free limit."
        );
      }

      // Increment usage count server-side
      const newCount = usageCount + 1;
      
      // Update the specific field in the map
      t.set(userDocRef, {
        userProfile: {
          ...userProfile,
          aiUsageCount: newCount
        }
      }, { merge: true });
    });

    // 3. AI Logic (Only runs if the transaction above succeeds)
    const promptText = request.data.text || "";
    const imageBase64 = request.data.image || null;
    const imageMimeType = request.data.mimeType || "image/jpeg";

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Using the model confirmed by your diagnostic check
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const parts = [{ text: promptText }];
    
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64
        }
      });
    }

    try {
      const result = await model.generateContent(parts);
      const response = await result.response;
      return { text: response.text() };

    } catch (error) {
      console.error("AI Processing Error:", error);
      throw new HttpsError("internal", `AI Error: ${error.message}`);
    }
  }
);

// --- STRIPE PAYMENT INTEGRATION ---

exports.createCheckoutSession = onCall(
  {
    secrets: ["STRIPE_SECRET_KEY"],
    cors: true,
  },
  async (request) => {
    // 1. Auth Check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const uid = request.auth.uid;
    const returnUrl = request.data.returnUrl || "https://fodlog-web.onrender.com";

    try {
      // 2. Create Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "FodLog - Lifetime Premium",
                description: "Unlimited AI Assistant & Cloud Sync",
              },
              unit_amount: 799, // $7.99
            },
            quantity: 1,
          },
        ],
        success_url: `${returnUrl}?status=success`,
        cancel_url: `${returnUrl}?status=cancel`,
        metadata: {
          uid: uid, // Critical for the webhook to know who paid
          source: "web_app",
        },
        client_reference_id: uid,
      });

      return { url: session.url };
    } catch (error) {
      console.error("Stripe Session Error:", error);
      throw new HttpsError("internal", "Unable to create checkout session.");
    }
  }
);

exports.stripeWebhook = onRequest(
  {
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    cors: true, 
  },
  async (req, res) => {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      // 1. Verify Signature
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
      console.error("Webhook Signature Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 2. Handle Event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid = session.metadata.uid || session.client_reference_id;

      if (uid) {
        try {
          // 3. Fulfill Purchase (Update Firestore)
          await db.collection("users").doc(uid).set(
            {
              userProfile: {
                isPremium: true,
                premiumSince: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
          console.log(`Premium activated for user: ${uid}`);
        } catch (error) {
          console.error("Firestore Update Error:", error);
          return res.status(500).send("Database update failed");
        }
      }
    }

    res.json({ received: true });
  }
);