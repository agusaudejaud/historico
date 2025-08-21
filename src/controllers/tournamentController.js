const TournamentService = require("../services/tournamentService");

exports.getUsers = async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const users = await TournamentService.getUsers(searchTerm);
        res.json(users);
    } catch (error) {
        console.error("Error en getUsers:", error);
        res.status(500).json({ message: "Error en getUsers" });
    }
};