const safeCount = (value) => {
  if (value === null || value === "" || typeof value === "boolean") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
};

export const CHAPTER_GOALS = [
  {
    id: "connected-village",
    title: "A connected village",
    description: "Lay 12 new path tiles so every neighborhood feels close.",
    metric: "paths",
    target: 12,
    reward: "Willowbrook crest",
  },
  {
    id: "thriving-market",
    title: "A thriving market",
    description: "Deliver 32 food to the town hall through farms and windmills.",
    metric: "foodDelivered",
    target: 32,
    reward: "Market pennant",
  },
  {
    id: "beautiful-home",
    title: "A beautiful home",
    description: "Build one more cottage and keep a well at the heart of it.",
    metric: "beautifulHome",
    target: 1,
    reward: "Garden wreath",
  },
];

export const chapterGoalValue = (goal, { buildings = [], created = {}, delivered = {} } = {}) => {
  if (!goal) return 0;
  if (goal.metric === "paths") return Math.min(goal.target, safeCount(created?.road));
  if (goal.metric === "foodDelivered") return Math.min(goal.target, safeCount(delivered?.food));
  if (goal.metric === "beautifulHome") {
    const houses = buildings.filter(
      (building) => building?.type === "house" && building.progress === 1,
    ).length;
    return houses >= 4 && buildings.some((building) => building?.type === "well" && building.progress === 1) ? 1 : 0;
  }
  return 0;
};

export const chapterGoalState = (saved = {}, context = {}) =>
  CHAPTER_GOALS.map((goal) => {
    const progress = chapterGoalValue(goal, context);
    const completed = progress >= goal.target;
    return {
      ...goal,
      progress,
      completed,
      claimed: Boolean(saved?.[goal.id]),
    };
  });

export const completedPlayerMilestone = (
  buildings = [],
  created = {},
  type,
  starterCount = 0,
) => {
  const completed = buildings.filter(
    (building) => building?.type === type && building.progress === 1,
  ).length;
  const placed = safeCount(created?.[type]);
  return completed > starterCount || (completed > 0 && placed > 0);
};
