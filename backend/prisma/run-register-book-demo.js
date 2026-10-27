require('dotenv').config();
process.env.DATABASE_URL ||= 'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo';
const { PrismaClient } = require('@prisma/client');
const seedRegisterBook = require('./seed-register-book');

const url = process.env.DATABASE_URL || '';
if (!/^(?:postgresql|postgres):\/\/[^/]*@?(?:127\.0\.0\.1|localhost):55432\/scmu_demo(?:\?|$)/.test(url)) {
  throw new Error('This scoped demo seed only runs against the local scmu_demo database on port 55432.');
}

const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  if (!user) throw new Error('Active SCMU super admin was not found.');
  await seedRegisterBook(prisma,user);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
