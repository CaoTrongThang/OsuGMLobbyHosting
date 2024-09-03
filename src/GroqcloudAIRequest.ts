import Groq from "groq-sdk";
import * as dotenv from "dotenv";

dotenv.config();

class GroqAccount {
  account: Groq;
  public maxToken = 6000;

  constructor(groqAccount: Groq) {
    this.account = groqAccount;
  }
}
class GroqCloudAIRequest {
  accounts: GroqAccount[] = [];

  currentAccoutIndex = 0;

  constructor() {
    let apiKeys = process.env.GROQ_API_KEYS!.split(" ");
    for (const x of apiKeys) {
      this.accounts.push(new GroqAccount(new Groq({ apiKey: x })));
    }
  }

  async chat(
    systemPrompt: string,
    assistantPrompt: string,
    userPrompt: string
  ) {
    try {
      if(this.currentAccoutIndex >= this.accounts.length - 1){
        this.currentAccoutIndex = 0
      }

      
      let completion;

      completion = await this.accounts[
        this.currentAccoutIndex
      ].account.chat.completions.create({
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
      
      this.currentAccoutIndex++
      console.error("CURRENT ACCOUNT INDEX: ", this.currentAccoutIndex);

      if (!completion) return null;

      return completion.choices[0]?.message?.content || "";
    } catch (e) {
      this.currentAccoutIndex++
      console.log("AI REQUEST FAILED: ", e);
      return null;
    }
  }

  checkAccountToken(index: number, tokens: number) {
    return this.accounts[index].maxToken - (tokens + tokens * 0.1) <= 0;
  }

  //TODO DO THE CALCULATE TOKENS TO CALCULATE THE TOKENS AND THE MAX TOKEN FIRST BEFORE SENDING IT TO THE AI
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
