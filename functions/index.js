const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({ region: "us-central1" });

exports.analyzeFodmap = onCall(
  {
    secrets: ["GEMINI_API_KEY"],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to use the AI Assistant."
      );
    }

    const promptText = request.data.text || "";
    const imageBase64 = request.data.image || null;
    // Default to jpeg, but respect the type sent from frontend
    const imageMimeType = request.data.mimeType || "image/jpeg";

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // --- THE FIX: Use a model from your available list ---
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
      const text = response.text();
      
      return { text: text };

    } catch (error) {
      console.error("AI Processing Error:", error);
      throw new HttpsError("internal", `AI Error: ${error.message}`);
    }
  }
);