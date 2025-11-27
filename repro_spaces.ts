
import { perplexityClient } from "./src/perplexityClient";

async function run() {
  console.log("Testing listCollections...");
  try {
    // Using the account name we found earlier
    const result = await perplexityClient.listCollections("zhihong0321@gmail");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Data:", error.response.data);
    }
  }
}

run();
