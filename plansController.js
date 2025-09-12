// plansController.js
const asyncHandler = require('express-async-handler');
const { User, Plan, PlanInstance, Transaction } = require('./models');

//=====================================================
//  FUNÇÕES DO LADO DO USUÁRIO
//=====================================================

/**
 * @desc    Obter todos os planos de investimento disponíveis
 * @route   GET /api/plans
 * @access  Private (usuário logado)
 */
const getAllAvailablePlans = asyncHandler(async (req, res) => {
    const plans = await Plan.find({});
    res.json(plans);
});

/**
 * @desc    Ativar um plano de investimento para o usuário
 * @route   POST /api/plans/:planId/activate
 * @access  Private
 */
const activatePlan = asyncHandler(async (req, res) => {
    const { planId } = req.params;
    const { investedAmount } = req.body;
    const user = await User.findById(req.user._id);

    if (user.activePlanInstance) {
        return res.status(400).json({ message: 'Você já possui um plano ativo.' });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
        return res.status(404).json({ message: 'Plano não encontrado.' });
    }

    const amount = Number(investedAmount);
    if (isNaN(amount) || amount < plan.minAmount || amount > plan.maxAmount) {
        return res.status(400).json({ message: `O valor do investimento deve estar entre ${plan.minAmount} MT e ${plan.maxAmount} MT.` });
    }

    if (user.walletBalance < amount) {
        return res.status(400).json({ message: 'Saldo insuficiente para ativar este plano.' });
    }

    // --- Lógica Principal da Ativação ---
    user.walletBalance -= amount;

    const dailyProfit = plan.dailyYieldType === 'fixed'
        ? plan.dailyYieldValue
        : (amount * plan.dailyYieldValue) / 100;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const newPlanInstance = await PlanInstance.create({
        user: user._id,
        plan: plan._id,
        investedAmount: amount,
        dailyProfit: dailyProfit,
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

    // --- Lógica de Bônus de Convite (15% do valor do plano) ---
    if (user.invitedBy) {
        const referrer = await User.findById(user.invitedBy);
        if (referrer) {
            const commissionAmount = amount * 0.15; // TODO: Esta % deve ser configurável pelo admin
            referrer.walletBalance += commissionAmount;
            await referrer.save();

            await Transaction.create({
                user: referrer._id,
                type: 'commission',
                amount: commissionAmount,
                description: `Comissão (15%) pela ativação do plano do usuário ${user.userId}`,
            });
        }
    }

    res.status(201).json({
        message: 'Plano ativado com sucesso!',
        planInstance: newPlanInstance,
    });
});

/**
 * @desc    Coletar o lucro diário de um plano ativo
 * @route   POST /api/plans/collect
 * @access  Private
 */
const collectDailyProfit = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('activePlanInstance');
    
    if (!user.activePlanInstance) {
        return res.status(400).json({ message: 'Você não tem um plano ativo para coletar lucros.' });
    }
    
    const planInstance = user.activePlanInstance;

    if (new Date() > new Date(planInstance.endDate)) {
        planInstance.status = 'expired';
        await planInstance.save();
        user.activePlanInstance = null;
        await user.save();
        return res.status(400).json({ message: 'Este plano já expirou.' });
    }

    if (planInstance.lastCollectedDate) {
        const nextCollectionTime = new Date(planInstance.lastCollectedDate).getTime() + (24 * 60 * 60 * 1000);
        if (Date.now() < nextCollectionTime) {
            const remainingHours = ((nextCollectionTime - Date.now()) / (1000 * 60 * 60)).toFixed(1);
            return res.status(400).json({ message: `Você já coletou hoje. Tente novamente em aproximadamente ${remainingHours} horas.` });
        }
    }

    const profit = planInstance.dailyProfit;
    
    user.walletBalance += profit;
    planInstance.lastCollectedDate = new Date();
    planInstance.totalCollected += profit;
    
    await planInstance.save();
    await user.save();

    await Transaction.create({ user: user._id, type: 'collection', amount: profit, description: 'Coleta de rendimento diário' });

    // --- Lógica de Comissão Diária para o Convidante (5% do lucro) ---
    if (user.invitedBy) {
        const referrer = await User.findById(user.invitedBy);
        if (referrer && referrer.activePlanInstance) { // Só paga comissão se o convidante estiver ativo
            const dailyCommission = profit * 0.05; // TODO: Esta % deve ser configurável pelo admin
            referrer.walletBalance += dailyCommission;
            await referrer.save();

            await Transaction.create({
                user: referrer._id,
                type: 'commission',
                amount: dailyCommission,
                description: `Comissão diária (5%) do lucro do usuário ${user.userId}`,
            });
        }
    }
    
    res.json({ message: `Você coletou ${profit} MT com sucesso.` });
});


//=====================================================
//  FUNÇÕES DO LADO DO ADMIN
//=====================================================

/**
 * @desc    Admin: Criar um novo plano de investimento
 * @route   POST /api/admin/plans
 * @access  Admin
 */
const createPlan = asyncHandler(async (req, res) => {
    const { name, minAmount, maxAmount, dailyYieldType, dailyYieldValue, durationDays } = req.body;
    if (!name || !minAmount || !maxAmount || !dailyYieldType || !dailyYieldValue || !durationDays) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }
    
    const plan = await Plan.create({
        ...req.body,
        imageUrl: req.file ? req.file.path : ''
    });

    res.status(201).json(plan);
});

/**
 * @desc    Admin: Atualizar um plano de investimento existente
 * @route   PUT /api/admin/plans/:id
 * @access  Admin
 */
const updatePlan = asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
        return res.status(404).json({ message: 'Plano não encontrado.' });
    }

    // Atualiza os campos do plano com os dados do corpo da requisição
    Object.assign(plan, req.body);

    // Se uma nova imagem foi enviada, atualiza a URL da imagem
    if (req.file) {
        plan.imageUrl = req.file.path;
    }

    const updatedPlan = await plan.save();
    res.json(updatedPlan);
});

/**
 * @desc    Admin: Deletar um plano de investimento
 * @route   DELETE /api/admin/plans/:id
 * @access  Admin
 */
const deletePlan = asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
        return res.status(404).json({ message: 'Plano não encontrado.' });
    }

    // Medida de Segurança: Verifica se algum usuário está com este plano ativo
    const activeInstances = await PlanInstance.countDocuments({ plan: plan._id, status: 'active' });
    if (activeInstances > 0) {
        return res.status(400).json({ message: `Não é possível deletar este plano, pois ${activeInstances} usuário(s) o têm ativo.` });
    }

    await plan.deleteOne();
    res.json({ message: 'Plano deletado com sucesso.' });
});


module.exports = {
    // Funções de Usuário
    getAllAvailablePlans,
    activatePlan,
    collectDailyProfit,
    // Funções de Admin
    createPlan,
    updatePlan,
    deletePlan,
};