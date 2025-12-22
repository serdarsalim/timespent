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
    archived: false,
    keyResults: [
      { id: "kr1", title: "Complete user research (Jan 12)", status: "completed" as const },
      { id: "kr2", title: "Build MVP ready for review (Feb 10)", status: "started" as const },
      { id: "kr3", title: "Get 100 beta users before Mar 01", status: "on-hold" as const },
    ],
  },
  {
    id: "2",
    title: "Health & Fitness – 2025 Plan",
    timeframe: "2025",
    description: "Improve overall health and wellbeing",
    archived: false,
    keyResults: [
      { id: "kr4", title: "Exercise 4x per week (tracked Feb)", status: "completed" as const },
      { id: "kr5", title: "Sleep 8 hours daily in March", status: "started" as const },
    ],
  },
];

export const demoWeeklyNoteTemplate = {
  content:
    "<p><em>This is an example. When you log in, you can set separate goals for each week as well as separate Do's and Don'ts lists.</em></p><p><em>Use the calendar on the left side to rate your performance against these goals, either weekly or daily.</em></p>",
  dos: "Say hello to everyone\nStay present\nBe vulnerable\nStand up straight",
  donts:
    "Don't avoid eye contact\nDon't be late\nDon't set expectations that you can't meet\nDon't eat sugar",
};

export const demoProfile = {
  personName: "Demo User",
  dateOfBirth: "1990-01-01",
  weekStartDay: 1, // Monday
  recentYears: "2",
  showLegend: true,
  weeklyGoalsTemplate:
    "<p><strong>What I want to accomplish this week:</strong></p><ul><li>Monday</li><li>Tuesday</li><li>Wednesday</li><li>Thursday</li><li>Friday</li><li>Saturday</li><li>Sunday</li></ul>",
};
