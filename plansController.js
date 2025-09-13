// plansController.js
const asyncHandler = require('express-async-handler');
const { User, Plan, PlanInstance, Transaction, Settings } = require('./models');

//=====================================================
//  FUNÇÕES DO LADO DO USUÁRIO
//=====================================================

/**
 * @desc    Obter todos os planos de investimento e o plano ativo do usuário
 * @route   GET /api/plans
 * @access  Private (usuário logado)
 */
const getAllAvailablePlans = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate({
        path: 'activePlanInstance',
        populate: { path: 'plan', model: 'Plan' }
    });
    
    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado.');
    }

    const allPlans = await Plan.find({});
    
    res.json({
        plans: allPlans,
        activePlanInstance: user.activePlanInstance,
    });
});

/**
 * @desc    Ativar um plano de investimento para um novo usuário (sem plano ativo)
 * @route   POST /api/plans/:planId/activate
 * @access  Private
 */
const activatePlan = asyncHandler(async (req, res) => {
    const { planId } = req.params;
    const { investedAmount } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado. Por favor, faça login novamente.');
    }

    const settings = await Settings.findOne({ configKey: "main_settings" });
    if (!settings) {
        res.status(500);
        throw new Error("Configurações do sistema não encontradas. Por favor, tente novamente mais tarde.");
    }

    if (user.activePlanInstance) {
        res.status(400);
        throw new Error('Você já possui um plano ativo. Para mudar, faça um upgrade para um plano superior.');
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
        res.status(404);
        throw new Error('Plano de investimento não encontrado.');
    }

    const amount = Number(investedAmount);
    if (isNaN(amount) || amount < plan.minAmount || amount > plan.maxAmount) {
        res.status(400);
        throw new Error(`O valor do investimento deve estar entre ${plan.minAmount} MT e ${plan.maxAmount} MT.`);
    }

    let realAmountToPay = amount;
    let bonusAmountUsed = 0;

    if (user.bonusBalance > 0) {
        if (user.bonusBalance >= amount) {
            bonusAmountUsed = amount;
            realAmountToPay = 0;
        } else {
            bonusAmountUsed = user.bonusBalance;
            realAmountToPay = amount - user.bonusBalance;
        }
    }

    if (user.walletBalance < realAmountToPay) {
        res.status(400);
        throw new Error('Saldo insuficiente na sua carteira para ativar este plano, mesmo utilizando seu bônus.');
    }

    user.walletBalance -= realAmountToPay;
    user.bonusBalance -= bonusAmountUsed;

    // NOVO: Marca que o usuário já ativou um plano alguma vez
    user.hasActivatedPlan = true; 

    const dailyProfit = plan.dailyYieldType === 'fixed' ? plan.dailyYieldValue : (amount * plan.dailyYieldValue) / 100;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.durationDays);

    const newPlanInstance = await PlanInstance.create({
        user: user._id,
        plan: plan._id,
        investedAmount: amount,
        dailyProfit: dailyProfit,
        startDate: startDate,
        endDate: endDate,
    });
    
    user.activePlanInstance = newPlanInstance._id;
    await user.save();

    await Transaction.create({
        user: user._id,
        type: 'investment',
        amount: -amount,
        description: `Investimento no plano "${plan.name}"`,
    });

    if (user.invitedBy) {
        const referrer = await User.findById(user.invitedBy);
        if (referrer) {
            const commissionAmount = amount * (settings.referralCommissionRate / 100);
            referrer.walletBalance += commissionAmount;
            await referrer.save();

            await Transaction.create({
                user: referrer._id,
                type: 'commission',
                amount: commissionAmount,
                description: `Comissão por ativação de plano do usuário ${user.userId}`,
            });
        }
    }

    res.status(201).json({ message: 'Plano ativado com sucesso!', planInstance: newPlanInstance });
});

/**
 * @desc    Fazer upgrade de um plano ativo para um superior
 * @route   POST /api/plans/upgrade/:newPlanId
 * @access  Private
 */
const upgradePlan = asyncHandler(async (req, res) => {
    const { newPlanId } = req.params;
    const user = await User.findById(req.user._id).populate({
        path: 'activePlanInstance',
        populate: { path: 'plan', model: 'Plan' }
    });

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado. Por favor, faça login novamente.');
    }

    if (!user.activePlanInstance) {
        res.status(400);
        throw new Error('Você não tem um plano ativo para fazer upgrade. Por favor, ative um plano primeiro.');
    }

    const newPlan = await Plan.findById(newPlanId);
    if (!newPlan) {
        res.status(404);
        throw new Error('O novo plano selecionado não foi encontrado.');
    }
    
    const oldPlanInstance = user.activePlanInstance;
    const oldPlan = oldPlanInstance.plan;

    if (newPlan.minAmount <= oldPlan.minAmount) {
        res.status(400);
        throw new Error('Você só pode fazer upgrade para um plano de valor superior ao seu plano atual.');
    }

    const priceDifference = newPlan.minAmount - oldPlan.minAmount;
    if (user.walletBalance < priceDifference) {
        res.status(400);
        throw new Error(`Saldo insuficiente na carteira. Você precisa de ${priceDifference.toFixed(2)} MT para realizar este upgrade.`);
    }

    user.walletBalance -= priceDifference;
    
    // Invalida a instância do plano antigo
    oldPlanInstance.status = 'expired';
    await oldPlanInstance.save();
    
    const dailyProfit = newPlan.dailyYieldType === 'fixed' ? newPlan.dailyYieldValue : (newPlan.minAmount * newPlan.dailyYieldValue) / 100;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + newPlan.durationDays);

    const newPlanInstance = await PlanInstance.create({
        user: user._id,
        plan: newPlan._id,
        investedAmount: newPlan.minAmount,
        dailyProfit: dailyProfit,
        startDate: startDate,
        endDate: endDate,
    });

    user.activePlanInstance = newPlanInstance._id;
    await user.save();

    await Transaction.create({
        user: user._id,
        type: 'investment',
        amount: -priceDifference,
        description: `Upgrade do plano "${oldPlan.name}" para "${newPlan.name}"`,
    });

    res.json({ message: 'Upgrade de plano realizado com sucesso!' });
});

/**
 * @desc    Coletar o lucro diário de um plano ativo
 * @route   POST /api/plans/collect
 * @access  Private
 */
const collectDailyProfit = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('activePlanInstance');
    
    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado. Por favor, faça login novamente.');
    }

    const settings = await Settings.findOne({ configKey: "main_settings" });
    if (!settings) {
        res.status(500);
        throw new Error("Configurações do sistema não encontradas. Por favor, tente novamente mais tarde.");
    }

    if (!user.activePlanInstance) {
        res.status(400);
        throw new Error('Você não tem um plano ativo para coletar lucros. Por favor, ative um plano primeiro.');
    }
    
    const planInstance = user.activePlanInstance;

    if (new Date() > new Date(planInstance.endDate)) {
        planInstance.status = 'expired';
        await planInstance.save();
        user.activePlanInstance = null;
        await user.save();
        res.status(400); // Já que o status foi atualizado, é um erro de "já expirou"
        throw new Error('Este plano já expirou e não pode mais gerar lucros. Por favor, renove-o ou ative um novo.');
    }

    let canCollect = false;
    const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

    if (!planInstance.lastCollectedDate) {
        canCollect = true;
    } else {
        const timeSinceLastCollection = Date.now() - new Date(planInstance.lastCollectedDate).getTime();
        if (timeSinceLastCollection >= TWENTY_FOUR_HOURS_IN_MS) {
            canCollect = true;
        }
    }

    if (!canCollect) {
        const timeSinceLastCollection = Date.now() - new Date(planInstance.lastCollectedDate).getTime();
        const timeRemaining = TWENTY_FOUR_HOURS_IN_MS - timeSinceLastCollection;
        const remainingHours = (timeRemaining / (1000 * 60 * 60)).toFixed(1);
        res.status(400);
        throw new Error(`Você já coletou hoje. A próxima coleta estará disponível em aproximadamente ${remainingHours} horas.`);
    }
    
    const profit = planInstance.dailyProfit;
    
    user.walletBalance += profit;
    planInstance.lastCollectedDate = new Date();
    planInstance.totalCollected += profit;
    
    await user.save();
    await planInstance.save();

    await Transaction.create({ user: user._id, type: 'collection', amount: profit, description: 'Coleta de rendimento diário' });

    if (user.invitedBy) {
        const referrer = await User.findById(user.invitedBy);
        if (referrer) { 
            const dailyCommission = profit * (settings.dailyCommissionRate / 100);
            referrer.walletBalance += dailyCommission;
            await referrer.save();
            await Transaction.create({ user: referrer._id, type: 'commission', amount: dailyCommission, description: `Comissão diária do lucro do usuário ${user.userId}` });
        }
    }
    
    res.json({ message: `Você coletou ${formatCurrency(profit)} MT com sucesso.`, collectedAmount: profit });
});

/**
 * @desc    Renovar um plano expirado
 * @route   POST /api/plans/:instanceId/renew
 * @access  Private
 */
const renewPlan = asyncHandler(async (req, res) => {
    const { instanceId } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado. Por favor, faça login novamente.');
    }

    const oldInstance = await PlanInstance.findById(instanceId).populate('plan');
    if (!oldInstance || oldInstance.user.toString() !== user._id.toString()) {
        res.status(404);
        throw new Error('Histórico de plano não encontrado ou não pertence a você.');
    }

    if (oldInstance.status !== 'expired') {
        res.status(400);
        throw new Error('Apenas planos expirados podem ser renovados.');
    }

    if (user.activePlanInstance) {
        res.status(400);
        throw new Error('Você já possui um plano ativo. Não é possível renovar outro plano no momento.');
    }

    const planToRenew = oldInstance.plan;
    if (!planToRenew) {
        res.status(404);
        throw new Error('O plano original para renovação não foi encontrado.');
    }

    const renewalCost = planToRenew.minAmount;

    if (user.walletBalance < renewalCost) {
        res.status(400);
        throw new Error(`Saldo insuficiente na carteira. Você precisa de ${renewalCost.toFixed(2)} MT para renovar este plano.`);
    }

    user.walletBalance -= renewalCost;
    // NOVO: Marca que o usuário já ativou um plano alguma vez (se ainda não for true)
    user.hasActivatedPlan = true; 

    const dailyProfit = planToRenew.dailyYieldType === 'fixed' 
        ? planToRenew.dailyYieldValue 
        : (renewalCost * planToRenew.dailyYieldValue) / 100;
        
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + planToRenew.durationDays);

    const newInstance = await PlanInstance.create({
        user: user._id,
        plan: planToRenew._id,
        investedAmount: renewalCost,
        dailyProfit: dailyProfit,
        startDate: startDate,
        endDate: endDate,
    });

    user.activePlanInstance = newInstance._id;
    await user.save();

    await Transaction.create({
        user: user._id, type: 'investment', amount: -renewalCost,
        description: `Renovação do plano "${planToRenew.name}"`,
    });

    res.status(200).json({ message: 'Plano renovado com sucesso!' });
});


//=====================================================
//  FUNÇÕES DO LADO DO ADMIN
//=====================================================

const getAllPlansForAdmin = asyncHandler(async (req, res) => {
    const plans = await Plan.find({});
    res.json(plans);
});

const createPlan = asyncHandler(async (req, res) => {
    const { name, minAmount, maxAmount, dailyYieldType, dailyYieldValue, durationDays, hashRate } = req.body;
    if (!name || !minAmount || !maxAmount || !dailyYieldType || !dailyYieldValue || !durationDays) {
        res.status(400);
        throw new Error('Todos os campos obrigatórios para o plano (nome, valores, tipo e valor de rendimento, duração) devem ser preenchidos.');
    }
    // Convertendo valores para números e validando
    const parsedMinAmount = Number(minAmount);
    const parsedMaxAmount = Number(maxAmount);
    const parsedDailyYieldValue = Number(dailyYieldValue);
    const parsedDurationDays = Number(durationDays);

    if (isNaN(parsedMinAmount) || parsedMinAmount <= 0 ||
        isNaN(parsedMaxAmount) || parsedMaxAmount <= 0 ||
        isNaN(parsedDailyYieldValue) || parsedDailyYieldValue <= 0 ||
        isNaN(parsedDurationDays) || parsedDurationDays <= 0) {
        res.status(400);
        throw new Error('Os valores numéricos do plano devem ser válidos e maiores que zero.');
    }
    if (parsedMinAmount > parsedMaxAmount) {
        res.status(400);
        throw new Error('O valor mínimo do plano não pode ser maior que o valor máximo.');
    }
    if (dailyYieldType === 'percentage' && parsedDailyYieldValue > 100) {
        res.status(400);
        throw new Error('A porcentagem de rendimento diário não pode ser maior que 100%.');
    }

    const plan = await Plan.create({ 
        name, 
        minAmount: parsedMinAmount, 
        maxAmount: parsedMaxAmount, 
        dailyYieldType, 
        dailyYieldValue: parsedDailyYieldValue, 
        durationDays: parsedDurationDays, 
        hashRate, 
        imageUrl: req.file ? req.file.path : '' 
    });
    res.status(201).json(plan);
});

const updatePlan = asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.id);
    if (!plan) { 
        res.status(404);
        throw new Error('Plano não encontrado para atualização.'); 
    }
    
    // Validar e atualizar apenas os campos permitidos
    const { name, minAmount, maxAmount, dailyYieldType, dailyYieldValue, durationDays, hashRate } = req.body;

    if (name) plan.name = name;
    if (minAmount) {
        const parsedMinAmount = Number(minAmount);
        if (isNaN(parsedMinAmount) || parsedMinAmount <= 0) {
            res.status(400);
            throw new Error('O valor mínimo do plano deve ser válido e maior que zero.');
        }
        plan.minAmount = parsedMinAmount;
    }
    if (maxAmount) {
        const parsedMaxAmount = Number(maxAmount);
        if (isNaN(parsedMaxAmount) || parsedMaxAmount <= 0) {
            res.status(400);
            throw new Error('O valor máximo do plano deve ser válido e maior que zero.');
        }
        plan.maxAmount = parsedMaxAmount;
    }
    if (dailyYieldType) plan.dailyYieldType = dailyYieldType;
    if (dailyYieldValue) {
        const parsedDailyYieldValue = Number(dailyYieldValue);
        if (isNaN(parsedDailyYieldValue) || parsedDailyYieldValue <= 0) {
            res.status(400);
            throw new Error('O valor de rendimento diário deve ser válido e maior que zero.');
        }
        if (plan.dailyYieldType === 'percentage' && parsedDailyYieldValue > 100) {
            res.status(400);
            throw new Error('A porcentagem de rendimento diário não pode ser maior que 100%.');
        }
        plan.dailyYieldValue = parsedDailyYieldValue;
    }
    if (durationDays) {
        const parsedDurationDays = Number(durationDays);
        if (isNaN(parsedDurationDays) || parsedDurationDays <= 0) {
            res.status(400);
            throw new Error('A duração do plano deve ser válida e maior que zero.');
        }
        plan.durationDays = parsedDurationDays;
    }
    if (hashRate) plan.hashRate = hashRate;


    if (req.file) { plan.imageUrl = req.file.path; }
    
    // Verificações adicionais de consistência
    if (plan.minAmount > plan.maxAmount) {
        res.status(400);
        throw new Error('O valor mínimo do plano não pode ser maior que o valor máximo.');
    }

    const updatedPlan = await plan.save();
    res.json({message: 'Plano atualizado com sucesso!', plan: updatedPlan});
});

const deletePlan = asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.id);
    if (!plan) { 
        res.status(404);
        throw new Error('Plano não encontrado para exclusão.'); 
    }
    const activeInstances = await PlanInstance.countDocuments({ plan: plan._id, status: 'active' });
    if (activeInstances > 0) { 
        res.status(400);
        throw new Error(`Não é possível deletar este plano. ${activeInstances} usuário(s) ainda o têm ativo.`); 
    }
    await plan.deleteOne();
    res.json({ message: 'Plano deletado com sucesso.' });
});


module.exports = {
    getAllAvailablePlans,
    activatePlan,
    upgradePlan,
    collectDailyProfit,
    renewPlan,
    getAllPlansForAdmin,
    createPlan,
    updatePlan,
    deletePlan,
};

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' }).format(value);
}