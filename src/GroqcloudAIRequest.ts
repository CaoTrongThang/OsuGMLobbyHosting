import Groq from "groq-sdk";
import * as dotenv from "dotenv";

dotenv.config();

class GroqAIAccount {
  groqAccount: Groq | null = null;
  maxTokens: number;
  constructor(apiKey: string, maxTokens: number) {
    this.groqAccount = new Groq({ apiKey: apiKey });
    this.maxTokens = maxTokens;
  }
}

class GroqCloudAIRequest {
  accounts: GroqAIAccount[] = [];
  currentAccoutIndex = 0;
  constructor() {
    let apiKeys = process.env.GROQ_API_KEYS!.split(" ");
    for (let i = 0; i < apiKeys.length; i++) {
      this.accounts.push(new GroqAIAccount(apiKeys[i], 6000));
    }
  }

  async chat(
    systemPrompt: string,
    assistantPrompt: string,
    userPrompt: string
  ) {
    try {
      const completion = await this.accounts[
        this.currentAccoutIndex
      ].groqAccount!.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `${systemPrompt}`,
          },
          {
            role: "assistant",
            content: `${assistantPrompt}`,
          },
          {
            role: "user",
            content: `${userPrompt}`,
          },
        ],
        model: "llama3-70b-8192",
      });
      this.currentAccoutIndex++;
      if (this.currentAccoutIndex >= this.accounts.length) {
        this.currentAccoutIndex = 0;
      }
      return completion.choices[0]?.message?.content || "";
    } catch (e) {
      console.log("AI REQUEST FAILED: ", e);
      return null;
    }
  }

  calculateTokens(text: string): number {
    // Regular expression to split the text into words and punctuation
    const tokens = text.match(/\w+|[^\w\s]/g);

    // If no tokens are found, return 0
    if (!tokens) return 0;

    // Return the count of tokens
    return tokens.length;
  }
}

const groqRequestAI = new GroqCloudAIRequest();
export default groqRequestAI;
