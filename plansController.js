const { Plan, User, Transaction, Settings } = require('./models');

/**
 * @desc    Listar todos os planos de investimento ativos
 * @route   GET /api/plans
 * @access  Public
 */
const getAllPlans = async (req, res) => {
  try {
    // Busca apenas os planos que estão marcados como ativos
    const plans = await Plan.find({ isActive: true });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor ao buscar os planos.', error: error.message });
  }
};

/**
 * @desc    Ativar um plano de investimento para o usuário logado
 * @route   POST /api/plans/activate
 * @access  Private
 */
const activatePlan = async (req, res) => {
  const { planId, amount } = req.body;
  const userId = req.user._id;

  try {
    const plan = await Plan.findById(planId);
    const user = await User.findById(userId);
    const settings = await Settings.findOne({ settingId: 'global_settings' });

    if (!plan || !plan.isActive) {
      return res.status(404).json({ message: 'Plano não encontrado ou inativo.' });
    }

    const investmentAmount = Number(amount);
    if (investmentAmount < plan.minAmount || investmentAmount > plan.maxAmount) {
      return res.status(400).json({ message: `O valor do investimento deve estar entre ${plan.minAmount} MT e ${plan.maxAmount} MT.` });
    }

    if (user.walletBalance < investmentAmount) {
      return res.status(400).json({ message: 'Saldo insuficiente na carteira.' });
    }

    // 1. Debita o valor do saldo do usuário
    user.walletBalance -= investmentAmount;

    // 2. Calcula os detalhes do plano ativado
    const dailyProfit = plan.dailyIncomeType === 'percentage'
      ? (investmentAmount * plan.dailyIncomeValue) / 100
      : plan.dailyIncomeValue;
    
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + plan.duration);

    // 3. Adiciona o plano à lista de planos ativos do usuário
    user.activePlans.push({
      planId: plan._id,
      investedAmount: investmentAmount,
      dailyProfit: dailyProfit,
      startDate: startDate,
      endDate: endDate,
      lastCollectionDate: null, // Nenhum lucro coletado ainda
    });

    // 4. Marca que o usuário já depositou/ativou um plano (habilita saques)
    user.hasDeposited = true;
    
    // 5. Salva as alterações no usuário
    await user.save();

    // 6. Cria uma transação para o investimento
    await Transaction.create({
        user: userId,
        type: 'investment',
        amount: investmentAmount,
        status: 'completed',
        details: `Ativação do plano: ${plan.name}`
    });

    // 7. Lógica de Comissão de Referência
    if (user.invitedBy) {
        const inviter = await User.findOne({ userId: user.invitedBy });
        if (inviter) {
            const commission = (investmentAmount * settings.referralCommissionPercentage) / 100;
            inviter.walletBalance += commission; // Comissão vai para o saldo real (sacável)
            await inviter.save();

            // Cria uma transação para a comissão
            await Transaction.create({
                user: inviter._id,
                type: 'commission',
                amount: commission,
                status: 'completed',
                details: `Comissão de 15% pelo investimento de ${user.userId}`
            });
        }
    }
    
    res.status(200).json({ message: `Plano '${plan.name}' ativado com sucesso!` });

  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor ao ativar o plano.', error: error.message });
  }
};

module.exports = {
  getAllPlans,
  activatePlan,
};