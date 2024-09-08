import * as dotenv from "dotenv";
import { HfInference } from "@huggingface/inference";

dotenv.config();

// Initialize the Hugging Face Inference client

const apiKey = process.env.HUGGING_FACE_API_KEY;

const hf = new HfInference(apiKey);

export async function chatWithHF(systemMessage: string, userMessage: string) {
  try {
    const out = await hf.chatCompletion({
      model: process.env.AI_MODEL,
      messages: [
        {
          role: "system",
          content: `${systemMessage}`,
        },
        {
          role: "user",
          content:
            "How will you handle messages from ThangProVip and system messages?"
        },
        {
          role: "assistant",
          content: JSON.stringify({
            response: "I will not respond to messages from ThangProVip or system messages (prefixed with '!' or '!mp'). I will leave all response fields empty in such cases.",
            functionsYouWantToCall: [],
            isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory: "NO"
          }),
        },
        {
          role: "user",
          content: "What's your approach to avoiding repetitive responses?",
        },
        {
          role: "assistant",
          content: JSON.stringify({
            response: "If a message is similar to my previous responses, I will either rephrase my response to be distinctly different or not respond at all, leaving all fields empty.",
            functionsYouWantToCall: [],
            isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory: "NO"
          }),
        },
        {
          role: "user",
          content: "Summarize your key responsibilities, limitations, and response format as the Lobby Manager.",
        },
        {
          role: "assistant",
          content: JSON.stringify({
            response: "As ThangProVip, I respond to player messages, execute functions, and maintain a positive atmosphere. I can't change maps, hosts, or lobby settings. I use provided functions for moderation. I avoid repetitive responses and ignore my own or system messages.",
            functionsYouWantToCall: [],
            isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory: "NO"
          }),
        },
        {
          role: "user",
          content: `${userMessage}`,
        },
      ],
      max_tokens: 1700,
      temperature: 0.4,
      seed: 0,
    });

    return out.choices[0].message.content;
  } catch (e) {
    console.log(e);
    return JSON.stringify({
      response: "I'm numb now, can't loading....",
      functionsYouWantToCall: [],
      isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory: "NO"
    });
  }
}
