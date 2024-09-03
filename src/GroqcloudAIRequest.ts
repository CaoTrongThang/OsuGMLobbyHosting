import Groq from "groq-sdk";
import * as dotenv from "dotenv";

dotenv.config();

class GroqCloudAIRequest {
  accounts: Groq[] = [];

  currentAccoutIndex = 0;
  constructor() {
    let apiKeys = process.env.GROQ_API_KEYS!.split(" ");
    this.accounts = apiKeys.map((x) => new Groq({ apiKey: x }));
  }

  async chat(
    systemPrompt: string,
    assistantPrompt: string,
    userPrompt: string
  ) {
    try {
      const completion = await this.accounts[
        this.currentAccoutIndex
      ].chat.completions.create({
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
}

const groqRequestAI = new GroqCloudAIRequest();
export default groqRequestAI;
