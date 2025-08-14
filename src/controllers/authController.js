const User = require("../services/userService");
const { generateToken } = require("../config/jwt");

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Verificar si el usuario ya existe (por email)
    const existingUserByEmail = await User.findByEmail(email);
    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un usuario con este email",
      });
    }

    // Verificar si el username ya existe (necesitarás agregar este método al modelo)
    const existingUserByUsername = await User.findByUsername(username);
    if (existingUserByUsername) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un usuario con este nombre de usuario",
      });
    }

    // Crear usuario
    const result = await User.create({ username, email, password });

    res.status(201).json({
      success: true,
      message: "Usuario creado exitosamente",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("Error en registro:", error);

    // Manejar errores específicos de la base de datos
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "El usuario ya existe",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
   
    // Buscar usuario
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Credenciales incorrectas",
      });
    }

    // Verificar contraseña
    const isValidPassword = await User.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Credenciales incorrectas",
      });
    }

    // Generar token
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });

    // Configurar cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, //30 dias
    });

    res.json({
      success: true,
      message: "Login exitoso",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

const logout = (req, res) => {
  res.clearCookie("token");
  res.json({
    success: true,
    message: "Logout exitoso",
  });
};

const profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener perfil",
    });
  }
};

const getUsernames = async (req, res) => {
  try {
    const usernames = await User.getAllUsernames();

    res.json({
      success: true,
      usernames,
    });
  } catch (error) {
    console.error("Error al obtener usernames:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la lista de usernames",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    // Validar contraseña actual
    const isMatch = await User.comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "La contraseña actual no es correcta",
      });
    }

    // Actualizar contraseña
    await User.updatePassword(req.user.id, newPassword);

    res.json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};
const updateProfile = async (req, res) => {
  try {
    const { username, email } = req.body;

    // Verificar si el nuevo email ya está en uso
    const existingEmailUser = await User.findByEmail(email);
    if (existingEmailUser && existingEmailUser.id !== req.user.id) {
      return res.status(409).json({
        success: false,
        message: "El email ya está en uso por otro usuario",
      });
    }

    // Verificar si el nuevo username ya está en uso
    const existingUsernameUser = await User.findByUsername(username);
    if (existingUsernameUser && existingUsernameUser.id !== req.user.id) {
      return res.status(409).json({
        success: false,
        message: "El nombre de usuario ya está en uso por otro usuario",
      });
    }

    // Actualizar perfil
    await User.updateProfile(req.user.id, username, email);

    res.json({
      success: true,
      message: "Perfil actualizado correctamente",
    });
  } catch (error) {
    console.error("Error al actualizar perfil:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  profile,
  getUsernames,
  changePassword,
  updateProfile,
};
