const { Plan, User, Transaction, Settings } = require('./models');

/**
 * @desc    Listar todos os planos de investimento ativos
 * @route   GET /api/plans
 * @access  Public
 */
const getAllPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ minAmount: 1 }); // Ordena por valor
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor ao buscar os planos.', error: error.message });
  }
};

/**
 * @desc    Ativar um plano ou fazer upgrade (LÓGICA ATUALIZADA)
 * @route   POST /api/plans/activate
 * @access  Private
 */
const activatePlan = async (req, res) => {
  const { planId, amount } = req.body; // 'amount' aqui é o valor total do novo plano (ex: minAmount)
  const userId = req.user._id;

  try {
    const newPlan = await Plan.findById(planId);
    const user = await User.findById(userId);
    const settings = await Settings.findOne({ settingId: 'global_settings' });

    if (!newPlan || !newPlan.isActive) {
      return res.status(404).json({ message: 'Plano não encontrado ou inativo.' });
    }
    
    // O valor do investimento deve ser o valor exato do plano (minAmount)
    const investmentAmount = Number(amount); 
    if (investmentAmount !== newPlan.minAmount) {
        return res.status(400).json({ message: `O investimento para este plano deve ser exatamente ${newPlan.minAmount} MT.` });
    }

    // Encontra o plano ativo atual do usuário, se existir
    const currentActivePlan = user.activePlans.find(p => p.isActive === true);
    let costToUser = investmentAmount;
    
    // LÓGICA DE UPGRADE
    if (currentActivePlan) {
      // Verifica se o novo plano é realmente um upgrade
      if (investmentAmount <= currentActivePlan.investedAmount) {
        return res.status(400).json({ message: 'Só é permitido fazer upgrade para um plano de valor superior.' });
      }

      // Calcula a diferença a ser paga
      const difference = investmentAmount - currentActivePlan.investedAmount;
      costToUser = difference;

      // Desativa o plano antigo
      currentActivePlan.isActive = false;
    }
    
    // Verifica se o usuário tem saldo suficiente para a operação
    if (user.walletBalance < costToUser) {
      return res.status(400).json({ message: `Saldo insuficiente. Você precisa de ${costToUser.toFixed(2)} MT.` });
    }

    // 1. Debita o custo do saldo do usuário (diferença ou valor total)
    user.walletBalance -= costToUser;
    
    // 2. Calcula os detalhes do novo plano ativado
    const dailyProfit = newPlan.dailyIncomeType === 'percentage'
      ? (investmentAmount * newPlan.dailyIncomeValue) / 100
      : newPlan.dailyIncomeValue;
    
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + newPlan.duration);

    // 3. Adiciona o novo plano à lista de planos ativos do usuário
    user.activePlans.push({
      planId: newPlan._id,
      investedAmount: investmentAmount,
      dailyProfit: dailyProfit,
      startDate: startDate,
      endDate: endDate,
      lastCollectionDate: null,
      isActive: true // Garante que o novo plano esteja ativo
    });

    // 4. Marca que o usuário já ativou um plano (habilita saques)
    user.hasDeposited = true;
    
    // 5. Salva as alterações no usuário
    await user.save();

    // 6. Cria uma transação para o investimento
    await Transaction.create({
        user: userId,
        type: 'investment',
        amount: costToUser, // Registra na transação apenas o valor que saiu da carteira
        status: 'completed',
        details: `${currentActivePlan ? 'Upgrade para o plano' : 'Ativação do plano'}: ${newPlan.name}`
    });

    // 7. Lógica de Comissão de Referência (baseado no valor total do novo plano)
    if (user.invitedBy) {
        const inviter = await User.findOne({ userId: user.invitedBy });
        if (inviter) {
            const commission = (investmentAmount * settings.referralCommissionPercentage) / 100;
            inviter.walletBalance += commission;
            await inviter.save();

            await Transaction.create({
                user: inviter._id,
                type: 'commission',
                amount: commission,
                status: 'completed',
                details: `Comissão de ${settings.referralCommissionPercentage}% pelo investimento de ${user.userId} no plano ${newPlan.name}`
            });
        }
    }
    
    res.status(200).json({ message: `${currentActivePlan ? 'Upgrade realizado' : 'Plano ativado'} com sucesso!` });

  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor ao ativar o plano.', error: error.message });
  }
};

module.exports = {
  getAllPlans,
  activatePlan,
};