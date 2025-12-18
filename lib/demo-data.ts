// Demo data for guest users to explore the app

export const demoScheduleEntries = {
  // Today's schedule
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`]: [
    {
      time: "07:00",
      endTime: "08:00",
      title: "Morning Routine",
      color: "#60A5FA",
    },
    {
      time: "09:00",
      endTime: "12:00",
      title: "Deep Work Session",
      color: "#F59E0B",
    },
    {
      time: "12:00",
      endTime: "13:00",
      title: "Lunch Break",
      color: "#34D399",
    },
    {
      time: "13:00",
      endTime: "17:00",
      title: "Meetings & Collaboration",
      color: "#8B5CF6",
    },
    {
      time: "18:00",
      endTime: "19:00",
      title: "Exercise",
      color: "#EF4444",
    },
  ],
};

export const demoProductivityRatings = {
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 1}`]: 7,
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 2}`]: 8,
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 3}`]: 6,
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 4}`]: 9,
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate() - 5}`]: 7,
};

export const demoGoals = [
  {
    id: "1",
    title: "Launch New Product – Mar 2025",
    timeframe: "Q1 2025",
    description: "Ship beta version of our productivity app",
    keyResults: [
      { id: "kr1", title: "Complete user research (Jan 12)", status: "completed" as const },
      { id: "kr2", title: "Build MVP ready for review (Feb 10)", status: "started" as const },
      { id: "kr3", title: "Get 100 beta users before Mar 01", status: "pending" as const },
    ],
  },
  {
    id: "2",
    title: "Health & Fitness – 2025 Plan",
    timeframe: "2025",
    description: "Improve overall health and wellbeing",
    keyResults: [
      { id: "kr4", title: "Exercise 4x per week (tracked Feb)", status: "completed" as const },
      { id: "kr5", title: "Sleep 8 hours daily in March", status: "started" as const },
    ],
  },
];

export const demoFocusAreas = [
  { id: "sleep", name: "Sleep", hours: "8" },
  { id: "eating", name: "Eating", hours: "2" },
  { id: "body", name: "Body functions", hours: "1" },
  { id: "work", name: "Work", hours: "8" },
  { id: "exercise", name: "Exercise", hours: "1" },
];

export const demoWeeklyNotes = {
  // This week
  [`${new Date().getFullYear()}-W${Math.ceil((new Date().getDate() - new Date().getDay() + 10) / 7)}`]: {
    content:
      "Great progress this week! Focused on deep work sessions and maintained good work-life balance.",
    dos: "Plan deep work blocks in advance\nReview priorities nightly",
    donts: "Skip warm-ups before exercise\nOverbook afternoons",
  },
};

export const demoMonthEntries = {
  [`${new Date().getFullYear()}-${new Date().getMonth() + 1}`]:
    "# Month Highlights\n\n- Launched beta version\n- Improved productivity system\n- Started new exercise routine",
};

export const demoProfile = {
  personName: "Demo User",
  dateOfBirth: "1990-01-01",
  weekStartDay: 1, // Monday
  recentYears: "2",
};
