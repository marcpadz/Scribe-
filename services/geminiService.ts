import { GoogleGenAI, Type, Schema } from "@google/genai";
import { TranscriptData } from "../types";

const getAiClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key is missing");
    }
    return new GoogleGenAI({ apiKey });
};

export const transcribeAudio = async (base64Audio: string): Promise<TranscriptData> => {
  const ai = getAiClient();

  // Schema for structured output (Array of segments)
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      segments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            start: { type: Type.NUMBER, description: "Start time in seconds" },
            end: { type: Type.NUMBER, description: "End time in seconds" },
            text: { type: Type.STRING, description: "Transcribed text content" },
          },
          required: ["start", "end", "text"],
        },
      },
    },
    required: ["segments"],
  };

  const model = "gemini-2.5-flash"; 

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "audio/wav", 
              data: base64Audio,
            },
          },
          {
            text: "Transcribe this audio accurately. Break it down into natural sentence or phrase segments with precise timestamps.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, 
      },
    });

    const text = response.text;
    if (!text) {
        throw new Error("No response from Gemini");
    }

    const parsed = JSON.parse(text) as TranscriptData;
    return parsed;
  } catch (error) {
    console.error("Transcription failed:", error);
    throw error;
  }
};

export const analyzeVideoFrames = async (frames: string[], prompt?: string): Promise<string> => {
    const ai = getAiClient();
    const model = "gemini-3-pro-preview";

    // Prepare image parts
    const imageParts = frames.map(frame => ({
        inlineData: {
            mimeType: "image/jpeg",
            data: frame
        }
    }));

    const textPart = {
        text: prompt || "Analyze these frames from a video. Describe what is happening, the mood, visual style, and any key information visible."
    };

    const response = await ai.models.generateContent({
        model,
        contents: {
            parts: [...imageParts, textPart]
        }
    });

    return response.text || "No analysis generated.";
};

export const chatWithGemini = async (history: {role: string, parts: {text: string}[]}[], message: string, context: string): Promise<string> => {
    const ai = getAiClient();
    const model = "gemini-3-pro-preview";

    const systemInstruction = `You are NeoScriber's AI Assistant. 
    You have access to the transcript of the media file the user is working on.
    
    TRANSCRIPT CONTEXT:
    ${context}
    
    Answer the user's questions based on the transcript context if applicable. 
    Keep answers concise, helpful, and friendly.`;

    const chat = ai.chats.create({
        model,
        history: history,
        config: {
            systemInstruction
        }
    });

    const response = await chat.sendMessage({ message });
    return response.text || "I couldn't generate a response.";
};