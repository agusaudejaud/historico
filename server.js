const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./src/routes/authRoutes");
const matchRoutes = require("./src/routes/matchRoutes");
const statsRoutes = require("./src/routes/statsRoutes");
const eloRoutes = require("./src/routes/eloRoutes");
const tournamentRoutes = require("./src/routes/tournamentRoutes");
const leaderboardRoutes = require("./src/routes/leaderboardRoutes");



const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
const allowedOrigins = [
  "http://localhost:5173", // Desarrollo
  "https://historico-m188.onrender.com", // Producción
  "https://agu295.github.io",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/", matchRoutes);
app.use("/api/", statsRoutes);
app.use("/api/ranking", eloRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/tournament", tournamentRoutes);

// Ruta de prueba
app.get("/", (req, res) => {
  res.json({ message: "API funcionando correctamente" });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
