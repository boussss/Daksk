// adminController.js
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { Admin, User, Transaction, PlanInstance, Banner, Settings, LotteryCode } = require('./models');
const { generateToken, generateLotteryCode } = require('./utils');

// @desc    Autenticar (login) o administrador
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
        res.status(401);
        throw new Error('Credenciais de administrador inválidas. Por favor, verifique seu nome de usuário e senha.');
    }
    
    res.json({
        _id: admin._id,
        username: admin.username,
        token: generateToken(admin._id),
    });
});

// --- GERENCIAMENTO DE USUÁRIOS ---

// @desc    Obter todos os usuários
// @route   GET /api/admin/users
// @access  Admin
const getAllUsers = asyncHandler(async (req, res) => {
    // ATUALIZADO: Buscar todos os usuários e selecionar o telefone (9 dígitos)
    const users = await User.find({}).select('-pin');
    res.json(users);
});

// @desc    Pesquisar usuário por ID de 5 dígitos ou número de telefone
// @route   GET /api/admin/users/search
// @access  Admin
const searchUsers = asyncHandler(async (req, res) => {
    const { query } = req.query;
    if (!query) {
        res.status(400);
        throw new Error('Por favor, forneça um termo de pesquisa (ID de usuário ou número de telefone).');
    }

    let user;
    // Verifica se a query parece um ID de 5 dígitos
    if (/^\d{5}$/.test(query)) {
        user = await User.findOne({ userId: query }).select('-pin');
    } else if (/^\d{9}$/.test(query)) { // ATUALIZADO: Verifica 9 dígitos para número de telefone
        user = await User.findOne({ phone: query }).select('-pin');
    } else {
        res.status(400);
        throw new Error('Formato de pesquisa inválido. Use um ID de 5 dígitos ou um número de telefone de 9 dígitos.');
    }

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado com o termo de pesquisa fornecido.');
    }
    res.json(user);
});

// @desc    Obter detalhes completos de um usuário (perfil, plano, transações, referências)
// @route   GET /api/admin/users/:id/details
// @access  Admin
const getUserDetailsForAdmin = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('-pin')
        .populate({
            path: 'activePlanInstance',
            populate: { path: 'plan', model: 'Plan' }
        });

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado.');
    }

    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 });

    const referrals = await User.find({ invitedBy: user._id })
        .select('userId username createdAt activePlanInstance')
        .populate({
            path: 'activePlanInstance',
            populate: { path: 'plan', model: 'Plan', select: 'name' }
        });

    const totalReferralEarningsFromUser = await Transaction.aggregate([
        { $match: { 
            type: 'commission', 
            status: 'approved',
            description: { $regex: new RegExp(`do usuário ${user.userId}`) }
        }},
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
    ]);
    const totalEarningsForReferrer = totalReferralEarningsFromUser.length > 0 ? totalReferralEarningsFromUser[0].totalAmount : 0;


    const totalEarningsFromOwnReferrals = await Transaction.aggregate([
        { $match: { 
            user: user._id,
            type: 'commission', 
            status: 'approved',
        }},
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
    ]);
    const totalOwnReferralEarnings = totalEarningsFromOwnReferrals.length > 0 ? totalEarningsFromOwnReferrals[0].totalAmount : 0;


    const formattedReferrals = await Promise.all(referrals.map(async (ref) => {
        const earningsFromThisReferral = await Transaction.aggregate([
            { $match: { 
                user: user._id,
                type: 'commission', 
                status: 'approved',
                description: { $regex: new RegExp(`do usuário ${ref.userId}`) }
            }},
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        return {
            userId: ref.userId,
            username: ref.username,
            joinDate: ref.createdAt,
            planName: ref.activePlanInstance ? ref.activePlanInstance.plan.name : 'Nenhum',
            earningsForUser: earningsFromThisReferral.length > 0 ? earningsFromThisReferral[0].total : 0,
        };
    }));


    res.json({ 
        user, 
        transactions, 
        referrals: {
            count: referrals.length,
            list: formattedReferrals,
            totalOwnReferralEarnings: totalOwnReferralEarnings,
        },
        totalEarningsForReferrer: totalEarningsForReferrer, 
    });
});


// @desc    Bloquear/Desbloquear um usuário
// @route   PUT /api/admin/users/:id/block
// @access  Admin
const toggleUserBlock = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado para bloquear/desbloquear.');
    }
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({ message: `Usuário ${user.isBlocked ? 'bloqueado' : 'desbloqueado'} com sucesso.` });
});

// @desc    Definir saldo do usuário manualmente
// @route   PUT /api/admin/users/:id/balance
// @access  Admin
const updateUserBalance = asyncHandler(async (req, res) => {
    const { walletBalance, bonusBalance } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado para atualizar o saldo.');
    }

    if (walletBalance !== undefined) {
        const parsedWalletBalance = Number(walletBalance);
        if (isNaN(parsedWalletBalance) || parsedWalletBalance < 0) {
            res.status(400);
            throw new Error('O saldo da carteira deve ser um número válido e não negativo.');
        }
        user.walletBalance = parsedWalletBalance;
    }
    
    if (bonusBalance !== undefined) {
        const parsedBonusBalance = Number(bonusBalance);
        if (isNaN(parsedBonusBalance) || parsedBonusBalance < 0) {
            res.status(400);
            throw new Error('O saldo de bônus deve ser um número válido e não negativo.');
        }
        user.bonusBalance = parsedBonusBalance;
    }
    
    const updatedUser = await user.save();
    res.json({ message: 'Saldo do usuário atualizado com sucesso.', user: updatedUser });
});

// @desc    Redefinir PIN de um usuário
// @route   PUT /api/admin/users/:id/reset-pin
// @access  Admin
const resetUserPin = asyncHandler(async (req, res) => {
    const { newPin } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado para redefinir o PIN.');
    }

    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
        res.status(400);
        throw new Error('O novo PIN deve conter apenas números, entre 4 e 6 dígitos.');
    }

    const salt = await bcrypt.genSalt(10);
    user.pin = await bcrypt.hash(newPin, salt);
    await user.save();

    res.json({ message: `PIN do usuário ${user.userId} redefinido com sucesso. Novo PIN: ${newPin}` });
});

// @desc    NOVO: Atualizar o número de telefone de um usuário
// @route   PUT /api/admin/users/:id/phone
// @access  Admin
const updateUserPhoneNumber = asyncHandler(async (req, res) => {
    const { newPhone } = req.body;
    const userId = req.params.id;

    if (!newPhone) {
        res.status(400);
        throw new Error('Por favor, forneça o novo número de telefone.');
    }
    // NOVO: Validação do formato do telefone (9 dígitos)
    if (!/^\d{9}$/.test(newPhone)) {
        res.status(400);
        throw new Error('O novo número de telefone é inválido. Por favor, insira 9 dígitos numéricos.');
    }

    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado.');
    }

    // Verificar se o novo número já existe para outro usuário
    const phoneExistsForAnotherUser = await User.findOne({ phone: newPhone, _id: { $ne: userId } });
    if (phoneExistsForAnotherUser) {
        res.status(400);
        throw new Error('Este número de telefone já está em uso por outro usuário.');
    }

    user.phone = newPhone; // Atualiza com o número de 9 dígitos
    await user.save();

    res.json({ message: `Número de telefone do usuário ${user.userId} atualizado para ${newPhone} com sucesso.`, user });
});

// @desc    NOVO: Apagar a conta de um usuário
// @route   DELETE /api/admin/users/:id
// @access  Admin
const deleteUser = asyncHandler(async (req, res) => {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado para exclusão.');
    }

    // Remover todos os documentos associados ao usuário
    await Transaction.deleteMany({ user: userId });
    await PlanInstance.deleteMany({ user: userId });
    // TODO: Considerar o que fazer com referências inversas (usuários que ele convidou)
    // Por enquanto, o campo 'invitedBy' desses usuários permanecerá com um ObjectId que não existe mais.
    // Isso é aceitável, mas pode-se decidir nullificar esses campos se necessário.

    await user.deleteOne(); // Finalmente, remove o usuário

    res.json({ message: 'Conta de usuário, planos e transações associadas deletados com sucesso.' });
});


// --- GERENCIAMENTO DE TRANSAÇÕES ---

// @desc    Obter todas as requisições de depósito pendentes
// @route   GET /api/admin/deposits
// @access  Admin
const getPendingDeposits = asyncHandler(async (req, res) => {
    // ATUALIZADO: A populção de 'user' agora busca o telefone como 9 dígitos
    const deposits = await Transaction.find({ type: 'deposit', status: 'pending' }).populate('user', 'userId name phone');
    res.json(deposits);
});

// @desc    Aprovar uma requisição de depósito
// @route   POST /api/admin/deposits/:transactionId/approve
// @access  Admin
const approveDeposit = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction || transaction.type !== 'deposit' || transaction.status !== 'pending') {
        res.status(400);
        throw new Error('Requisição de depósito inválida ou já processada.');
    }

    const user = await User.findById(transaction.user);
    if (!user) {
        res.status(404);
        throw new Error('Usuário associado ao depósito não encontrado.');
    }

    user.walletBalance += transaction.amount;
    user.hasDeposited = true;
    await user.save();

    transaction.status = 'approved';
    await transaction.save();

    res.json({ message: 'Depósito aprovado com sucesso.' });
});

// @desc    Rejeitar uma requisição de depósito
// @route   POST /api/admin/deposits/:transactionId/reject
// @access  Admin
const rejectDeposit = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction || transaction.type !== 'deposit' || transaction.status !== 'pending') {
         res.status(400);
         throw new Error('Requisição de depósito inválida ou já processada.');
    }
    transaction.status = 'rejected';
    await transaction.save();
    res.json({ message: 'Depósito rejeitado com sucesso.' });
});

// @desc    Obter todas as requisições de saque pendentes
// @route   GET /api/admin/withdrawals
// @access  Admin
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    // ATUALIZADO: A populção de 'user' agora busca o telefone como 9 dígitos
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' })
                                         .populate('user', 'userId name phone walletBalance hasActivatedPlan'); 
    res.json(withdrawals);
});

// @desc    Aprovar uma requisição de saque
// @route   POST /api/admin/withdrawals/:transactionId/approve
// @access  Admin
const approveWithdrawal = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction || transaction.type !== 'withdrawal' || transaction.status !== 'pending') {
        res.status(400);
        throw new Error('Requisição de saque inválida ou já processada.');
    }

    const user = await User.findById(transaction.user);
    if (!user) {
        res.status(404);
        throw new Error('Usuário associado ao saque não encontrado.');
    }
    
    const totalDeducted = transaction.transactionDetails.totalDeducted;

    if (user.walletBalance < totalDeducted) {
        transaction.status = 'rejected';
        await transaction.save();
        res.status(400);
        throw new Error('Saque rejeitado: Saldo do usuário insuficiente no momento da aprovação.');
    }

    user.walletBalance -= totalDeducted;
    await user.save();

    transaction.status = 'approved';
    await transaction.save();

    res.json({ message: 'Saque aprovado com sucesso.' });
});

// @desc    Rejeitar uma requisição de saque
// @route   POST /api/admin/withdrawals/:transactionId/reject
// @access  Admin
const rejectWithdrawal = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.transactionId);
     if (!transaction || transaction.type !== 'withdrawal' || transaction.status !== 'pending') {
        res.status(400);
        throw new Error('Requisição de saque inválida ou já processada.');
    }
    transaction.status = 'rejected';
    await transaction.save();
    res.json({ message: 'Saque rejeitado com sucesso.' });
});


// --- GERENCIAMENTO DE BANNERS ---

// @desc    Obter todos os banners
// @route   GET /api/admin/banners
// @access  Admin
const getAllBanners = asyncHandler(async (req, res) => {
    const banners = await Banner.find({}).sort({ _id: -1 });
    res.json(banners);
});

// @desc    Criar um novo banner
// @route   POST /api/admin/banners
// @access  Admin
const createBanner = asyncHandler(async (req, res) => {
    const { linkUrl } = req.body;
    if (!req.file) {
        res.status(400);
        throw new Error('A imagem do banner é obrigatória. Por favor, selecione um arquivo.');
    }

    const banner = await Banner.create({
        imageUrl: req.file.path,
        linkUrl: linkUrl || ''
    });

    res.status(201).json({ message: 'Banner criado com sucesso!', banner });
});

// @desc    Deletar um banner
// @route   DELETE /api/admin/banners/:id
// @access  Admin
const deleteBanner = asyncHandler(async (req, res) => {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
        res.status(404);
        throw new Error('Banner não encontrado para exclusão.');
    }
    await banner.deleteOne();
    res.json({ message: 'Banner deletado com sucesso.' });
});

// --- GERENCIAMENTO DE CÓDIGOS DE SORTEIO ---

// @desc    Criar um novo código de sorteio
// @route   POST /api/admin/lottery-codes
// @access  Admin
const createLotteryCode = asyncHandler(async (req, res) => {
    const { valueMin, valueMax, maxUses, durationHours } = req.body;

    if (!valueMin || !valueMax || !maxUses || !durationHours) {
        res.status(400);
        throw new Error('Todos os campos (valor mínimo, valor máximo, usos máximos e duração em horas) são obrigatórios.');
    }

    const parsedValueMin = Number(valueMin);
    const parsedValueMax = Number(valueMax);
    const parsedMaxUses = Number(maxUses);
    const parsedDurationHours = Number(durationHours);

    if (isNaN(parsedValueMin) || parsedValueMin <= 0 ||
        isNaN(parsedValueMax) || parsedValueMax <= 0 ||
        isNaN(parsedMaxUses) || parsedMaxUses <= 0 ||
        isNaN(parsedDurationHours) || parsedDurationHours <= 0) {
        res.status(400);
        throw new Error('Todos os valores numéricos devem ser válidos e maiores que zero.');
    }

    if (parsedValueMin > parsedValueMax) {
        res.status(400);
        throw new Error('O valor mínimo não pode ser maior que o valor máximo.');
    }

    let uniqueCode = await generateLotteryCode();
    while (await LotteryCode.findOne({ code: uniqueCode })) {
        uniqueCode = await generateLotteryCode();
    }

    const expiresAt = new Date(Date.now() + parsedDurationHours * 60 * 60 * 1000);

    const newLotteryCode = await LotteryCode.create({
        code: uniqueCode,
        valueMin: parsedValueMin,
        valueMax: parsedValueMax,
        maxUses: parsedMaxUses,
        expiresAt: expiresAt,
        isActive: true,
    });

    res.status(201).json({ message: 'Código de sorteio criado com sucesso!', code: newLotteryCode });
});

// @desc    Obter todos os códigos de sorteio
// @route   GET /api/admin/lottery-codes
// @access  Admin
const getAllLotteryCodes = asyncHandler(async (req, res) => {
    const codes = await LotteryCode.find({}).sort({ createdAt: -1 });
    res.json(codes);
});

// @desc    Ativar/Desativar um código de sorteio
// @route   PUT /api/admin/lottery-codes/:id/toggle-status
// @access  Admin
const toggleLotteryCodeStatus = asyncHandler(async (req, res) => {
    const code = await LotteryCode.findById(req.params.id);
    if (!code) {
        res.status(404);
        throw new Error('Código de sorteio não encontrado.');
    }
    code.isActive = !code.isActive;
    await code.save();
    res.json({ message: `Código "${code.code}" ${code.isActive ? 'ativado' : 'desativado'} com sucesso.`, code });
});

// @desc    Deletar um código de sorteio
// @route   DELETE /api/admin/lottery-codes/:id
// @access  Admin
const deleteLotteryCode = asyncHandler(async (req, res) => {
    const code = await LotteryCode.findById(req.params.id);
    if (!code) {
        res.status(404);
        throw new Error('Código de sorteio não encontrado para exclusão.');
    }
    await code.deleteOne();
    res.json({ message: 'Código de sorteio deletado com sucesso.' });
});


// --- GERENCIAMENTO DE CONFIGURAÇÕES ---

// @desc    Obter as configurações do site
// @route   GET /api/admin/settings
// @access  Admin
const getSettings = asyncHandler(async (req, res) => {
    let settings = await Settings.findOne({ configKey: "main_settings" });
    if (!settings) {
        settings = await Settings.create({ configKey: "main_settings" });
    }
    res.json(settings);
});

// @desc    Atualizar as configurações do site
// @route   PUT /api/admin/settings
// @access  Admin
const updateSettings = asyncHandler(async (req, res) => {
    const { 
        depositMin, depositMax, withdrawalMin, withdrawalMax, withdrawalFee,
        welcomeBonus, referralCommissionRate, dailyCommissionRate, depositMethods
    } = req.body;

    const validateNumber = (value, fieldName) => {
        const num = Number(value);
        if (isNaN(num) || num < 0) {
            res.status(400);
            throw new new Error(`O campo '${fieldName}' deve ser um número válido e não negativo.`);
        }
        return num;
    };

    const validatedBody = {
        depositMin: validateNumber(depositMin, 'Depósito Mínimo'),
        depositMax: validateNumber(depositMax, 'Depósito Máximo'),
        withdrawalMin: validateNumber(withdrawalMin, 'Saque Mínimo'),
        withdrawalMax: validateNumber(withdrawalMax, 'Saque Máximo'),
        withdrawalFee: validateNumber(withdrawalFee, 'Taxa de Saque'),
        welcomeBonus: validateNumber(welcomeBonus, 'Bônus de Boas-vindas'),
        referralCommissionRate: validateNumber(referralCommissionRate, 'Comissão por Convite'),
        dailyCommissionRate: validateNumber(dailyCommissionRate, 'Comissão Diária'),
        depositMethods: []
    };

    if (validatedBody.depositMin > validatedBody.depositMax) {
        res.status(400);
        throw new Error('O depósito mínimo não pode ser maior que o depósito máximo.');
    }
    if (validatedBody.withdrawalMin > validatedBody.withdrawalMax) {
        res.status(400);
        throw new Error('O saque mínimo não pode ser maior que o saque máximo.');
    }
    if (validatedBody.withdrawalFee > 100 || validatedBody.withdrawalFee < 0) {
        res.status(400);
        throw new Error('A taxa de saque deve ser entre 0% e 100%.');
    }
    if (validatedBody.referralCommissionRate > 100 || validatedBody.referralCommissionRate < 0) {
        res.status(400);
        throw new Error('A taxa de comissão por convite deve ser entre 0% e 100%.');
    }
    if (validatedBody.dailyCommissionRate > 100 || validatedBody.dailyCommissionRate < 0) {
        res.status(400);
        throw new Error('A taxa de comissão diária deve ser entre 0% e 100%.');
    }

    if (Array.isArray(depositMethods)) {
        validatedBody.depositMethods = depositMethods.map(method => ({
            name: method.name,
            holderName: method.holderName,
            number: method.number,
            isActive: method.isActive
        }));
    }

    const updatedSettings = await Settings.findOneAndUpdate(
        { configKey: "main_settings" },
        { $set: validatedBody },
        { new: true, upsert: true, runValidators: true }
    );
    res.json({ message: 'Configurações atualizadas com sucesso!', settings: updatedSettings });
});


module.exports = {
    loginAdmin,
    getAllUsers,
    searchUsers,
    getUserDetailsForAdmin,
    toggleUserBlock,
    updateUserBalance,
    resetUserPin,
    updateUserPhoneNumber, // NOVO: Exporta a função
    deleteUser, // NOVO: Exporta a função
    getPendingDeposits,
    approveDeposit,
    rejectDeposit,
    getPendingWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    getAllBanners,
    createBanner,
    deleteBanner,
    createLotteryCode,
    getAllLotteryCodes,
    toggleLotteryCodeStatus,
    deleteLotteryCode,
    getSettings,
    updateSettings,
};