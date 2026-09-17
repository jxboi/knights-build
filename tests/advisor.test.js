import test from "node:test";
import assert from "node:assert/strict";
import { createAdvisorReply } from "../advisor-service.js";

test("advisor context preserves wheat and wine resources", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "Keep the bakery supplied." } }] };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      {
        messages: [{ role: "user", content: "What should I build next?" }],
        context: { resources: { wood: 1, stone: 2, food: 3, wheat: 7, wine: 9 } },
      },
      { apiKey: "test-key" },
    );

    assert.equal(result.status, 200);
    assert.match(requestBody.messages[0].content, /"wheat": 7/);
    assert.match(requestBody.messages[0].content, /"wine": 9/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
