import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSizes() {
  const start = Date.now();
  
  const [users, goals, schedules, productivity, notes] = await Promise.all([
    prisma.user.count(),
    prisma.goal.count(),
    prisma.scheduleEntry.count(),
    prisma.productivityRating.count(),
    prisma.weeklyNote.count(),
  ]);
  
  const elapsed = Date.now() - start;
  
  console.log('Database counts:');
  console.log('  Users:', users);
  console.log('  Goals:', goals);
  console.log('  Schedule Entries:', schedules);
  console.log('  Productivity Ratings:', productivity);
  console.log('  Weekly Notes:', notes);
  console.log('\nQuery time:', elapsed + 'ms');
  
  await prisma.$disconnect();
}

checkSizes().catch(console.error);
