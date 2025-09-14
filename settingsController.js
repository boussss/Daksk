// settingsController.js
const asyncHandler = require('express-async-handler');
const { Settings } = require('./models');

/**
 * @desc    Obter as configurações públicas do site (como métodos de depósito, limites e taxas)
 * @route   GET /api/settings/public
 * @access  Public (ou Private para usuários logados, se preferir)
 */
const getPublicSettings = asyncHandler(async (req, res) => {
    // ATUALIZADO: Remover o .select() para retornar todas as configurações públicas
    const settings = await Settings.findOne({ configKey: "main_settings" });

    if (!settings) {
        // Se não houver configurações, retorna um objeto vazio com defaults ou um erro
        // Retornar defaults razoáveis evita que o frontend quebre
        return res.json({ 
            depositMethods: [],
            depositMin: 0,
            depositMax: 0,
            withdrawalMin: 0,
            withdrawalMax: 0,
            withdrawalFee: 0,
            welcomeBonus: 0,
            referralCommissionRate: 0,
            dailyCommissionRate: 0,
        });
    }
    
    // Filtra para retornar apenas os métodos ativos (para o frontend do usuário)
    const activeMethods = settings.depositMethods.filter(m => m.isActive);

    // Retorna o objeto settings completo, mas com os depositMethods filtrados
    res.json({ 
        ...settings.toObject(), // Converte para objeto JS puro para poder modificar
        depositMethods: activeMethods 
    });
});

module.exports = {
    getPublicSettings,
};