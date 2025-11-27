
import { agentStorePromise } from "./src/agentStore";

async function run() {
    const agentStore = await agentStorePromise;
    // Create a test agent first
    await agentStore.create({
        name: "Test Agent",
        accountName: "test@example.com"
    });

    const agents = await agentStore.list();
    console.log("Agents List:", JSON.stringify({ agents }, null, 2));
}

run();
