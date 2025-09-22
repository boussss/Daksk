const { User, Transaction, Settings } = require('./models');

/**
 * @desc    Coletar os lucros diários de um plano específico.
 * @route   POST /api/bonus/collect
 * @access  Private
 */
const collectDailyEarnings = async (req, res) => {
    const { activePlanId } = req.body; // ID do objeto do plano ativo, não o ID do plano em si
    const userId = req.user._id;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }
        
        const settings = await Settings.findOne({ settingId: 'global_settings' });
        
        const activePlan = user.activePlans.id(activePlanId);
        if (!activePlan || !activePlan.isActive) {
            return res.status(404).json({ message: "Plano ativo não encontrado ou expirado." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normaliza para o início do dia

        // Verifica se o plano já expirou
        if (today > activePlan.endDate) {
            activePlan.isActive = false;
            await user.save();
            return res.status(400).json({ message: "Este plano já expirou." });
        }

        // Verifica se o usuário já coletou hoje
        if (activePlan.lastCollectionDate) {
            const lastCollectionDay = new Date(activePlan.lastCollectionDate);
            lastCollectionDay.setHours(0, 0, 0, 0);
            if (lastCollectionDay.getTime() === today.getTime()) {
                return res.status(400).json({ message: "Você já coletou os lucros de hoje para este plano." });
            }
        }
        
        // 1. Adiciona o lucro diário ao saldo do usuário
        const dailyProfit = activePlan.dailyProfit;
        user.walletBalance += dailyProfit;
        
        // 2. Atualiza os dados do plano ativo
        activePlan.lastCollectionDate = new Date();
        activePlan.totalEarned += dailyProfit;

        await user.save();

        // 3. Cria uma transação para o ganho
        await Transaction.create({
            user: userId,
            type: 'earning',
            amount: dailyProfit,
            status: 'completed',
            details: `Coleta diária do plano de investimento.`
        });
        
        // 4. Lógica de Comissão de Lucro Diário para quem o convidou
        if (user.invitedBy) {
            const inviter = await User.findOne({ userId: user.invitedBy });
            if (inviter) {
                const profitShare = (dailyProfit * settings.dailyProfitSharePercentage) / 100;
                inviter.walletBalance += profitShare; // Comissão vai para o saldo real
                await inviter.save();

                await Transaction.create({
                    user: inviter._id,
                    type: 'commission',
                    amount: profitShare,
                    status: 'completed',
                    details: `Comissão de ${settings.dailyProfitSharePercentage}% sobre os lucros de ${user.userId}`
                });
            }
        }

        res.status(200).json({ message: `Você coletou ${dailyProfit.toFixed(2)} MT com sucesso!` });

    } catch (error) {
        res.status(500).json({ message: "Erro no servidor ao coletar lucros.", error: error.message });
    }
};

/**
 * @desc    Obter o histórico de coleta e status dos planos ativos do usuário.
 * @route   GET /api/bonus/history
 * @access  Private
 */
const getCollectionHistory = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('activePlans.planId', 'name imageUrl');
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Verifica e atualiza o status de expiração dos planos
        for (const plan of user.activePlans) {
            if (plan.isActive && today > plan.endDate) {
                plan.isActive = false;
            }
        }
        await user.save();


        res.json(user.activePlans);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar histórico.", error: error.message });
    }
};


module.exports = {
    collectDailyEarnings,
    getCollectionHistory
};