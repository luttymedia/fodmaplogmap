const { onCall, HttpsError } = require("firebase-functions/v2/https");
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