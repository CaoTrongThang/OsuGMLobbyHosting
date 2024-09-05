import * as fs from "fs";
import _ from "lodash";
import * as path from "path";

const utils = {
  /**
   * Generates a random number between the specified min and max values (inclusive).
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} - Random number between min and max
   */
  getRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Writes content (string or object) to a specified file.
   * @param {string | object} content - Content to write
   * @param {string} fileName - Name of the file
   * @param {string} filePath - Path where the file is located
   */
  async writeToFile(content: string | object, fileName: string, filePath: string) {
    const fullPath = path.join(__dirname, filePath, fileName);
    const data = typeof content === "object" ? JSON.stringify(content, null, 2) : content;

    console.log("🚀 ~ Writing to file:", fullPath);

    try {
      await fs.promises.writeFile(fullPath, data);
      console.log(`Data has been written to ${fullPath}`);
    } catch (error) {
      console.error(`Error writing to ${fullPath}:`, error);
    }
  },

  /**
   * Reads and returns the content of a file.
   * @param {string} fileName - Name of the file
   * @param {string} [filePath=""] - Path where the file is located
   * @returns {Promise<string>} - Content of the file as a string
   */
  async readFromFile(fileName: string, filePath: string = ""): Promise<string> {
    const fullPath = path.join(__dirname, filePath, fileName);
    try {
      return await fs.promises.readFile(fullPath, "utf-8");
    } catch (error) {
      console.error(`Error reading file ${fullPath}:`, error);
      throw error;
    }
  },

  /**
   * Formats a large number with suffixes (K, M, B).
   * @param {number} num - Number to format
   * @returns {string} - Formatted number as a string
   */
  formatNumber(num: number): string {
    const sign = Math.sign(num);
    num = Math.abs(num);

    if (num >= 1e9) return (sign * (num / 1e9)).toFixed(1) + "B";
    if (num >= 1e6) return (sign * (num / 1e6)).toFixed(1) + "M";
    if (num >= 1e3) return (sign * (num / 1e3)).toFixed(1) + "K";

    return (sign * num).toString();
  },

  /**
   * Converts seconds to a formatted time string (MM:SSs).
   * @param {number} seconds - Number of seconds
   * @returns {string} - Formatted time string
   */
  formatSeconds(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}s`;
  },

  /**
   * Formats a date to only include hours, minutes, and seconds.
   * @param {Date} date - Date object to format
   * @returns {string} - Formatted time string (HH:MM:SS)
   */
  formattedDate(date: Date): string {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  },

  /**
   * Formats input strings into columns with left and right alignment.
   * @param {string[]} input - Array of strings in the format "left | right"
   * @returns {string[]} - Formatted strings with aligned columns
   */
  formatColumns(input: string[]): string[] {
    return input.map((line) => {
      const [left, right] = line.split("|").map((part) => part.trim());
      const formattedLeft = left.padEnd(10, " ");
      const formattedRight = right.padStart(10, " ");
      return `${formattedLeft} | ${formattedRight}`;
    });
  },

  /**
   * Reads and parses a JSON file.
   * @param {string} filePath - Path to the JSON file
   * @returns {any | null} - Parsed JSON data or null on error
   */
  readJsonFile(filePath: string): any {
    const fullPath = path.join(__dirname, filePath);
    try {
      const fileContent = fs.readFileSync(fullPath, "utf-8");
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error reading or parsing JSON file ${fullPath}:`, error);
      return null;
    }
  },

  /**
   * Removes duplicate entries from an array of strings.
   * @param {string[]} arr - Array of strings
   * @returns {string[]} - Array without duplicates
   */
  removeDuplicates(arr: string[]): string[] {
    return [...new Set(arr)];
  },

  /**
   * Cleans up an indexed item JSON file, removes duplicates, and saves a new file.
   */
  cleanIndexedItemJSON() {
    const inputFile = "indexedItems.json";
    const outputFile = "indexedItemsClean.json";

    fs.readFile(inputFile, "utf8", (err, data) => {
      if (err) {
        console.error(`Error reading file ${inputFile}:`, err);
        return;
      }

      try {
        const items: any[] = JSON.parse(data);

        // Clean and transform the items, ensuring uniqueness by LocalizedName
        const result = _.uniqBy(
          items.map((item) => ({
            LocalizedName: item.LocalizedNames ? item.LocalizedNames["EN-US"] : null,
            UniqueName: item.UniqueName,
          })),
          (x) => x.LocalizedName
        );

        // Write the cleaned result to a new file
        fs.writeFile(outputFile, JSON.stringify(result, null, 2), "utf8", (err) => {
          if (err) {
            console.error(`Error writing to file ${outputFile}:`, err);
            return;
          }
          console.log(`Cleaned data saved to ${outputFile}`);
        });
      } catch (error) {
        console.error("Error parsing or transforming JSON data:", error);
      }
    });
  },
};

export default utils;
