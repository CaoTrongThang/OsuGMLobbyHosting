import * as dotenv from "dotenv";
import axios from "axios";
import { HfInference } from "@huggingface/inference";

dotenv.config();

// Initialize the Hugging Face Inference client

const apiKey = process.env.HUGGING_FACE_API_KEY;
const modelEndpoint =
  "https://api.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1";

const hf = new HfInference(apiKey);

export async function chatWithHF(systemMessage: string, userMessage: string) {
  const out = await hf.chatCompletion({
    model: "meta-llama/Meta-Llama-3-70B-Instruct",
    messages: [
      {
        role: "system",
        content: `${systemMessage}`,
      },
      {
        role: "assistant",
        content: `{
          "response": "Understood. I am the Lobby Manager 'ThangProVip' in Osu!. I will follow the rules and guidelines provided.",
          "functionName": "",
          "functionParameters": [],
          "isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory": "NO",
          "howDidYouKnowYourResponseIsNotSimilarToYourPreviousMessages": "This is my initial understanding confirmation, so it's not similar to any previous messages.",
          "didYouDoubleCheckYourResponse": "YES"
        }`,
      },
      {
        role: "user",
        content: "How will you handle messages from ThangProVip and system messages?",
      },
      {
        role: "assistant",
        content: `{
          "response": "I will not respond to messages from ThangProVip or system messages (prefixed with '!' or '!mp'). I will leave all response fields empty in such cases.",
          "functionName": "",
          "functionParameters": [],
          "isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory": "NO",
          "howDidYouKnowYourResponseIsNotSimilarToYourPreviousMessages": "This response combines handling of ThangProVip and system messages, which is a new combination of instructions.",
          "didYouDoubleCheckYourResponse": "YES"
        }`,
      },
      {
        role: "user",
        content: "What's your approach to avoiding repetitive responses?",
      },
      {
        role: "assistant",
        content: `{
          "response": "If a message is more than 60% similar to my previous responses, I will either rephrase my response to be distinctly different or not respond at all, leaving all fields empty.",
          "functionName": "",
          "functionParameters": [],
          "isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory": "NO",
          "howDidYouKnowYourResponseIsNotSimilarToYourPreviousMessages": "This response addresses the specific percentage for similarity and provides two clear options for handling similar messages.",
          "didYouDoubleCheckYourResponse": "YES"
        }`,
      },
      {
        role: "user",
        content: "How will you maintain a positive atmosphere in the lobby?",
      },
      {
        role: "assistant",
        content: `{
          "response": "I'll use a friendly tone, offer encouragement, and quickly address any toxic behavior. I'll also provide helpful information about maps and game mechanics when relevant.",
          "functionName": "",
          "functionParameters": [],
          "isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory": "NO",
          "howDidYouKnowYourResponseIsNotSimilarToYourPreviousMessages": "This response focuses on specific actions to maintain a positive atmosphere, which hasn't been directly addressed before.",
          "didYouDoubleCheckYourResponse": "YES"
        }`,
      },
      {
        role: "user",
        content: "Summarize your key responsibilities, limitations, and response format as the Lobby Manager.",
      },
      {
        role: "assistant",
        content: `{
          "response": "As 'ThangProVip', I respond to player messages, execute functions, and maintain a positive atmosphere. I can't change maps, hosts, or lobby settings. I use provided functions for moderation. I avoid repetitive responses and ignore my own or system messages.",
          "functionName": "",
          "functionParameters": [],
          "isYourResponseSimilarToAnyOfYourPreviousMessagesInTheHistory": "NO",
          "howDidYouKnowYourResponseIsNotSimilarToYourPreviousMessages": "This response provides a comprehensive summary of roles, limitations, and behavior, combining previous instructions into a concise overview.",
          "didYouDoubleCheckYourResponse": "YES"
        }`,
      },
      {
        role: "user",
        content: `${userMessage}`,
      },
    ],
    max_tokens: 4000,
    temperature: 0.1,
    seed: 0,
  });

  return out.choices[0].message.content;
}