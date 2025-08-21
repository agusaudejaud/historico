const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class TournamentService {
  static async getUsers(searchTerm = "") {
    try {
      const users = await prisma.users.findMany({
        select: {
          id: true,
          username: true,
        },
        where: {
          OR: [
            {
              username: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          ],
        },
        take: 100, // Límite para evitar demasiados resultados
      });

      return users;
    } catch (error) {
      console.error("Error en getUsers:", error);
      throw error;
    }
  }
}

module.exports = TournamentService;
