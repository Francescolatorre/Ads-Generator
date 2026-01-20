
import { GoogleGenAI } from "@google/genai";
import { AspectRatio, Briefing, Placement } from "../types";

export async function generateAdVariant(
  baseImageBase64: string,
  placement: Placement,
  briefing: Briefing
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `
    Transform this product asset into a high-performance advertisement specifically for ${placement.name} with an aspect ratio of ${placement.aspectRatio}.
    
    GUIDELINES:
    - STYLE: ${briefing.style}
    - FOCUS: ${briefing.focus}
    - TONE: ${briefing.tone}
    - CALL TO ACTION: "${briefing.cta}" (Ensure there is space for this or integrate naturally).
    
    ACTION:
    1. Perform smart outpainting and background extension to fit the ${placement.aspectRatio} frame.
    2. Maintain absolute product consistency. Do not warp or change the core features of the product in the center.
    3. Ensure a professional, high-conversion ad look.
    4. If it's a 9:16 format, leave clear "safe zones" at the top and bottom for UI elements.
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: baseImageBase64,
              mimeType: 'image/png'
            }
          },
          { text: prompt }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: placement.aspectRatio as any
        }
      }
    });

    // Locate the image part in the response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data found in Gemini response.");
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}
