const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");

class UserService {
  static async create({ username, email, password }) {
    const hashedPassword = await bcrypt.hash(password, 12);
    return prisma.users.create({
      data: { username, email, password: hashedPassword },
    });
  }

  static async findByEmail(email) {
    return prisma.users.findUnique({ where: { email } });
  }

  static async findByUsername(username) {
    return prisma.users.findUnique({ where: { username } });
  }

  static async findById(id) {
    return prisma.users.findUnique({ where: { id } });
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async getAllUsernames() {
    return prisma.users.findMany({
      select: { id: true, username: true },
      orderBy: { id: "asc" },
    });
  }

  static async updatePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    return prisma.users.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  static async updateProfile(userId, newUsername, newEmail) {
    return prisma.users.update({
      where: { id: userId },
      data: { username: newUsername, email: newEmail },
    });
  }
}

module.exports = UserService;
