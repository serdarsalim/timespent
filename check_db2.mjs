import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSizes() {
  const start = Date.now();
  
  try {
    const users = await prisma.user.count();
    console.log('Users:', users);
    
    const goals = await prisma.goal.count();
    console.log('Goals:', goals);
    
    const productivity = await prisma.productivityRating.count();
    console.log('Productivity Ratings:', productivity);
    
    const notes = await prisma.weeklyNote.count();
    console.log('Weekly Notes:', notes);
    
    const elapsed = Date.now() - start;
    console.log('\nTotal query time:', elapsed + 'ms');
  } catch (err) {
    console.error(err.message);
  }
  
  await prisma.$disconnect();
}

checkSizes();
