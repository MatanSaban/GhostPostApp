const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const conv = await p.chatConversation.findFirst({
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      site: { select: { name: true, url: true } },
    },
  });

  if (!conv) {
    console.log('No conversations found');
    return;
  }

  console.log('=== Conversation ===');
  console.log('ID:', conv.id);
  console.log('Site:', conv.site?.name, '-', conv.site?.url);
  console.log('Updated:', conv.updatedAt);
  console.log('Messages:', conv.messages.length);
  console.log('');

  conv.messages.forEach((m, i) => {
    console.log(`--- Message ${i + 1} (${m.role}) [${m.createdAt.toISOString()}] ---`);
    // Show up to 2000 chars per message
    console.log(m.content.substring(0, 2000));
    if (m.content.length > 2000) console.log('... (truncated)');
    console.log('');
  });
}

main()
  .catch((e) => console.error(e.message))
  .finally(() => p.$disconnect());
