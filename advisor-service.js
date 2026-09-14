function cleanText(value, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanContext(input) {
  const context = input && typeof input === "object" ? input : {};
  const resources = context.resources && typeof context.resources === "object"
    ? context.resources
    : {};
  const buildings = Array.isArray(context.buildings) ? context.buildings : [];
  const goals = context.goals && typeof context.goals === "object" ? context.goals : {};

  return {
    village: cleanText(context.village, 80) || "Unnamed village",
    day: Number.isFinite(Number(context.day)) ? Number(context.day) : 1,
    period: cleanText(context.period, 24) || "Morning",
    population: Number.isFinite(Number(context.population)) ? Number(context.population) : 0,
    capacity: Number.isFinite(Number(context.capacity)) ? Number(context.capacity) : 0,
    resources: {
      wood: Number.isFinite(Number(resources.wood)) ? Number(resources.wood) : 0,
      stone: Number.isFinite(Number(resources.stone)) ? Number(resources.stone) : 0,
      food: Number.isFinite(Number(resources.food)) ? Number(resources.food) : 0,
    },
    buildings: buildings.slice(0, 32).map((building) => ({
      name: cleanText(building?.name, 80),
      type: cleanText(building?.type, 40),
      status: cleanText(building?.status, 40),
      progress: Number.isFinite(Number(building?.progress)) ? Number(building.progress) : 1,
      workers: Number.isFinite(Number(building?.workers)) ? Number(building.workers) : 0,
      cycles: Number.isFinite(Number(building?.cycles)) ? Number(building.cycles) : 0,
    })),
    goals: {
      cottage: Boolean(goals.cottage),
      farm: Boolean(goals.farm),
      timber: Boolean(goals.timber),
    },
    activity: Array.isArray(context.activity)
      ? context.activity.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 6)
      : [],
  };
}

export async function createAdvisorReply(body, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    return {
      status: 503,
      body: {
        error: "The village advisor is not configured. Add OPENROUTER_API_KEY to the deployment environment.",
      },
    };
  }

  const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages = incomingMessages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        cleanText(message.content),
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: cleanText(message.content),
    }));

  if (!messages.some((message) => message.role === "user")) {
    return { status: 400, body: { error: "Ask the advisor a question first." } };
  }

  const context = cleanContext(body?.context);
  const system = [
    "You are the Village Advisor in Hearth & Hamlet, a warm and practical guide for a small medieval village builder.",
    "Answer in plain text with concise, actionable advice grounded in the current village state below.",
    "Do not invent buildings, resources, mechanics, or numbers that are not in the state. Mention the next best action first.",
    "Keep replies under 120 words. If the village is paused, say so when relevant.",
    "Current village state:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let upstream;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": options.referer || "http://localhost:5173",
        "X-OpenRouter-Title": "Hearth & Hamlet Village Advisor",
      },
      body: JSON.stringify({
        model: options.model || "deepseek/deepseek-v4-flash-0731",
        messages: [{ role: "system", content: system }, ...messages],
        reasoning: { effort: "none" },
        temperature: 0.65,
        max_tokens: 240,
      }),
    });
  } catch (error) {
    return {
      status: 502,
      body: {
        error: error?.name === "AbortError"
          ? "The advisor took too long to answer. Try again."
          : cleanText(error?.message, 180) || "The advisor is unavailable right now.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = cleanText(data?.error?.message, 180);
    return {
      status: 502,
      body: {
        error: detail ? `OpenRouter could not answer: ${detail}` : "OpenRouter could not answer right now.",
      },
    };
  }

  const message = data?.choices?.[0]?.message?.content;
  if (typeof message !== "string" || !message.trim()) {
    return { status: 502, body: { error: "The advisor returned an empty answer." } };
  }
  return { status: 200, body: { message: message.trim() } };
}
