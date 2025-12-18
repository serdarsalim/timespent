import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkData() {
  try {
    // Get one user with all related data
    const user = await prisma.user.findFirst({
      include: {
        goals: {
          include: {
            keyResults: true
          }
        },
        productivityRatings: true,
        weeklyNotes: true,
        profile: true,
        accounts: true,
        sessions: true,
      }
    });
    
    if (user) {
      console.log('Sample user data size estimate:');
      console.log('  Goals:', user.goals.length);
      console.log('  Key Results:', user.goals.reduce((sum, g) => sum + g.keyResults.length, 0));
      console.log('  Productivity Ratings:', user.productivityRatings.length);
      console.log('  Weekly Notes:', user.weeklyNotes.length);
      console.log('  Accounts:', user.accounts.length);
      console.log('  Sessions:', user.sessions.length);
      
      // Rough JSON size estimate
      const jsonSize = JSON.stringify(user).length;
      console.log('\n  Estimated JSON size:', (jsonSize / 1024).toFixed(2), 'KB');
    }
    
    // Check all tables
    console.log('\nAll table counts:');
    const [users, accounts, sessions, verificationTokens, profiles, goals, keyResults, productivity, notes] = await Promise.all([
      prisma.user.count(),
      prisma.account.count(),
      prisma.session.count(),
      prisma.verificationToken.count(),
      prisma.userProfile.count(),
      prisma.goal.count(),
      prisma.keyResult.count(),
      prisma.productivityRating.count(),
      prisma.weeklyNote.count(),
    ]);
    
    console.log('  Users:', users);
    console.log('  Accounts:', accounts);
    console.log('  Sessions:', sessions);
    console.log('  Verification Tokens:', verificationTokens);
    console.log('  Profiles:', profiles);
    console.log('  Goals:', goals);
    console.log('  Key Results:', keyResults);
    console.log('  Productivity Ratings:', productivity);
    console.log('  Weekly Notes:', notes);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
