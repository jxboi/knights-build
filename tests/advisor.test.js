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

test("advisor context includes bounded planning and workforce signals", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "Build the bakery next." } }] };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      {
        messages: [{ role: "user", content: "What is slowing the village down?" }],
        context: {
          workers: [
            {
              type: "Farmer",
              building: "Farmhouse",
              status: "Waiting for grain",
              waitingForInput: true,
            },
          ],
          buildOptions: [
            {
              type: "bakery",
              name: "Bakery",
              cost: { wood: 40, stone: 25 },
              effect: "Turns wheat into bread",
              affordable: true,
              built: 0,
              underConstruction: 1,
            },
          ],
          buildings: [
            {
              name: "Bakery",
              type: "bakery",
              status: "Processing wheat",
              priority: "priority",
            },
          ],
          insights: ["1 villager is waiting"],
        },
      },
      { apiKey: "test-key" },
    );

    assert.equal(result.status, 200);
    assert.match(requestBody.messages[0].content, /"waitingForInput": true/);
    assert.match(requestBody.messages[0].content, /"name": "Bakery"/);
    assert.match(requestBody.messages[0].content, /"affordable": true/);
    assert.match(requestBody.messages[0].content, /"underConstruction": 1/);
    assert.match(requestBody.messages[0].content, /"priority": "priority"/);
    assert.match(requestBody.messages[0].content, /"insights": \[/);
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Best move: build <exact building name>/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /avoid, skip, or hold a named building/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Respect explicit do-not or hold intent for upgrades, training, priorities, feasts, and inspection too/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /buildOptions\.built and buildOptions\.underConstruction/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Prioritize <exact building name>/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Inspect <exact building name>/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /stay on that worksite: state its current status, give one safe action, and name one thing to watch/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Inspect <exact worker role>/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /worker count or who is waiting/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Upgrade <exact building name>/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Start a feast/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /goals\.chapter/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /compact Resource: reading with its exact held amount, storage ceiling, and current trend/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /what would make a resource forecast better or worse/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Preview: <exact building name>/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("advisor retries a distinct fallback model without duplicating it", async () => {
  const previousFetch = globalThis.fetch;
  const models = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    models.push(request.model);
    if (models.length < 3) {
      return {
        ok: false,
        status: 503,
        async json() {
          return { error: { message: "temporary provider failure" } };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "A fallback answer." } }] };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      { messages: [{ role: "user", content: "What now?" }] },
      { apiKey: "test-key", model: "primary-model", fallbackModel: "fallback-model" },
    );

    assert.equal(result.status, 200);
    assert.deepEqual(models, ["primary-model", "primary-model", "fallback-model"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("advisor returns a marked local field note after provider exhaustion", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 503,
      async json() {
        return { error: { message: "temporary provider failure" } };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      { messages: [{ role: "user", content: "What should I do?" }] },
      {
        apiKey: "test-key",
        model: "primary-model",
        fallbackModel: "fallback-model",
      },
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.local, true);
    assert.match(result.body.message, /Best move:/);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("advisor stays useful without an OpenRouter key", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What should I build next?" }],
    context: {
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 1,
          underConstruction: 0,
        },
      ],
      goals: { next: { type: "house" } },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /build the Cottage/);
});

test("local advisor honors the Chronicler lens without losing grounded advice", async () => {
  const result = await createAdvisorReply({
    messages: [
      {
        role: "user",
        content: "Answer as a playful village chronicler.\n\nUser request: What should I build next?",
      },
    ],
    context: {
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /build the Cottage/);
  assert.match(result.body.message, /A small chapter, but a good one/);
});

test("local advisor gives the Quartermaster lens a precise resource margin", async () => {
  const result = await createAdvisorReply({
    messages: [{
      role: "user",
      content: "Answer as a sharp village quartermaster.\n\nUser request: What should I build next?",
    }],
    context: {
      resources: { wood: 80, stone: 40 },
      buildOptions: [{
        type: "house",
        name: "Cottage",
        cost: { wood: 30, stone: 10 },
        effect: "+2 housing capacity",
        affordable: true,
        built: 0,
        underConstruction: 0,
      }],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Margin: about 50 wood and 30 stone remain/);
});

test("local advisor keeps toolbar commands useful without a remote model", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Convene the village council." }],
    context: {
      workers: [{ waitingForInput: true }],
      insights: ["The bakery is waiting for wheat."],
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Quartermaster:/);
  assert.match(result.body.message, /Builder:/);
  assert.match(result.body.message, /Chronicler:/);
  assert.match(result.body.message, /build the Cottage/);
});

test("local advisor can turn a bottleneck question into a priority action", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What should I prioritize in the village?" }],
    context: {
      buildings: [
        {
          name: "Lumberyard",
          type: "lumberyard",
          status: "Waiting for route",
          progress: 1,
          workers: 1,
          priority: "normal",
        },
      ],
      insights: ["The lumberyard is waiting for a clear route."],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Prioritize Lumberyard/);
});

test("local advisor rescues a broad next-move question before recommending a new build", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What now?" }],
    context: {
      workers: [{ type: "Woodcutter", waitingForInput: true, status: "Waiting for route" }],
      buildings: [
        {
          name: "Well",
          type: "well",
          status: "Complete",
          progress: 1,
          workers: 1,
          priority: "normal",
        },
        {
          name: "Lumberyard",
          type: "lumberyard",
          status: "Waiting for route",
          progress: 1,
          workers: 1,
          priority: "normal",
        },
      ],
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Prioritize Lumberyard/);
  assert.doesNotMatch(result.body.message, /build the Cottage/);
});

test("local advisor resolves a stalled worksite before a build-next question", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What should I build next?" }],
    context: {
      workers: [],
      blockedSites: 1,
      buildings: [
        {
          name: "Stone mine",
          type: "mine",
          status: "Waiting for route",
          progress: 1,
          workers: 1,
          priority: "normal",
        },
      ],
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Prioritize Stone mine/);
  assert.doesNotMatch(result.body.message, /build the Cottage/);
});

test("local advisor is cautious when blocked sites lack an eligible target", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What should I build next?" }],
    context: {
      blockedSites: 2,
      buildings: [],
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Hold the next build/);
  assert.doesNotMatch(result.body.message, /build the Cottage/);
});

test("local advisor keeps a grounded blocked-worksite prompt out of workforce mode", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Which worksite is blocked? Use current building statuses, worker routes, and storage signals." }],
    context: {
      blockedSites: 2,
      workers: [{ type: "Carrier", status: "On the way" }],
      buildings: [],
      insights: ["Two worksites need attention."],
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Best move: inspect/);
  assert.doesNotMatch(result.body.message, /Workforce:/);
  assert.doesNotMatch(result.body.message, /build the Cottage/);
});

test("local advisor names the exact worksite behind a bottleneck question", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Which worksite is blocked? Use current building statuses, worker routes, and storage signals." }],
    context: {
      buildings: [
        {
          name: "Stone mine",
          type: "mine",
          status: "Waiting for route",
          progress: 1,
          workers: 1,
          priority: "normal",
        },
      ],
      workers: [{ type: "Miner", status: "Waiting for route", deliveryRetry: true }],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Inspect Stone mine/);
  assert.match(result.body.message, /Prioritize Stone mine/);
});

test("local advisor respects an explicit affordable building question", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I build the Farmhouse?" }],
    context: {
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
        {
          type: "farm",
          name: "Farmhouse",
          cost: { wood: 25, stone: 5 },
          effect: "Harvests connected grain fields",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
      goals: { next: { type: "house" } },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /build the Farmhouse/);
});

test("local advisor respects a named do-not-build question", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Why should I not build the Cottage yet?" }],
    context: {
      resources: { wood: 60, stone: 20 },
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
        {
          type: "lumberyard",
          name: "Lumberyard",
          cost: { wood: 20, stone: 10 },
          effect: "Gathers timber",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
      goals: { next: { type: "house" } },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Hold Cottage/);
  assert.doesNotMatch(result.body.message, /Best move: build the Cottage/);
});

test("local advisor treats unavailable building language as a hold", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "There is not enough wood to build the Windmill, right?" }],
    context: {
      resources: { wood: 10, stone: 40 },
      buildOptions: [
        {
          type: "windmill",
          name: "Windmill",
          cost: { wood: 50, stone: 35 },
          effect: "Improves food production",
          affordable: false,
          built: 0,
          underConstruction: 0,
        },
      ],
      goals: { next: null },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /no affordable new build|Hold/i);
  assert.doesNotMatch(result.body.message, /Best move: build the Windmill/);
});

test("local advisor can preview a building without changing the village", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What if I build the Windmill?" }],
    context: {
      resources: { wood: 80, stone: 40, food: 12, wheat: 5, wine: 0 },
      buildOptions: [
        {
          type: "windmill",
          name: "Windmill",
          cost: { wood: 50, stone: 35 },
          effect: "2 food -> 8 food per cycle",
          affordable: false,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Preview: Windmill/);
  assert.match(result.body.message, /not affordable yet/);
});

test("local advisor keeps an unaffordable named build from drifting to another choice", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I build the Windmill?" }],
    context: {
      resources: { wood: 10, stone: 40 },
      buildOptions: [
        {
          type: "windmill",
          name: "Windmill",
          cost: { wood: 50, stone: 35 },
          effect: "Improves food production",
          affordable: false,
          built: 0,
          underConstruction: 0,
        },
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
      goals: { next: { type: "house" } },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Hold Windmill/);
  assert.match(result.body.message, /40 wood/);
  assert.doesNotMatch(result.body.message, /build the Cottage/);
});

test("local advisor respects negative upgrade and focus intent", async () => {
  const context = {
    resources: { wood: 100, stone: 100 },
    buildings: [
      {
        type: "farm",
        name: "Farmhouse",
        progress: 1,
        status: "Working",
        workers: 1,
        upgradeName: "Rich soil",
        upgradeCost: { wood: 20, stone: 10 },
      },
    ],
    buildOptions: [],
    workers: [],
    goals: { next: null, chapter: [] },
  };
  const upgrade = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I not upgrade the Farmhouse?" }],
    context,
  });
  const focus = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I not inspect the Farmhouse?" }],
    context,
  });

  assert.match(upgrade.body.message, /Hold Farmhouse/);
  assert.doesNotMatch(upgrade.body.message, /Upgrade Farmhouse:/);
  assert.match(focus.body.message, /Leave Farmhouse alone/);
  assert.doesNotMatch(focus.body.message, /Inspect Farmhouse:/);
});

test("local advisor respects negative training and priority intent", async () => {
  const context = {
    resources: { wood: 100, stone: 100 },
    buildings: [
      {
        type: "school",
        name: "School",
        progress: 1,
        training: [{ type: "woodcutter", label: "Woodcutter", canTrain: true, posts: 1 }],
        trainingSession: null,
      },
      {
        type: "lumberyard",
        name: "Lumberyard",
        progress: 1,
        status: "Working",
        workers: 1,
        priority: "normal",
      },
    ],
    buildOptions: [],
    workers: [],
    goals: { next: null, chapter: [] },
  };
  const training = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I not train a Woodcutter?" }],
    context,
  });
  const priority = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I not prioritize the Lumberyard?" }],
    context,
  });

  assert.match(training.body.message, /Hold training/);
  assert.doesNotMatch(training.body.message, /Train Woodcutter:/);
  assert.match(priority.body.message, /Leave Lumberyard/);
  assert.doesNotMatch(priority.body.message, /Prioritize Lumberyard:/);
});

test("local advisor can turn recent activity into a village chronicle", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What just happened in the village?" }],
    context: {
      activity: ["The carrier delivered 5 bread to the Inn.", "A Cottage was completed."],
      insights: ["The pantry is healthy."],
      buildOptions: [],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Chronicle:/);
  assert.match(result.body.message, /carrier delivered 5 bread/);
});

test("local dispatch carries recent activity into its story", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Read today's village dispatch." }],
    context: {
      activity: ["A carrier reached the Inn with fresh bread."],
      insights: ["The pantry is healthy."],
      buildOptions: [],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Dispatch: A carrier reached the Inn/);
});

test("local advisor can point to an existing worksite", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Show me the Lumberyard." }],
    context: {
      buildings: [
        {
          name: "Lumberyard",
          type: "lumberyard",
          status: "Taking logs to Lumberyard",
          progress: 1,
          workers: 2,
          priority: "normal",
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Inspect Lumberyard/);
  assert.match(result.body.message, /Prioritize Lumberyard/);
});

test("inspector-shaped worksite prompts do not become history questions", async () => {
  const result = await createAdvisorReply({
    messages: [{
      role: "user",
      content: "Inspect this Lumberyard currently Taking logs to Lumberyard. Explain its role, then tell me whether I should prioritize, support, upgrade, or leave it alone right now.",
    }],
    context: {
      buildings: [{
        name: "Lumberyard",
        type: "lumberyard",
        status: "Taking logs to Lumberyard",
        progress: 1,
        workers: 2,
        priority: "normal",
      }],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Inspect Lumberyard/);
  assert.doesNotMatch(result.body.message, /Chronicle:/);
});

test("local advisor can point to an existing villager", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Show me the Woodcutter." }],
    context: {
      workers: [
        {
          type: "Woodcutter",
          status: "Taking logs to Lumberyard",
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Inspect Woodcutter/);
  assert.match(result.body.message, /Focus Woodcutter/);
});

test("local advisor can turn an upgrade question into a safe action", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I upgrade the Farmhouse?" }],
    context: {
      buildings: [
        {
          name: "Farmhouse",
          type: "farm",
          status: "Harvesting",
          progress: 1,
          upgradeName: "Rich soil",
          upgradeCost: { wood: 35, stone: 12 },
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Upgrade Farmhouse/);
  assert.match(result.body.message, /Rich soil/);
  assert.match(result.body.message, /35 wood and 12 stone/);
});

test("local advisor chooses an affordable upgrade when asked broadly", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What should I improve next?" }],
    context: {
      resources: { wood: 50, stone: 20 },
      buildings: [
        {
          name: "Windmill",
          type: "windmill",
          status: "Working",
          progress: 1,
          upgradeName: "Faster sails",
          upgradeCost: { wood: 45, stone: 20 },
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Upgrade Windmill/);
  assert.match(result.body.message, /Faster sails/);
});

test("local advisor explains when a named building is already improved", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I improve the Farmhouse?" }],
    context: {
      buildings: [
        {
          name: "Farmhouse",
          type: "farm",
          status: "Harvesting",
          progress: 1,
          upgrade: "Rich soil",
          upgradeName: "Rich soil",
          upgradeCost: { wood: 35, stone: 12 },
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /already improved with Rich soil/);
});

test("local advisor can offer a feast without spending food until clicked", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I hold a feast now?" }],
    context: {
      resources: { food: 80 },
      feast: null,
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Start a feast/);
  assert.match(result.body.message, /30 food/);
  assert.match(result.body.message, /45 seconds/);
});

test("local advisor does not turn a negative feast question into an action", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Should I avoid a feast for now?" }],
    context: { resources: { food: 80 } },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Skip the feast/);
  assert.doesNotMatch(result.body.message, /Start a feast/);
});

test("local advisor explains what can change a resource forecast", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What change in my village would make that resource forecast better or worse? Use the current snapshot." }],
    context: {
      resources: { food: 72 },
      trends: { food: -4 },
      runway: { food: 18 },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Forecast: food is at 72 held/);
  assert.match(result.body.message, /producer has input/);
  assert.match(result.body.message, /worsens if a worksite waits/);
});

test("local advisor gives a neutral forecast when no resource is moving", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What change in my village would make that resource forecast better or worse?" }],
    context: {
      resources: { wood: 140, food: 80 },
      trends: { wood: 0, food: 0 },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /no single resource is moving/);
  assert.doesNotMatch(result.body.message, /Best move: build/);
});

test("local advisor treats cannot-start-feast language as a hold", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "I cannot start a feast yet, right?" }],
    context: {
      resources: { food: 80 },
      buildings: [{ type: "cottage", progress: 0.4 }],
      buildOptions: [],
      workers: [],
      goals: { next: null, chapter: [] },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Skip the feast|Hold the feast/);
});

test("local advisor notices a declining resource before it is empty", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What resource is trending down?" }],
    context: {
      resources: { food: 90 },
      trends: { food: -4 },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /stabilize food/);
  assert.match(result.body.message, /losing about 4 food per minute/);
});

test("local advisor answers a resource pulse tap with exact stock and trend", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How is my wood supply doing, and what should I watch next?" }],
    context: {
      resources: { wood: 140 },
      storage: { wood: 350 },
      trends: { wood: 3 },
      buildOptions: [{
        type: "house",
        name: "Cottage",
        cost: { wood: 30 },
        effect: "+2 housing capacity",
        affordable: true,
      }],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Resource: wood is at 140 of 350 storage/);
  assert.match(result.body.message, /climbing about 3 per minute/);
  assert.doesNotMatch(result.body.message, /Best move: build the Cottage/);
});

test("local advisor keeps explicit food-building questions out of pulse mode", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How can I improve my food supply with the buildings I have?" }],
    context: {
      resources: { food: 40 },
      buildOptions: [{
        type: "farm",
        name: "Farmhouse",
        cost: { wood: 25, stone: 5 },
        effect: "Harvests connected grain fields",
        affordable: true,
        built: 0,
        underConstruction: 0,
      }],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Farmhouse/);
  assert.doesNotMatch(result.body.message, /Resource: food/);
});

test("local advisor recognizes the food resource pulse wording", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How is my food supply doing, and what should I fix or protect next?" }],
    context: {
      resources: { food: 18 },
      storage: { food: 350 },
      trends: { food: -8 },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Resource: food is at 18 of 350 storage/);
  assert.match(result.body.message, /stabilize food/);
});

test("local resource pulse does not turn a missing runway into zero minutes", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How is my food supply doing, and what should I fix or protect next?" }],
    context: {
      resources: { food: 18 },
      storage: { food: 350 },
      trends: { food: -8 },
    },
  });

  assert.equal(result.status, 200);
  assert.doesNotMatch(result.body.message, /less than a minute/);
  assert.match(result.body.message, /falling about 8 per minute/);
});

test("local advisor estimates a resource runway from the current trend", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How long will my food last?" }],
    context: {
      resources: { food: 90 },
      trends: { food: -4 },
      runway: { food: 22.5 },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Runway: food should last about 23 minutes/);
  assert.match(result.body.message, /stabilize food/);
});

test("local advisor does not invent a runway for a stable resource", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How long will my food last?" }],
    context: {
      resources: { food: 90 },
      trends: { food: 0 },
      runway: { food: null },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /no reliable depletion timer/);
  assert.doesNotMatch(result.body.message, /less than a minute/);
});

test("local advisor estimates when a named building becomes affordable", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "When can I afford the Windmill? Use current resources and trends." }],
    context: {
      resources: { wood: 20, stone: 10 },
      trends: { wood: 5, stone: 2 },
      buildOptions: [
        {
          name: "Windmill",
          type: "windmill",
          cost: { wood: 40, stone: 20 },
          affordable: false,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Timing: the Windmill is missing 20 wood and 10 stone/);
  assert.match(result.body.message, /about 5 minutes/);
});

test("local advisor is honest when affordability has no reliable ETA", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How soon can I afford the Bakery?" }],
    context: {
      resources: { wood: 20, stone: 10 },
      trends: { wood: 0, stone: 2 },
      buildOptions: [
        {
          name: "Bakery",
          type: "bakery",
          cost: { wood: 40, stone: 20 },
          affordable: false,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /no reliable ETA/);
});

test("remote advisor receives bounded resource runway estimates", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "Watch the pantry." } }] };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      {
        messages: [{ role: "user", content: "How long will food last?" }],
        context: { runway: { food: 18.5, wood: "not-a-number" } },
      },
      { apiKey: "test-key" },
    );

    assert.equal(result.status, 200);
    assert.match(requestBody.messages[0].content, /"food": 18\.5/);
    assert.match(requestBody.messages[0].content, /"wood": null/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local advisor can orient the player toward a chapter reward", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What is my next chapter challenge?" }],
    context: {
      goals: {
        chapter: [
          {
            title: "A connected village",
            description: "Lay 12 new path tiles so every neighborhood feels close.",
            progress: 4,
            target: 12,
            reward: "Willowbrook crest",
            completed: false,
          },
        ],
      },
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Next chapter: A connected village/);
  assert.match(result.body.message, /4\/12/);
  assert.match(result.body.message, /Willowbrook crest/);
});

test("local advisor reports grounded changes since the last check-in", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What changed since my last Keeper check?" }],
    context: {
      day: 8,
      period: "Dusk",
      population: 3,
      resources: { wood: 42, stone: 12, food: 19 },
      buildings: [{ name: "Cottage", type: "house" }],
      goals: {
        chapter: [{ title: "A connected village", progress: 3, target: 12 }],
      },
      previousPulse: {
        day: 7,
        period: "Morning",
        population: 2,
        resources: { wood: 30, stone: 12, food: 23 },
        buildings: [],
        chapter: [{ title: "A connected village", progress: 1, target: 12 }],
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Pulse: since Day 7 Morning/);
  assert.match(result.body.message, /wood \+12/);
  assert.match(result.body.message, /food -4/);
  assert.match(result.body.message, /population \+1/);
  assert.match(result.body.message, /new Cottage/);
  assert.match(result.body.message, /chapter progress/);
});

test("remote advisor receives a bounded previous pulse", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "The village has changed." } }] };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      {
        messages: [{ role: "user", content: "What changed since my last check?" }],
        context: {
          previousPulse: {
            day: 4,
            period: "Night",
            population: 2,
            resources: { wood: 18, food: 21 },
            buildings: ["Cottage"],
          },
        },
      },
      { apiKey: "test-key" },
    );

    assert.equal(result.status, 200);
    assert.match(requestBody.messages[0].content, /"previousPulse":/);
    assert.match(requestBody.messages[0].content, /"day": 4/);
    assert.match(requestBody.messages[0].content, /"Cottage"/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local advisor estimates the next worksite delivery", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "When will the Bakery deliver?" }],
    context: {
      buildings: [
        {
          name: "Bakery",
          type: "bakery",
          status: "Working",
          progress: 1,
          nextDelivery: 12.4,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Timing: Bakery's next delivery or work cycle is expected in about 13 seconds/);
  assert.match(result.body.message, /reaches storage/);
});

test("local advisor recommends an available School apprenticeship", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "What should I train at the School?" }],
    context: {
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          training: [
            {
              type: "builder",
              label: "Builder",
              canTrain: true,
              posts: null,
              trained: 0,
              pending: 0,
            },
            {
              type: "miner",
              label: "Miner",
              canTrain: false,
              reason: "Every miner post is already filled",
              posts: 1,
              trained: 1,
              pending: 0,
            },
          ],
          trainingSession: null,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Train Builder/);
  assert.match(result.body.message, /clearest training slot/);
});

test("remote advisor receives bounded School training options", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: "Train Builder when the School is free." } }] };
      },
    };
  };

  try {
    const result = await createAdvisorReply(
      {
        messages: [{ role: "user", content: "Should I train a Builder?" }],
        context: {
          buildings: [
            {
              name: "School",
              type: "school",
              progress: 1,
              training: [
                {
                  type: "builder",
                  label: "Builder",
                  canTrain: true,
                  reason: null,
                  posts: null,
                  trained: 0,
                  pending: 0,
                },
              ],
              trainingSession: {
                label: "Miner",
                remaining: 7.2,
                waiting: false,
              },
            },
          ],
        },
      },
      { apiKey: "test-key" },
    );

    assert.equal(result.status, 200);
    assert.match(requestBody.messages[0].content, /"canTrain": true/);
    assert.match(requestBody.messages[0].content, /"trainingSession":/);
    assert.match(requestBody.messages[0].content, /"remaining": 7\.2/);
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /Train <exact worker role>/,
    );
    assert.match(
      requestBody.messages.find((message) => message.role === "system").content,
      /how to tell whether training helped/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local advisor prefers an open trade post over a generic Builder slot", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Who should the School train next?" }],
    context: {
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          training: [
            { type: "builder", label: "Builder", canTrain: true, posts: null, trained: 0, pending: 0 },
            { type: "baker", label: "Baker", canTrain: true, posts: 2, trained: 1, pending: 0 },
          ],
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Train Baker/);
  assert.match(result.body.message, /1 open baker post/);
});

test("local advisor answers grounded workforce counts and waiting states", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How many miners do I have?" }],
    context: {
      workers: [
        { type: "Miner", status: "Working" },
        { type: "Miner", status: "Waiting for ingredients", waitingForInput: true },
        { type: "Builder", status: "Building" },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Workforce: 2 miner villagers are/);
  assert.match(result.body.message, /1 is waiting/);
});

test("school location questions stay in the inspection flow", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Where is the School?" }],
    context: {
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          status: "Complete",
          training: [],
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Inspect School/);
  assert.doesNotMatch(result.body.message, /Train/);
});

test("local three-step plans can include an open apprenticeship", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "Make me a three-step plan." }],
    context: {
      workers: [],
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          training: [
            { type: "baker", label: "Baker", canTrain: true, posts: 1, trained: 0, pending: 0 },
          ],
          trainingSession: null,
        },
      ],
      buildOptions: [],
      insights: ["The village is steady."],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Three-step plan:/);
  assert.match(result.body.message, /Train Baker/);
});

test("local advisor reports an active apprenticeship honestly", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "When will the School finish training?" }],
    context: {
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          training: [],
          trainingSession: { label: "Miner", remaining: 6.4, waiting: false },
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /already training a miner/);
  assert.match(result.body.message, /about 7 more seconds/);
});

test("local advisor follows a hidden follow-up prompt instead of its short display label", async () => {
  const result = await createAdvisorReply({
    messages: [
      {
        role: "user",
        content: "Steward instruction: answer from the current School options and open posts.\n\nUser request: What will training the Woodcutter change in my village?",
        displayContent: "What will it unlock?",
      },
    ],
    context: {
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          training: [
            { type: "woodcutter", label: "Woodcutter", canTrain: true, posts: 2, trained: 0, pending: 0 },
          ],
          trainingSession: null,
        },
      ],
      buildOptions: [
        {
          type: "house",
          name: "Cottage",
          cost: { wood: 30, stone: 10 },
          effect: "+2 housing capacity",
          affordable: true,
          built: 0,
          underConstruction: 0,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.local, true);
  assert.match(result.body.message, /Impact: training a Woodcutter/);
  assert.match(result.body.message, /Train Woodcutter/);
  assert.doesNotMatch(result.body.message, /build the Cottage/);
});

test("local advisor turns a training impact follow-up into a grounded success check", async () => {
  const result = await createAdvisorReply({
    messages: [{ role: "user", content: "How will I know the trained Woodcutter is helping?" }],
    context: {
      buildings: [
        {
          name: "School",
          type: "school",
          progress: 1,
          training: [
            { type: "woodcutter", label: "Woodcutter", canTrain: true, posts: 2, trained: 0, pending: 0 },
          ],
          trainingSession: null,
        },
      ],
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.message, /Watch for:/);
  assert.match(result.body.message, /Train Woodcutter/);
  assert.match(result.body.message, /active session/);
});
