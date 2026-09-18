function cleanText(value, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const ADVISOR_RESOURCE_KEYS = ["wood", "stone", "food", "wheat", "wine"];

function formatAdvisorRunway(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return "an unknown amount of time";
  if (value < 1) return "less than a minute";
  if (value < 2) return "about 1 minute";
  return `about ${Math.round(value)} minutes`;
}

function cleanContext(input) {
  const context = input && typeof input === "object" ? input : {};
  const resources = context.resources && typeof context.resources === "object"
    ? context.resources
    : {};
  const buildings = Array.isArray(context.buildings) ? context.buildings : [];
  const workers = Array.isArray(context.workers) ? context.workers : [];
  const buildOptions = Array.isArray(context.buildOptions) ? context.buildOptions : [];
  const goals = context.goals && typeof context.goals === "object" ? context.goals : {};
  const trends = context.trends && typeof context.trends === "object" ? context.trends : {};
  const runway = context.runway && typeof context.runway === "object" ? context.runway : {};
  const focus = context.focus && typeof context.focus === "object" ? context.focus : null;
  const cleanNumber = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
  const cleanResourceRecord = (record) =>
    Object.fromEntries(
      ["wood", "stone", "food", "wheat", "wine"].map((resource) => [
        resource,
        Math.max(0, Math.floor(cleanNumber(record?.[resource]))),
      ]),
    );
  const previousPulse = context.previousPulse && typeof context.previousPulse === "object"
    ? {
        day: Math.max(1, Math.floor(cleanNumber(context.previousPulse.day, 1))),
        period: cleanText(context.previousPulse.period, 24) || "Morning",
        population: Math.max(0, Math.floor(cleanNumber(context.previousPulse.population))),
        resources: cleanResourceRecord(context.previousPulse.resources),
        buildings: Array.isArray(context.previousPulse.buildings)
          ? context.previousPulse.buildings.map((name) => cleanText(name, 80)).filter(Boolean).slice(0, 32)
          : [],
        chapter: Array.isArray(context.previousPulse.chapter)
          ? context.previousPulse.chapter.slice(0, 6).map((goal) => ({
              title: cleanText(goal?.title, 80),
              progress: Math.max(0, Math.floor(cleanNumber(goal?.progress))),
              target: Math.max(0, Math.floor(cleanNumber(goal?.target))),
            }))
          : [],
      }
    : null;

  return {
    village: cleanText(context.village, 80) || "Unnamed village",
    day: cleanNumber(context.day, 1),
    period: cleanText(context.period, 24) || "Morning",
    paused: Boolean(context.paused),
    speed: cleanNumber(context.speed, 1),
    feast: context.feast && typeof context.feast === "object"
      ? { remaining: Math.max(0, cleanNumber(context.feast.remaining)) }
      : null,
    population: cleanNumber(context.population),
    capacity: cleanNumber(context.capacity),
    gathered: Math.max(0, Math.floor(cleanNumber(context.gathered))),
    inTransit: Math.max(0, Math.floor(cleanNumber(context.inTransit))),
    blockedSites: Math.max(0, Math.floor(cleanNumber(context.blockedSites))),
    resources: cleanResourceRecord(resources),
    storage: cleanResourceRecord(context.storage),
    trends: Object.fromEntries(
      ADVISOR_RESOURCE_KEYS.map((resource) => [
        resource,
        Math.max(-999, Math.min(999, cleanNumber(trends[resource]))),
      ]),
    ),
    runway: Object.fromEntries(
      ADVISOR_RESOURCE_KEYS.map((resource) => {
        const rawMinutes = runway[resource];
        const minutes = Number(rawMinutes);
        return [
          resource,
          rawMinutes != null && Number.isFinite(minutes)
            ? Math.max(0, Math.min(999, minutes))
            : null,
        ];
      }),
    ),
    buildings: buildings.slice(0, 32).map((building) => ({
      name: cleanText(building?.name, 80),
      type: cleanText(building?.type, 40),
      status: cleanText(building?.status, 40),
      progress: Math.max(0, Math.min(1, cleanNumber(building?.progress, 1))),
      workers: Math.max(0, Math.floor(cleanNumber(building?.workers))),
      cycles: Math.max(0, Math.floor(cleanNumber(building?.cycles))),
      stock: Math.max(0, Math.floor(cleanNumber(building?.stock))),
      stockCap: Math.max(0, Math.floor(cleanNumber(building?.stockCap))),
      nextDelivery: Math.max(0, Math.min(9999, cleanNumber(building?.nextDelivery))),
      priority: building?.priority === "priority" ? "priority" : "normal",
      upgrade: cleanText(building?.upgrade, 80) || null,
      upgradeName: cleanText(building?.upgradeName, 80) || null,
      upgradeCost: cleanResourceRecord(building?.upgradeCost),
      training: Array.isArray(building?.training)
        ? building.training.slice(0, 8).map((option) => ({
            type: cleanText(option?.type, 40),
            label: cleanText(option?.label, 40),
            canTrain: Boolean(option?.canTrain),
            reason: cleanText(option?.reason, 140) || null,
            posts: option?.posts == null ? null : Math.max(0, Math.floor(cleanNumber(option.posts))),
            trained: Math.max(0, Math.floor(cleanNumber(option?.trained))),
            pending: Math.max(0, Math.floor(cleanNumber(option?.pending))),
          }))
        : [],
      trainingSession: building?.trainingSession && typeof building.trainingSession === "object"
        ? {
            label: cleanText(building.trainingSession.label, 40) || "villager",
            remaining: Math.max(0, Math.min(9999, cleanNumber(building.trainingSession.remaining))),
            waiting: Boolean(building.trainingSession.waiting),
          }
        : null,
    })),
    workers: workers.slice(0, 32).map((worker) => ({
      type: cleanText(worker?.type, 40),
      building: cleanText(worker?.building, 80),
      status: cleanText(worker?.status, 100),
      waitingForInput: Boolean(worker?.waitingForInput),
      waitingForSpace: Boolean(worker?.waitingForSpace),
      waitingForInn: Boolean(worker?.waitingForInn),
      deliveryRetry: Boolean(worker?.deliveryRetry),
      hungry: Boolean(worker?.hungry),
    })),
    buildOptions: buildOptions.slice(0, 32).map((option) => ({
      type: cleanText(option?.type, 40),
      name: cleanText(option?.name, 80),
      cost: cleanResourceRecord(option?.cost),
      effect: cleanText(option?.effect, 180),
      affordable: Boolean(option?.affordable),
      built: Math.max(0, Math.floor(cleanNumber(option?.built))),
      underConstruction: Math.max(0, Math.floor(cleanNumber(option?.underConstruction))),
    })),
    goals: {
      cottage: Boolean(goals.cottage),
      farm: Boolean(goals.farm),
      timber: Boolean(goals.timber),
      next: goals.next && typeof goals.next === "object"
        ? {
            type: cleanText(goals.next.type, 40),
            label: cleanText(goals.next.label, 80),
            detail: cleanText(goals.next.detail, 180),
          }
        : null,
      chapter: Array.isArray(goals.chapter)
        ? goals.chapter.slice(0, 6).map((goal) => ({
            title: cleanText(goal?.title, 100),
            description: cleanText(goal?.description, 180),
            progress: Math.max(0, Math.floor(cleanNumber(goal?.progress))),
            target: Math.max(0, Math.floor(cleanNumber(goal?.target))),
            reward: cleanText(goal?.reward, 80),
            completed: Boolean(goal?.completed),
          }))
        : [],
    },
    previousPulse,
    focus: focus
      ? {
          type: cleanText(focus.type, 40),
          name: cleanText(focus.name, 80),
          status: cleanText(focus.status, 100),
        }
      : null,
    insights: Array.isArray(context.insights)
      ? context.insights.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 6)
      : [],
    activity: Array.isArray(context.activity)
      ? context.activity.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 6)
      : [],
  };
}

function buildLocalAdvisorPulseReply(context) {
  const previous = context.previousPulse;
  if (!previous) {
    return "Pulse: this is the Keeper's first check-in for this village. Ask again later and I will tell you what changed.";
  }
  const changes = [];
  for (const resource of ADVISOR_RESOURCE_KEYS) {
    const delta = Math.floor(Number(context.resources?.[resource]) || 0) - Math.floor(Number(previous.resources?.[resource]) || 0);
    if (delta) changes.push(`${resource} ${delta > 0 ? "+" : ""}${delta}`);
  }
  const populationDelta = Math.floor(Number(context.population) || 0) - Math.floor(Number(previous.population) || 0);
  if (populationDelta) changes.push(`population ${populationDelta > 0 ? "+" : ""}${populationDelta}`);
  const beforeBuildings = new Set((previous.buildings || []).map((name) => String(name)));
  const newBuildings = context.buildings
    .map((building) => building.name)
    .filter((name) => name && !beforeBuildings.has(name));
  if (newBuildings.length) changes.push(`new ${newBuildings.slice(0, 2).join(" and ")}`);
  const previousChapter = new Map((previous.chapter || []).map((goal) => [goal.title, goal]));
  const chapterMoves = context.goals.chapter
    .map((goal) => {
      const before = previousChapter.get(goal.title);
      const delta = Math.floor(Number(goal.progress) || 0) - Math.floor(Number(before?.progress) || 0);
      return delta > 0 ? `${goal.title} +${delta}` : null;
    })
    .filter(Boolean);
  if (chapterMoves.length) changes.push(`chapter progress: ${chapterMoves[0]}`);
  const since = `since Day ${Math.max(1, Math.floor(Number(previous.day) || 1))} ${previous.period || "Morning"}`;
  if (!changes.length) {
    return `Pulse: ${since}, the village is holding steady. No tracked resources, people, buildings, or chapter goals changed in the last check.`;
  }
  return `Pulse: ${since}, ${changes.join(", ")}. Keep an eye on the newest bottleneck before making another commitment.`;
}

function buildLocalAdvisorReply(context, question = "") {
  const lowerQuestion = cleanText(question, 1200).toLowerCase();
  const resources = context.resources || {};
  const namedResource = ADVISOR_RESOURCE_KEYS.find((resource) => lowerQuestion.includes(resource));
  const forecastQuestion = /forecast|make(?:s|\s+it)?\s+(?:better|worse)|better or worse/.test(lowerQuestion);
  const forecastResource = namedResource || ADVISOR_RESOURCE_KEYS.find(
    (resource) => Number(context.trends?.[resource]) < -0.1 && Number(resources[resource]) > 0,
  ) || ADVISOR_RESOURCE_KEYS.find((resource) => context.runway?.[resource] != null);
  const resourceQuestion = Boolean(
    namedResource &&
    /\b(?:supply|stock|storage|how much|how is|watch)\b/.test(lowerQuestion) &&
    !/\b(?:build(?:ing|ings)?|improve|spend|upgrade|train|priorit(?:y|ize|ise)|focus)\b/.test(lowerQuestion),
  );
  const choices = context.buildOptions.filter(
    (option) => option.type !== "road" && option.affordable,
  );
  const freshChoices = choices.filter(
    (option) => option.built === 0 && option.underConstruction === 0,
  );
  const recommendationPool = freshChoices.length ? freshChoices : choices;
  const goalChoice = choices.find((option) => option.type === context.goals.next?.type);
  const requestedOption = context.buildOptions.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  const requestedChoice = choices.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  const negativeBuildQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:build|place|choose|recommend)\b/.test(lowerQuestion);
  const avoidedChoice = negativeBuildQuestion ? requestedChoice : null;
  const choice = avoidedChoice ? null : requestedChoice || goalChoice || recommendationPool[0];
  const chroniclerVoice = /playful village chronicler/.test(lowerQuestion);
  const quartermasterVoice = /sharp (?:village )?quartermaster/.test(lowerQuestion);
  const attention = context.insights[0] || "Keep carriers moving between worksites and storage.";
  const recentChronicle = context.activity.filter(Boolean).slice(0, 2).join(" ") || "The hamlet is waiting for its next small turn.";
  const cost = choice
    ? Object.entries(choice.cost)
        .filter(([, amount]) => Number(amount) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" and ")
    : "";
  const remainingAfterChoice = choice
    ? Object.entries(choice.cost || {})
        .filter(([, amount]) => Number(amount) > 0)
        .map(([resource, amount]) => `${Math.max(0, Math.floor(Number(resources[resource]) || 0) - Number(amount))} ${resource}`)
        .join(" and ")
    : "";
  const voiceNote = chroniclerVoice
    ? " A small chapter, but a good one."
    : quartermasterVoice && remainingAfterChoice
      ? ` Margin: about ${remainingAfterChoice} remain after paying.`
      : "";
  const bestMove = choice
    ? `Best move: build the ${choice.name}. Why: it costs ${cost || "the available materials"} and ${choice.effect}.${voiceNote}`
    : "Best move: keep the village moving for a minute. Why: no affordable new build is available in the current snapshot.";
  const nextBuild = choice
    ? `Build the ${choice.name} (${cost || "materials ready"}).`
    : "Let resources accumulate until a useful build is affordable.";
  const waiting = context.workers.filter(
    (worker) =>
      worker.waitingForInput ||
      worker.waitingForSpace ||
      worker.waitingForInn ||
      worker.deliveryRetry ||
      worker.hungry,
  ).length;
  const rescueSignal = waiting > 0 || Number(context.blockedSites) > 0;
  const focusQuestion = /inspect|look\s+at|show\s+me|where\s+is/.test(lowerQuestion);
  const namedFocusTarget = context.buildings.find(
    (building) =>
      building.name &&
      lowerQuestion.includes(building.name.toLowerCase()),
  );
  const namedFocusWorker = context.workers.find(
    (worker) => worker.type && lowerQuestion.includes(worker.type.toLowerCase()),
  );
  const trainingQuestion = !focusQuestion && (
    /\b(?:train|training|trained|graduate|graduates|apprentice|which villager|which worker)\b/.test(lowerQuestion) ||
    (/\bschool\b/.test(lowerQuestion) && /\b(?:what|who|should|available|slot|opening)\b/.test(lowerQuestion))
  );
  const trainingImpactQuestion = trainingQuestion && /\b(?:unlock|change|benefit|help|happen|do)\b/.test(lowerQuestion);
  const trainingOutcomeQuestion = trainingQuestion && /\b(?:know|watch|notice|tell|measure|confirm|worked|working|helping)\b/.test(lowerQuestion);
  const school = context.buildings.find(
    (building) => building.type === "school" && building.progress >= 1,
  );
  const trainingOptions = Array.isArray(school?.training) ? school.training : [];
  const trainingLabels = ["Builder", "Woodcutter", "Miner", "Farmer", "Baker", "Carrier"];
  const requestedTrainingType = trainingLabels.find((label) =>
    lowerQuestion.includes(label.toLowerCase()),
  );
  const requestedTraining = trainingOptions.find(
    (option) => option.label === requestedTrainingType,
  );
  const trainingChoice = requestedTraining?.canTrain
    ? requestedTraining
    : trainingOptions.find((option) => option.canTrain && option.posts != null) ||
      trainingOptions.find((option) => option.canTrain);
  const workforceQuestion = /\b(?:how many|count|who|workforce|workers?)\b/.test(lowerQuestion) &&
    !trainingQuestion &&
    !/\b(?:worksite|bottleneck|blocked)\b/.test(lowerQuestion);
  const workerLabels = ["Builder", "Woodcutter", "Miner", "Farmer", "Baker", "Carrier"];
  const namedWorkerRole = workerLabels.find((label) => lowerQuestion.includes(label.toLowerCase()));
  const roleWorkers = namedWorkerRole
    ? context.workers.filter((worker) => worker.type === namedWorkerRole)
    : [];
  const upgradeQuestion = /upgrade|improve|enhance/.test(lowerQuestion);
  const namedUpgradeBuilding = context.buildings.find(
    (building) => building.name && lowerQuestion.includes(building.name.toLowerCase()),
  );
  const namedUpgradeTarget = context.buildings.find(
    (building) =>
      building.name &&
      lowerQuestion.includes(building.name.toLowerCase()) &&
      building.progress >= 1 &&
      building.upgradeName &&
      !building.upgrade,
  );
  const affordableUpgradeTarget = context.buildings.find(
    (building) =>
      building.progress >= 1 &&
      building.upgradeName &&
      !building.upgrade &&
      Object.entries(building.upgradeCost).every(
        ([resource, amount]) => context.resources[resource] >= Number(amount),
      ),
  );
  const upgradeTarget = namedUpgradeTarget || (!namedUpgradeBuilding ? affordableUpgradeTarget : null);
  const feastQuestion = /feast|celebration|construction boost/.test(lowerQuestion);
  const negativeFeastQuestion = /\b(?:avoid|skip|not|don't|do not|never|cannot|can't|unable to)\b[^.?!]{0,40}\bfeast\b/.test(lowerQuestion);
  const planningQuestion = /plan|three-step/.test(lowerQuestion);
  const chapterQuestion = /chapter|challenge|reward|side goal|milestone/.test(lowerQuestion) && !planningQuestion;
  const openChapterGoal = context.goals.chapter.find((goal) => !goal.completed);
  const priorityQuestion = lowerQuestion.includes("priorit") || lowerQuestion.includes("focus");
  const priorityEligible = (building) =>
    building && !["townhall", "cottage", "well", "watchtower", "school", "grainfield"].includes(building.type);
  const namedPriorityTarget = context.buildings.find(
    (building) =>
      priorityEligible(building) &&
      building.name &&
      lowerQuestion.includes(building.name.toLowerCase()) &&
      building.priority !== "priority" &&
      (building.progress < 1 || building.workers > 0 || !/complete/i.test(building.status)),
  );
  const suggestedPriorityTarget = namedPriorityTarget || context.buildings.find(
    (building) =>
      priorityEligible(building) &&
      building.name &&
      building.priority !== "priority" &&
      (building.progress < 1 || building.workers > 0 || /waiting|working|assigned|delivery/i.test(building.status)),
  );
  const blockedWorksite = context.buildings.find(
    (building) =>
      priorityEligible(building) &&
      (building.progress < 1 || building.workers > 0) &&
      /waiting|blocked|route|input|space|full|missing|delivery|ingredient/i.test(building.status),
  );
  const workforceMove = waiting && suggestedPriorityTarget
    ? `Prioritize ${suggestedPriorityTarget.name}, then inspect its missing input, route, or storage.`
    : waiting
      ? "Inspect the waiting work and clear its missing input, route, or storage."
      : trainingChoice
        ? `Train ${trainingChoice.label}, then watch the new ${trainingChoice.label.toLowerCase()} reach an open post.`
      : "Keep carriers moving and let the current production cycle finish.";

  if (avoidedChoice) {
    const avoidedCost = Object.entries(avoidedChoice.cost || {})
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" and ");
    const alternative = recommendationPool.find((option) => option.type !== avoidedChoice.type);
    return `Hold ${avoidedChoice.name} for now: you asked not to commit it. It would use ${avoidedCost || "the available materials"} for ${avoidedChoice.effect}. ${alternative ? `Keep the materials in reserve, or compare them with ${alternative.name}.` : "Keep those materials in reserve while the village reveals its next bottleneck."}`;
  }
  const explicitBuildQuestion = /\b(?:build|place|choose|recommend)\b/.test(lowerQuestion);
  const timingOrPreviewQuestion = /\b(?:when|how soon|how long|afford|preview|simulate|model|what if|tradeoff|worth)\b/.test(lowerQuestion);
  if (requestedOption && !requestedOption.affordable && explicitBuildQuestion && !timingOrPreviewQuestion) {
    const missing = Object.entries(requestedOption.cost || {})
      .filter(([resource, amount]) => Number(resources[resource] || 0) < Number(amount))
      .map(([resource, amount]) => `${Math.max(0, Number(amount) - Math.floor(Number(resources[resource] || 0)))} ${resource}`)
      .join(" and ");
    return `Hold ${requestedOption.name}: it is not affordable yet. Gather ${missing || "the missing materials"} before committing to it, then ask again when the resource trend is moving in the right direction.`;
  }
  const negativeUpgradeQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:upgrade|improve|enhance)\b/.test(lowerQuestion);
  const negativeTrainingQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:train|training|apprentice)\b/.test(lowerQuestion);
  const negativeFocusQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:inspect|check|visit|focus)\b/.test(lowerQuestion);
  const negativePriorityQuestion = /\b(?:avoid|skip|don't|do not|never|not|cannot|can't)\b[^.?!]{0,55}\b(?:prioriti[sz]e|focus)\b/.test(lowerQuestion);
  const namedPriorityBuilding = context.buildings.find(
    (building) => building.name && lowerQuestion.includes(building.name.toLowerCase()),
  );
  if (negativeTrainingQuestion && trainingQuestion) {
    return "Hold training for now: you asked not to commit the School to another apprentice. Keep the current opening available until the village's next need is clearer.";
  }
  if (negativeFocusQuestion && focusQuestion && namedFocusTarget) {
    return `Leave ${namedFocusTarget.name} alone for now: you asked not to inspect or focus it. Watch its status from the village view instead.`;
  }
  if (negativeUpgradeQuestion && upgradeQuestion && namedUpgradeBuilding) {
    return `Hold ${namedUpgradeBuilding.name} at its current improvement: you asked not to upgrade it. Keep its materials available for another bottleneck.`;
  }
  if (negativePriorityQuestion && priorityQuestion && namedPriorityBuilding) {
    return `Leave ${namedPriorityBuilding.name} at normal priority for now: you asked not to move it ahead of the other worksites.`;
  }

  if (resourceQuestion) {
    const held = Math.floor(Number(resources[namedResource]) || 0);
    const capacity = Math.floor(Number(context.storage?.[namedResource]) || 0);
    const trend = Math.round((Number(context.trends?.[namedResource]) || 0) * 10) / 10;
    const runway = context.runway?.[namedResource] != null && Number.isFinite(Number(context.runway[namedResource]))
      ? Number(context.runway[namedResource])
      : null;
    const storageLabel = capacity ? `${held} of ${capacity} storage` : `${held} held`;
    if (trend < -0.1) {
      return `Resource: ${namedResource} is at ${storageLabel}, falling about ${Math.abs(trend)} per minute${runway != null ? `, with roughly ${formatAdvisorRunway(runway)} left at this pace` : ""}. Best move: stabilize ${namedResource} before making a new commitment. Watch for a producer missing input, a full output store, or a hungry household.`;
    }
    if (trend > 0.1) {
      return `Resource: ${namedResource} is at ${storageLabel}, climbing about ${trend} per minute. Let the supply build unless a current worksite is waiting on it; the next useful checkpoint is a full delivery cycle.`;
    }
    return `Resource: ${namedResource} is at ${storageLabel} and steady. No reliable runway or shortage is visible in this snapshot; keep an eye on the next delivery before spending it on a major commitment.`;
  }

  if (forecastQuestion && !forecastResource) {
    return "Forecast: no single resource is moving in a meaningful direction in this snapshot, so there is no reliable better-or-worse call yet. Recheck after the next delivery cycle; a producer waiting for input, a full store, or a change in household demand will move the forecast first.";
  }

  if (forecastQuestion && forecastResource) {
    const held = Math.floor(Number(resources[forecastResource]) || 0);
    const trend = Math.round((Number(context.trends?.[forecastResource]) || 0) * 10) / 10;
    const runway = context.runway?.[forecastResource] != null
      ? Number(context.runway[forecastResource])
      : null;
    const direction = trend < -0.1
      ? `It is currently falling about ${Math.abs(trend)} per minute${runway != null ? `, with roughly ${formatAdvisorRunway(runway)} left at this pace` : ""}.`
      : trend > 0.1
        ? `It is currently climbing about ${trend} per minute.`
        : "Its current trend is steady, so there is no reliable directional forecast yet.";
    return `Forecast: ${forecastResource} is at ${held} held. ${direction} The forecast improves if its producer has input, workers have clear routes, and storage can receive the output; it worsens if a worksite waits, a store fills, or household demand rises. Check the ${forecastResource} trend again after the next delivery cycle.`;
  }

  if (/since|last check|last visit|what changed|what's new|catch me up|different/.test(lowerQuestion)) {
    return buildLocalAdvisorPulseReply(context);
  }

  if (trainingQuestion) {
    if (!school) {
      return "Training: the village has no completed School yet. Build one first, then I can match an apprentice to its available post.";
    }
    if (school.trainingSession) {
      return `Training: the School is already training a ${school.trainingSession.label.toLowerCase()}${school.trainingSession.waiting ? " and waiting for housing" : ` for about ${Math.ceil(school.trainingSession.remaining)} more seconds`}. Let that apprentice finish before choosing another.`;
    }
    if (requestedTraining && !requestedTraining.canTrain) {
      return `Training: a ${requestedTraining.label.toLowerCase()} is not available yet. ${requestedTraining.reason || "The School has no open post for that role."}`;
    }
    if (trainingChoice) {
      const openPosts = trainingChoice.posts == null
        ? null
        : Math.max(1, Number(trainingChoice.posts) - Number(trainingChoice.trained || 0) - Number(trainingChoice.pending || 0));
      const workplace = trainingChoice.posts == null
        ? "a flexible pair of hands for construction"
        : `${openPosts} open ${trainingChoice.label.toLowerCase()} post${openPosts === 1 ? "" : "s"}`;
      if (trainingOutcomeQuestion) {
        return `Watch for: after you click Train ${trainingChoice.label}, the School should show an active session, then the graduate should arrive and fill one of the ${workplace}. Check that the post stops reporting an empty slot before choosing another apprentice.`;
      }
      if (trainingImpactQuestion) {
        return `Impact: training a ${trainingChoice.label} would fill ${workplace}, turning the School's next cycle into a working hand for the village instead of another unassigned villager. The change begins only after you click Train ${trainingChoice.label}; watch that post for its first useful cycle.`;
      }
      return `Train ${trainingChoice.label}: the School can prepare ${trainingChoice.label.toLowerCase()}s for ${workplace}. This is the clearest training slot in the current snapshot; start it only if you want to commit the School for the next cycle.`;
    }
    return "Training: every School option is occupied or blocked. Check housing and completed work posts before training another villager.";
  }

  if (workforceQuestion && namedWorkerRole) {
    const waiting = roleWorkers.filter(
      (worker) => worker.waitingForInput || worker.waitingForSpace || worker.waitingForInn || worker.deliveryRetry || worker.hungry,
    ).length;
    const roles = roleWorkers.length === 1 ? "villager is" : "villagers are";
    return `Workforce: ${roleWorkers.length} ${namedWorkerRole.toLowerCase()} ${roles} in the current snapshot${waiting ? `; ${waiting} ${waiting === 1 ? "is" : "are"} waiting` : " and none report a blocked state"}.`;
  }
  if (workforceQuestion && /waiting|idle|stuck|blocked/.test(lowerQuestion)) {
    const waitingList = context.workers
      .filter((worker) => worker.waitingForInput || worker.waitingForSpace || worker.waitingForInn || worker.deliveryRetry || worker.hungry)
      .slice(0, 4);
    return waitingList.length
      ? `Workforce: ${waitingList.map((worker) => `${worker.type} (${worker.status || "waiting"})`).join(", ")}. Inspect the first bottleneck before adding another job.`
      : "Workforce: no villager currently reports a waiting, hungry, or blocked state.";
  }

  if (upgradeQuestion && namedUpgradeBuilding && !namedUpgradeTarget && namedUpgradeBuilding.upgrade) {
    return `${namedUpgradeBuilding.name} is already improved with ${namedUpgradeBuilding.upgrade}. Keep it working unless another bottleneck needs the resources.`;
  }
  if (upgradeQuestion && upgradeTarget) {
    const upgradeCost = Object.entries(upgradeTarget.upgradeCost)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" and ");
    return `Upgrade ${upgradeTarget.name}: ${upgradeTarget.upgradeName} would improve this worksite. It costs ${upgradeCost || "the available materials"}.`;
  }
  if (feastQuestion) {
    if (negativeFeastQuestion) {
      return "Skip the feast for now: keep 30 food in reserve until a large construction cycle or a fuller pantry makes the boost worthwhile.";
    }
    if (context.feast?.remaining > 0) {
      return `The village feast is already underway for about ${Math.ceil(context.feast.remaining)} more seconds. Let builders enjoy the faster rhythm.`;
    }
    const food = context.resources.food;
    if (food < 30) {
      return `Hold the feast: the village needs ${30 - food} more food. A feast spends 30 food for 45 seconds of 25% faster construction.`;
    }
    return "Start a feast: spend 30 food for 45 seconds of 25% faster construction. It is worth using while a large build is receiving materials.";
  }
  if (chapterQuestion) {
    if (!openChapterGoal) {
      return "The chapter board is clear. Keep building the village you want, and let the next story emerge from your choices.";
    }
    return `Next chapter: ${openChapterGoal.title} is at ${openChapterGoal.progress}/${openChapterGoal.target}. Why it matters: ${openChapterGoal.description} Reward: ${openChapterGoal.reward}.`;
  }
  if (/\b(?:what happened|what just|recent|news|history|activity|log)\b/.test(lowerQuestion)) {
    const activity = context.activity.filter(Boolean).slice(0, 3);
    return activity.length
      ? `Chronicle: ${activity.join(" ")} Watch for: ${attention}`
      : "Chronicle: the village has no recent entries to report yet. Let one work cycle or delivery complete, then ask again.";
  }
  const decliningResource = Object.entries(context.trends).find(
    ([, value]) => Number(value) < -1,
  );
  if (
    decliningResource &&
    !/when can|how soon|how long until|when will.*afford|can i afford/.test(lowerQuestion) &&
    /trend|declin|running out|shortage|losing/.test(lowerQuestion)
  ) {
    const [resource, trend] = decliningResource;
    return `Best move: stabilize ${resource}. Why: the current village trend is losing about ${Math.abs(Math.floor(Number(trend)))} ${resource} per minute. Watch for a producer that needs input, a full output store, or a hungry household.`;
  }
  const runwayQuestion = /how long|last|run out|runout|survive|runway|empty/.test(lowerQuestion);
  const namedRunwayResource = ADVISOR_RESOURCE_KEYS.find((resource) => lowerQuestion.includes(resource));
  const runwayResource = namedRunwayResource || Object.entries(context.runway || {})
    .find(([, minutes]) => Number.isFinite(Number(minutes)) && Number(minutes) <= 5)?.[0];
  if (runwayQuestion && runwayResource) {
    const minutes = context.runway?.[runwayResource];
    if (minutes != null && Number.isFinite(Number(minutes))) {
      return `Runway: ${runwayResource} should last ${formatAdvisorRunway(minutes)} at the current pace. Best move: stabilize ${runwayResource} before spending it on another project, then watch the ${runwayResource} trend for a minute.`;
    }
    return `Runway: the village is not currently losing ${runwayResource}, so there is no reliable depletion timer. Watch its trend before committing the stockpile.`;
  }
  const deliveryQuestion = /delivery|deliver|arrive|finish|complete/.test(lowerQuestion)
    || /when|how soon|how long/.test(lowerQuestion);
  const namedDeliveryTarget = context.buildings.find(
    (building) => building.name && lowerQuestion.includes(building.name.toLowerCase()) && Number(building.nextDelivery) > 0,
  );
  const nextDeliveryTarget = namedDeliveryTarget || context.buildings
    .filter((building) => Number(building.nextDelivery) > 0)
    .sort((a, b) => Number(a.nextDelivery) - Number(b.nextDelivery))[0];
  if (deliveryQuestion && nextDeliveryTarget) {
    const seconds = Math.max(1, Math.ceil(Number(nextDeliveryTarget.nextDelivery)));
    return `Timing: ${nextDeliveryTarget.name}'s next delivery or work cycle is expected in about ${seconds} seconds. Watch whether the output reaches storage before committing to another project.`;
  }
  const previewQuestion = /\b(?:preview|simulate|model|what if|tradeoff|worth)\b/.test(lowerQuestion);
  const namedScenarioOption = context.buildOptions.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  if (previewQuestion && namedScenarioOption) {
    const scenarioCost = Object.entries(namedScenarioOption.cost || {})
      .filter(([, amount]) => Number(amount) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" and ");
    const affordability = namedScenarioOption.affordable
      ? "It is affordable in this snapshot."
      : "It is not affordable yet, so this stays a plan rather than a commitment.";
    return `Preview: ${namedScenarioOption.name}. Cost: ${scenarioCost || "materials ready"}. Result: ${namedScenarioOption.effect} ${affordability}`;
  }
  const timingQuestion = /when can|how soon|how long until|when will.*afford|can i afford/.test(lowerQuestion);
  const namedBuildOption = context.buildOptions.find(
    (option) => option.name && lowerQuestion.includes(option.name.toLowerCase()),
  );
  if (timingQuestion && namedBuildOption) {
    const missing = Object.entries(namedBuildOption.cost || {})
      .filter(([resource, amount]) => Number(resources[resource] || 0) < Number(amount))
      .map(([resource, amount]) => [
        resource,
        Math.max(0, Number(amount) - Number(resources[resource] || 0)),
      ]);
    if (!missing.length) {
      return `Timing: the ${namedBuildOption.name} is affordable now. Best move: build the ${namedBuildOption.name}, then watch its first delivery or work cycle.`;
    }
    const waitTimes = missing.map(([resource, amount]) => {
      const trend = Number(context.trends?.[resource]) || 0;
      return trend > 0.1 ? amount / trend : null;
    });
    const missingLabel = missing.map(([resource, amount]) => `${Math.ceil(amount)} ${resource}`).join(" and ");
    if (waitTimes.some((minutes) => minutes == null)) {
      return `Timing: the ${namedBuildOption.name} is missing ${missingLabel}, but there is no reliable ETA while one of those resources is not growing. Stabilize the inputs, then ask again.`;
    }
    return `Timing: the ${namedBuildOption.name} is missing ${missingLabel}. At the current pace it should be affordable in ${formatAdvisorRunway(Math.max(...waitTimes))}. Trends can change as workers and storage shift.`;
  }

  if (focusQuestion && namedFocusTarget) {
    const canPrioritize = priorityEligible(namedFocusTarget) &&
      namedFocusTarget.priority !== "priority" &&
      (Number(namedFocusTarget.progress) < 1 || Number(namedFocusTarget.workers) > 0);
    const upgradeHint = namedFocusTarget.upgradeName && !namedFocusTarget.upgrade
      ? ` An available improvement is ${namedFocusTarget.upgradeName}.`
      : "";
    return `Inspect ${namedFocusTarget.name}: it is already in the village and its current status is ${namedFocusTarget.status || "available"}. ${namedFocusTarget.workers ? `${namedFocusTarget.workers} worker${namedFocusTarget.workers === 1 ? " is" : "s are"} assigned.` : "No worker is assigned right now."}${canPrioritize ? ` Prioritize ${namedFocusTarget.name} if you want this worksite to receive the next available hand.` : ""}${upgradeHint}`;
  }
  if (focusQuestion && namedFocusWorker) {
    return `Inspect ${namedFocusWorker.type}: this villager is currently ${namedFocusWorker.status || "working in the village"}. Focus ${namedFocusWorker.type} to keep an eye on the next route or work cycle.`;
  }

  if (priorityQuestion && suggestedPriorityTarget) {
    return `Prioritize ${suggestedPriorityTarget.name}: it is the live worksite most likely to unblock the village. Watch for: ${attention}`;
  }

  if (/\b(?:what now|what should i do|what should i build|what do i build|next move|next build|help me)\b/.test(lowerQuestion) && rescueSignal && suggestedPriorityTarget) {
    return `Prioritize ${suggestedPriorityTarget.name}: it is the clearest rescue before another build. Watch for: ${attention}`;
  }
  if (/\b(?:what now|what should i do|what should i build|what do i build|next move|next build|help me)\b/.test(lowerQuestion) && rescueSignal) {
    const bottlenecks = Number(context.blockedSites) || waiting;
    return `Hold the next build for a moment: ${bottlenecks} live bottleneck${bottlenecks === 1 ? " is" : "s are"} visible, but no single worksite is safe to name from this snapshot. Ask which worksite is blocked, then clear its route, input, or storage first.`;
  }

  if (blockedWorksite && /\b(?:blocked|stuck|waiting|bottleneck|slow|attention|which worksite)\b/.test(lowerQuestion)) {
    return `Inspect ${blockedWorksite.name}: it reports ${blockedWorksite.status || "a blocked work state"}. Prioritize ${blockedWorksite.name} while you check its missing input, route, or storage.`;
  }
  if (lowerQuestion.includes("wait") || lowerQuestion.includes("stuck") || lowerQuestion.includes("blocked")) {
    return `Best move: inspect the flagged worksites. Why: ${attention} ${waiting || context.blockedSites ? `${waiting || context.blockedSites} live bottleneck${(waiting || context.blockedSites) === 1 ? " is" : "s are"} visible in the village snapshot.` : "the workers do not currently report a blocked input or route."} Watch for: a missing ingredient, a full output store, or a route that needs help.`;
  }

  if (lowerQuestion.includes("dispatch")) {
    return `Dispatch: ${recentChronicle} Opportunity: ${nextBuild} Risk: ${attention} Next minute: ${waiting ? "inspect the waiting worksite and clear its bottleneck" : "place the next build, then watch the first delivery arrive"}. ${bestMove}`;
  }
  if (lowerQuestion.includes("council")) {
    return `Quartermaster: ${choice ? `${choice.name} is affordable at ${cost || "the current materials"}.` : "Hold resources until a useful option opens."} Builder: ${waiting ? "Clear the waiting work before adding another job." : "Give carriers a clear route to storage."} Chronicler: ${attention} Shared call: ${choice ? `build the ${choice.name} and watch its first cycle.` : "keep the village moving and watch the stores."} ${choice ? bestMove : ""}`.trim();
  }
  if (lowerQuestion.includes("compare") || lowerQuestion.includes("options")) {
    const alternatives = choices.slice(0, 2);
    if (alternatives.length > 1) {
      const comparison = alternatives
        .map((option) => {
          const optionCost = Object.entries(option.cost)
            .filter(([, amount]) => Number(amount) > 0)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(" and ");
          return `${option.name}: ${optionCost || "materials ready"}, ${option.effect}`;
        })
        .join(" Compare ");
      return `Compare: ${comparison}. ${bestMove} Watch for: ${attention}`;
    }
  }
  if (planningQuestion || lowerQuestion.includes("next chapter")) {
    return `Three-step plan: 1. ${nextBuild} 2. ${workforceMove} 3. Watch for: ${attention} ${bestMove}`;
  }
  return `${bestMove} Watch for: ${attention}`;
}

export async function createAdvisorReply(body, options = {}) {
  const apiKey = options.apiKey;
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
      ...(cleanText(message.displayContent, 1200) ? { displayContent: cleanText(message.displayContent, 1200) } : {}),
    }));

  if (!messages.some((message) => message.role === "user")) {
    return { status: 400, body: { error: "Ask the advisor a question first." } };
  }

  const context = cleanContext(body?.context);
  if (!apiKey) {
    const latestQuestion = [...messages].reverse().find((message) => message.role === "user");
    return {
      status: 200,
      body: {
        message: buildLocalAdvisorReply(context, latestQuestion?.content || latestQuestion?.displayContent || ""),
        local: true,
        notice: "No remote Keeper is configured. Showing a local field note from your current village state.",
      },
    };
  }
  const system = [
    "You are the Village Advisor in Hearth & Hamlet, a warm and practical guide for a small medieval village builder.",
    "Use a warm, lightly playful steward voice, like a sharp-eyed keeper who wants the hamlet to thrive.",
    "Answer in plain text with concise, actionable advice grounded in the current village state below.",
    "Mention the best next action first, then explain why it fits this village. Prefer exact resource counts, costs, worker statuses, and building names from the state.",
    "Only recommend a build from buildOptions. Do not invent buildings, resources, mechanics, or numbers that are not in the state.",
    "Treat buildOptions.affordable as authoritative when comparing choices; never call an unavailable option affordable.",
    "If the player asks whether to avoid, skip, or hold a named building, respect that intent: explain the missing materials or tradeoff and never present that building as the best move or an action.",
    "Respect explicit do-not or hold intent for upgrades, training, priorities, feasts, and inspection too; explain the consequence without offering the rejected action.",
    "Use buildOptions.built and buildOptions.underConstruction to avoid repetitive recommendations. Prefer an unbuilt option unless another copy clearly helps housing, storage, production, or grain-field chains.",
    "When goals.next.type matches an affordable build option, treat that next chapter as the player's current intent and explain it before offering a different option.",
    "Use goals.chapter for longer-horizon challenge questions. Prefer an incomplete chapter goal, quote its exact progress and reward, and do not claim it is complete unless its completed flag is true.",
    "Use runway when a player asks how long a resource will last. It is an estimate in minutes based on the current trend, not a promise; call out that it can change as workers, hunger, storage, or construction change.",
    "When a player taps or asks about one resource's supply, give a compact Resource: reading with its exact held amount, storage ceiling, and current trend; use runway only when it is available, then name one grounded watchpoint before suggesting a build.",
    "When asked what would make a resource forecast better or worse, identify the most relevant resource from the current trend or runway. If no resource is moving meaningfully, say that plainly and recommend checking again after the next delivery cycle; do not invent a build recommendation.",
    "When asked what just happened, what is new, or for a recent history, use the activity list as a short village chronicle. Do not invent events that are not in activity.",
    "When asked what changed since the last check-in, use previousPulse to report only grounded deltas in resources, people, buildings, or chapter progress. If previousPulse is null, say this is the first check-in; never invent a baseline.",
    "When asked for a worker count or who is waiting, use the workers list and its exact role/status fields. Do not infer a workforce count from housing capacity, building count, or wishful staffing.",
    "When asked when a named building will be affordable, use its exact cost, current resources, and positive trends for a cautious estimate. Say when it is already affordable or when no reliable ETA exists; never promise a future stockpile.",
    "When asked when a worksite will deliver or finish, use its nextDelivery estimate in seconds when present. Call it an estimate and mention that the output still needs to reach storage; never promise delivery if the field is absent.",
    "When asked what-if, preview, simulate, or tradeoff questions about a named building, explain its exact cost and effect from buildOptions, state whether it is affordable now, and begin with: Preview: <exact building name>. Never imply that a preview spends resources or changes the village.",
    "When a live construction or production building is the bottleneck, you may recommend prioritizing it. Use the exact building name and the phrase Prioritize <exact building name>; only suggest buildings present in the current buildings list.",
    "When the player should look at an existing worksite, use the exact building name and the phrase Inspect <exact building name>; only point to buildings present in the current buildings list.",
    "When an inspector question names the selected worksite, stay on that worksite: state its current status, give one safe action, and name one thing to watch before mentioning any new build.",
    "When the player should look at a villager, use the exact worker role and the phrase Inspect <exact worker role>; only point to worker roles present in the current workers list.",
    "When the player asks what to train, use the completed School's training options. Recommend only an option with canTrain true; respect an active trainingSession and explain its remaining time. Begin an actionable recommendation with Train <exact worker role>; never imply training starts without a player click.",
    "When the player asks what training unlocks or changes, explain the exact open post or construction role it fills, then include Train <exact worker role> as the safe optional action.",
    "When the player asks how to tell whether training helped, give concrete checkpoints from the current state: the School session, the graduate arriving, and the exact post or worker status improving. Include Train <exact worker role> only as a safe optional action when the option canTrain is true.",
    "When an existing completed building has an upgradeName and the player asks about improving it, you may recommend the upgrade. Use the exact building name and the phrase Upgrade <exact building name>; only suggest upgrades shown in the current buildings list and never imply an upgrade is free.",
    "When a feast would help and the village is not already feasting, you may recommend it only when food is at least 30. Use the exact phrase Start a feast and state that it spends 30 food for 45 seconds of 25% faster construction.",
    "When recommending a building, name it exactly and begin with: Best move: build <exact building name>.",
    "When useful, use this compact shape: Best move: ... Why: ... Watch for: ...",
    "Keep replies under 140 words. If the village is paused, say so when relevant. Never claim to have changed the village or clicked a control.",
    "Current village state:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  const primaryModel = options.model || "deepseek/deepseek-v4-flash-0731";
  const fallbackModel = options.fallbackModel || "deepseek/deepseek-v4-flash-0731";
  const attempts = [primaryModel, primaryModel, fallbackModel].filter(
    (model, index, list) => model && (index < 2 || model !== list[0]),
  );

  for (const model of attempts) {
    const result = await callOpenRouter({
      apiKey,
      model,
      system,
      messages: messages.map(({ role, content }) => ({ role, content })),
      referer: options.referer,
    });
    if (result.ok) {
      return { status: 200, body: { message: result.message } };
    }
    if (!result.retryable) break;
  }

  return {
    status: 200,
    body: {
      message: buildLocalAdvisorReply(
        context,
        (() => {
          const latestQuestion = [...messages].reverse().find((message) => message.role === "user");
          return latestQuestion?.content || latestQuestion?.displayContent || "";
        })(),
      ),
      local: true,
      notice: "The remote Keeper is unavailable. Showing a local field note from your current village state.",
    },
  };
}

async function callOpenRouter({ apiKey, model, system, messages, referer }) {
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
        "HTTP-Referer": referer || "http://localhost:5173",
        "X-OpenRouter-Title": "Hearth & Hamlet Village Advisor",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        reasoning: { effort: "none" },
        temperature: 0.65,
        max_tokens: 240,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      retryable: error?.name !== "AbortError",
      error: error?.name === "AbortError"
        ? "The advisor took too long to answer. Try again."
        : cleanText(error?.message, 180) || "The advisor is unavailable right now.",
    };
  } finally {
    clearTimeout(timeout);
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = cleanText(data?.error?.message, 180);
    const status = Number(data?.error?.code) || upstream.status;
    return {
      ok: false,
      retryable: status === 429 || status >= 500,
      error: detail ? `OpenRouter could not answer: ${detail}` : "OpenRouter could not answer right now.",
    };
  }

  const message = data?.choices?.[0]?.message?.content;
  if (typeof message !== "string" || !message.trim()) {
    return { ok: false, retryable: true, error: "The advisor returned an empty answer." };
  }
  return { ok: true, message: message.trim() };
}
