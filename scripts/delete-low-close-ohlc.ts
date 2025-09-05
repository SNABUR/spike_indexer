import { PrismaClient } from '../prisma/generated/ohlc_db';

const prisma = new PrismaClient();

async function deleteBadOhlcData() {
  const idsToDelete = [42038, 42050];
  console.log(`Attempting to delete records with IDs: ${idsToDelete.join(', ')}`);

  try {
    const deleteResult = await prisma.ohlcData.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
      },
    });

    console.log(`Successfully deleted ${deleteResult.count} records.`);

  } catch (error) {
    console.error('An error occurred while deleting the records:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteBadOhlcData();
