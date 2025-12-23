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

// Generate realistic productivity ratings for the last 3.5 months (weekdays only)
const generateDemoProductivityRatings = () => {
  const ratings: Record<string, number> = {};
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 105); // ~3.5 months

  let currentDate = new Date(startDate);
  let dayCount = 0;

  while (currentDate <= today) {
    const dayOfWeek = currentDate.getDay();

    // Skip weekends (Saturday=6, Sunday=0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // 90% of days have ratings
      if (Math.random() < 0.90) {
        const key = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`;

        // Distribute ratings - use a pattern to ensure all 4 types appear
        // 4-point scale: 0=<25%, 1=25-50%, 2=50-75%, 3=>75%
        const position = dayCount % 20; // Cycle every 20 days
        let rating: number;

        if (position < 3) rating = 0;      // 15% - <25% (red/low)
        else if (position < 8) rating = 1; // 25% - 25-50% (light green)
        else if (position < 15) rating = 2; // 35% - 50-75% (medium green)
        else rating = 3;                    // 25% - >75% (dark green)

        ratings[key] = rating;
      }
      dayCount++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return ratings;
};

export const demoProductivityRatings = generateDemoProductivityRatings();

// Generate demo day-offs (vacation week + scattered days)
const generateDemoDayOffs = () => {
  const dayOffs: Record<string, boolean> = {};
  const today = new Date();

  // Add a vacation week about 3 weeks ago
  const vacationStart = new Date(today);
  vacationStart.setDate(today.getDate() - 21);

  // 7 consecutive days for vacation (including weekend)
  for (let i = 0; i < 7; i++) {
    const vacationDay = new Date(vacationStart);
    vacationDay.setDate(vacationStart.getDate() + i);

    // Include all days in vacation (even weekends for consistency)
    const key = `${vacationDay.getFullYear()}-${vacationDay.getMonth() + 1}-${vacationDay.getDate()}`;
    dayOffs[key] = true;
  }

  // Add 2-3 scattered sick/personal days in the last 2 months
  const scatteredDayOffDates = [
    -45, // ~6 weeks ago
    -28, // ~4 weeks ago
    -10, // ~10 days ago
  ];

  scatteredDayOffDates.forEach(daysAgo => {
    const dayOff = new Date(today);
    dayOff.setDate(today.getDate() + daysAgo);
    const dayOfWeek = dayOff.getDay();

    // Only add if it's a weekday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const key = `${dayOff.getFullYear()}-${dayOff.getMonth() + 1}-${dayOff.getDate()}`;
      dayOffs[key] = true;
    }
  });

  return dayOffs;
};

export const demoDayOffs = generateDemoDayOffs();

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
    title: "Grow Professional Network – 2025",
    timeframe: "2025",
    description: "Expand connections and share knowledge",
    archived: false,
    keyResults: [
      { id: "kr4", title: "Attend 3 industry conferences", status: "started" as const },
      { id: "kr5", title: "Publish 12 technical blog posts", status: "started" as const },
      { id: "kr6", title: "Connect with 50 new professionals on LinkedIn", status: "completed" as const },
    ],
  },
  {
    id: "3",
    title: "Health & Fitness – 2025 Plan",
    timeframe: "2025",
    description: "Improve overall health and wellbeing",
    archived: false,
    keyResults: [
      { id: "kr7", title: "Exercise 4x per week (tracked Feb)", status: "completed" as const },
      { id: "kr8", title: "Sleep 8 hours daily in March", status: "started" as const },
    ],
  },
];

export const demoWeeklyNoteTemplate = {
  content:
    "<p><strong>Welcome to the Demo!</strong></p><p>This productivity tracker helps you:</p><ul><li>Rate your productivity daily or weekly on the calendar</li><li>Set weekly goals and track progress</li><li>Define Do's and Don'ts to stay focused</li><li>Plan your schedule with time blocks</li><li>Set and track OKRs (Objectives and Key Results)</li><li>Share your progress with others</li></ul><p><em>Sign in to start tracking your own productivity journey!</em></p>",
  dos: "Focus on deep work\nTake regular breaks\nReview goals daily\nCelebrate small wins",
  donts:
    "Don't multitask during focus time\nDon't skip breaks\nDon't overcommit\nDon't compare to others",
};

export const demoProfile = {
  personName: "Demo User",
  dateOfBirth: "1990-01-01",
  weekStartDay: 1, // Monday
  recentYears: "2",
  showLegend: true,
  dayOffAllowance: 15,
  productivityScaleMode: "4", // 4-point scale
  autoMarkWeekendsOff: true, // Auto-mark weekends as day-off
  workDays: "1,2,3,4,5", // Monday-Friday (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
  weeklyGoalsTemplate:
    "<p><strong>What I want to accomplish this week:</strong></p><ul><li>Monday</li><li>Tuesday</li><li>Wednesday</li><li>Thursday</li><li>Friday</li><li>Saturday</li><li>Sunday</li></ul>",
};
