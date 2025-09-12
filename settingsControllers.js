// settingsController.js
const asyncHandler = require('express-async-handler');
const { Settings } = require('./models');

/**
 * @desc    Obter as configurações públicas do site (como métodos de depósito)
 * @route   GET /api/settings/public
 * @access  Public (ou Private para usuários logados, se preferir)
 */
const getPublicSettings = asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ configKey: "main_settings" })
                                     .select('depositMethods'); // Seleciona apenas os campos necessários

    if (!settings) {
        // Se não houver configurações, retorna um array vazio para não quebrar o frontend
        return res.json({ depositMethods: [] });
    }
    
    // Filtra para retornar apenas os métodos ativos
    const activeMethods = settings.depositMethods.filter(m => m.isActive);

    res.json({ depositMethods: activeMethods });
});

module.exports = {
    getPublicSettings,
};