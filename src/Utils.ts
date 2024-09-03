import * as fs from "fs";
import _ from "lodash";
import * as path from "path";

const utils = {
  getRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  // Function to write content to a file
  async writeToFile(
    content: string | object,
    fileName: string,
    filePath: string
  ) {
    let data: string;
    const fullPath = __dirname + filePath + fileName;
    // If the content is an object, convert it to a JSON string
    if (typeof content === "object") {
      data = JSON.stringify(content, null, 2);
    } else {
      data = content;
    }

    // Combine the filePath and fileName to create the full path
    console.log("🚀 ~ writeToFile ~ fullPath:", fullPath);

    // Write the data to the specified file
    await fs.writeFile(fullPath, data, (err) => {
      if (err) throw err;
      console.log(`Data has been written to ${fullPath}`);
    });
  },

  async readFromFile(fileName: string, filePath: string = "") {
    const fullPath = path.join(__dirname, filePath, fileName);
    try {
      return fs.readFileSync(fullPath).toString();
    } catch (err) {
      console.error("Error reading file:", err);
      throw err; // Re-throw the error to handle it outside this function
    }
  },

  formatNumber(num: number): string {
    const sign = Math.sign(num);
    num = Math.abs(num);

    if (num >= 1e9) {
      return (sign * (num / 1e9)).toFixed(1) + "B";
    } else if (num >= 1e6) {
      return (sign * (num / 1e6)).toFixed(1) + "M";
    } else if (num >= 1e3) {
      return (sign * (num / 1e3)).toFixed(1) + "K";
    } else {
      return (sign * num).toString();
    }
  },

  formatSeconds(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}s`;
  },
  
  formattedDate(date : Date){
    // i only want to get the hour, minute, second
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  formatColumns(input: string[]): string[] {
    return input.map((line) => {
      const [left, right] = line.split("|").map((part) => part.trim());
      const formattedLeft = left.padEnd(10, " "); // Đảm bảo cột bên trái có độ rộng 10 ký tự
      const formattedRight = right.padStart(10, " "); // Đảm bảo cột bên phải có độ rộng 10 ký tự
      return `${formattedLeft} | ${formattedRight}`;
    });
  },

  readJsonFile(filePath: string) {
    const p = path.join(__dirname, filePath);
    try {
      // Read the file content
      const fileContent = fs.readFileSync(p, "utf-8");

      // Parse and return the JSON data
      const data = JSON.parse(fileContent);
      return data;
    } catch (error) {
      console.error("Error reading or parsing JSON file:", error);
      return null;
    }
  },
  removeDuplicates(arr: string[]): string[] {
    return [...new Set(arr)];
  },
  cleanIndexedItemJSON() {
    // Read the JSON file
    fs.readFile("indexedItems.json", "utf8", (err, data) => {
      if (err) {
        console.error("Error reading the file:", err);
        return;
      }

      // Parse the JSON data
      const items: any[] = JSON.parse(data);

      // Transform the data
      const result = _.uniqBy(
        items.map((item) => ({
          LocalizedName: item.LocalizedNames
            ? item.LocalizedNames["EN-US"]
            : null,
          UniqueName: item.UniqueName,
        })),
        (x) => x.LocalizedName
      );

      // Convert the result to JSON string
      const jsonResult = JSON.stringify(result);

      // Write the transformed data to a new JSON file
      fs.writeFile("indexedItemsClean.json", jsonResult, "utf8", (err) => {
        if (err) {
          console.error("Error writing the file:", err);
          return;
        }
        console.log("File has been saved.");
      });
    });
  },
};
export default utils;
