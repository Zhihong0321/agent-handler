
import { perplexityClient } from "./src/perplexityClient";

async function run() {
  console.log("Testing listAccounts...");
  try {
    const result = await perplexityClient.listAccounts();
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
