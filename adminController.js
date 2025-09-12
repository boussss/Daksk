// adminController.js
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { Admin, User, Transaction, PlanInstance, Banner } = require('./models');
// CORREÇÃO: 'generateToken' agora vem de 'utils.js'.
const { generateToken } = require('./utils');

// @desc    Autenticar (login) o administrador
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });

    if (admin && (await bcrypt.compare(password, admin.password))) {
        res.json({
            _id: admin._id,
            username: admin.username,
            token: generateToken(admin._id),
        });
    } else {
        res.status(401);
        throw new Error('Username ou password inválido.');
    }
});

// --- GERENCIAMENTO DE USUÁRIOS ---

// @desc    Obter todos os usuários
// @route   GET /api/admin/users
// @access  Admin
const getAllUsers = asyncHandler(async (req, res) => {
    const users = await User.find({}).select('-pin');
    res.json(users);
});

// @desc    Pesquisar usuário por ID de 5 dígitos
// @route   GET /api/admin/users/search
// @access  Admin
const searchUserById = asyncHandler(async (req, res) => {
    const { userId } = req.query;
    const user = await User.findOne({ userId }).select('-pin');
    if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    res.json(user);
});

// @desc    Obter detalhes completos de um usuário (perfil, plano, transações)
// @route   GET /api/admin/users/:id
// @access  Admin
const getUserDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('-pin')
        .populate({
            path: 'activePlanInstance',
            populate: { path: 'plan', model: 'Plan' }
        });

    if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 });

    res.json({ user, transactions });
});

// @desc    Bloquear/Desbloquear um usuário
// @route   PUT /api/admin/users/:id/block
// @access  Admin
const toggleUserBlock = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        user.isBlocked = !user.isBlocked;
        await user.save();
        res.json({ message: `Usuário ${user.isBlocked ? 'bloqueado' : 'desbloqueado'} com sucesso.` });
    } else {
        res.status(404).json({ message: 'Usuário não encontrado.' });
    }
});

// @desc    Definir saldo do usuário manualmente
// @route   PUT /api/admin/users/:id/balance
// @access  Admin
const updateUserBalance = asyncHandler(async (req, res) => {
    const { walletBalance, bonusBalance } = req.body;
    const user = await User.findById(req.params.id);

    if (user) {
        user.walletBalance = walletBalance ?? user.walletBalance;
        user.bonusBalance = bonusBalance ?? user.bonusBalance;
        const updatedUser = await user.save();
        res.json(updatedUser);
    } else {
        res.status(404).json({ message: 'Usuário não encontrado.' });
    }
});


// --- GERENCIAMENTO DE TRANSAÇÕES ---

// @desc    Obter todas as requisições de depósito pendentes
// @route   GET /api/admin/deposits
// @access  Admin
const getPendingDeposits = asyncHandler(async (req, res) => {
    const deposits = await Transaction.find({ type: 'deposit', status: 'pending' }).populate('user', 'userId');
    res.json(deposits);
});

// @desc    Aprovar uma requisição de depósito
// @route   POST /api/admin/deposits/:transactionId/approve
// @access  Admin
const approveDeposit = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction || transaction.type !== 'deposit' || transaction.status !== 'pending') {
        return res.status(400).json({ message: 'Transação de depósito inválida ou já processada.' });
    }

    const user = await User.findById(transaction.user);
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
         return res.status(400).json({ message: 'Transação inválida ou já processada.' });
    }
    transaction.status = 'rejected';
    await transaction.save();
    res.json({ message: 'Depósito rejeitado com sucesso.' });
});

// @desc    Obter todas as requisições de saque pendentes
// @route   GET /api/admin/withdrawals
// @access  Admin
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' }).populate('user', 'userId walletBalance');
    res.json(withdrawals);
});

// @desc    Aprovar uma requisição de saque
// @route   POST /api/admin/withdrawals/:transactionId/approve
// @access  Admin
const approveWithdrawal = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction || transaction.type !== 'withdrawal' || transaction.status !== 'pending') {
        return res.status(400).json({ message: 'Transação de saque inválida ou já processada.' });
    }

    const user = await User.findById(transaction.user);
    if (user.walletBalance < transaction.amount) {
        transaction.status = 'rejected';
        await transaction.save();
        return res.status(400).json({ message: 'Saque rejeitado. Saldo do usuário é insuficiente.' });
    }

    user.walletBalance -= transaction.amount;
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
        return res.status(400).json({ message: 'Transação inválida ou já processada.' });
    }
    transaction.status = 'rejected';
    await transaction.save();
    res.json({ message: 'Saque rejeitado com sucesso.' });
});


// --- GERENCIAMENTO DE BANNERS ---

// @desc    Criar um novo banner
// @route   POST /api/admin/banners
// @access  Admin
const createBanner = asyncHandler(async (req, res) => {
    const { linkUrl } = req.body;
    if (!req.file) {
        return res.status(400).json({ message: 'A imagem do banner é obrigatória.' });
    }

    const banner = await Banner.create({
        imageUrl: req.file.path,
        linkUrl: linkUrl || ''
    });

    res.status(201).json(banner);
});

// @desc    Deletar um banner
// @route   DELETE /api/admin/banners/:id
// @access  Admin
const deleteBanner = asyncHandler(async (req, res) => {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
        return res.status(404).json({ message: 'Banner não encontrado.' });
    }
    await banner.deleteOne();
    res.json({ message: 'Banner deletado com sucesso.' });
});


module.exports = {
    loginAdmin,
    getAllUsers,
    searchUserById,
    getUserDetails,
    toggleUserBlock,
    updateUserBalance,
    getPendingDeposits,
    approveDeposit,
    rejectDeposit,
    getPendingWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    createBanner,
    deleteBanner,
};