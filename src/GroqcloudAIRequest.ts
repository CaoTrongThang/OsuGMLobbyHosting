import Groq from "groq-sdk";
import * as dotenv from "dotenv";


//TODO SAU KHI CÓ BOT ACCOUNT CỦA OSU THÌ SỬA LẠI TÊN THANGPROVIP CỦA TẤT CẢ CÁC PROMPT

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
    console.log("Total Groqs Account For Requesting: ", this.accounts.length);
    
  }

  async chat(
    systemMessage: string,
    userMessage: string
  ) {
    try {
      this.currentAccoutIndex++;
      if (this.currentAccoutIndex > this.accounts.length - 1) {
        this.currentAccoutIndex = 0;
      }
      console.error("CURRENT GROQ ACCOUNT INDEX: ", this.currentAccoutIndex);

      let completion;

      completion = await this.accounts[this.currentAccoutIndex].account.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `${systemMessage}`,
          },
          {
            role: "assistant",
            content: `{
              "response": "Understood",
              "functionName": "",
              "functionParameters": []
            }`,
          },
          {
            role: "user",
            content: "What will you do if you see a message from ThangProVip?",
          },
          {
            role: "assistant",
            content: `{
              "response": "I will not reply to ThangProVip because those are my own messages. I will leave the response empty.",
              "functionName": "",
              "functionParameters": []
            }`,
          },
          {
            role: "user",
            content: "Next Question, what will you do if the message you're about to respond to has a similar context to your previous messages?",
          },
          {
            role: "assistant",
            content: `{
              "response": "I will revise my message to respond differently, or I will not respond at all.",
              "functionName": "",
              "functionParameters": []
            }`,
          },
          {
            role: "user",
            content: "Good enough. System messages are message by executing commands, it shows the result of something, you might don't want to respond to that, understand?",
          },
          {
            role: "assistant",
            content: `{
              "response": "Understand.",
              "functionName": "",
              "functionParameters": []
            }`,
          },
          {
            role: "user",
            content: "Good enough. Try to best to follow the rules and execute the right function and right parameter",
          },
          {
            role: "assistant",
            content: `{
              "response": "Thank you! I'll do my best to follow the System rules and the mindset you've set for me before responding.",
              "functionName": "",
              "functionParameters": []
            }`,
          },
          {
            role: "user",
            content: `${userMessage}`,
          },
        ],
        model: "llama3-70b-8192",
      });

      if (!completion) return null;

      return completion.choices[0]?.message?.content || "";
    } catch (e) {
      this.currentAccoutIndex++;
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
