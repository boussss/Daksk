const bcrypt = require('bcryptjs');
const { Admin, User, Plan, Transaction, Settings, Banner } = require('./models');
const { generateToken } = require('./auth');

// =======================
// AUTENTICAÇÃO DO ADMIN
// =======================

const loginAdmin = async (req, res) => {
    const { phoneNumber, password } = req.body;
    try {
        const admin = await Admin.findOne({ phoneNumber });
        if (admin && (await bcrypt.compare(password, admin.password))) {
            res.json({
                _id: admin._id,
                phoneNumber: admin.phoneNumber,
                token: generateToken(admin._id),
            });
        } else {
            res.status(401).json({ message: 'Credenciais de administrador inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.', error: error.message });
    }
};

// =======================
// GERENCIAMENTO DE USUÁRIOS
// =======================

const getUsers = async (req, res) => {
    const { search } = req.query;
    try {
        const query = search ? { userId: search } : {};
        const users = await User.find(query).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar usuários.', error: error.message });
    }
};

const getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password').populate('activePlans.planId');
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
        
        const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 });
        const invitedUsers = await User.find({ invitedBy: user.userId }).select('userId phoneNumber');

        res.json({ user, transactions, invitedUsers });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar detalhes do usuário.', error: error.message });
    }
};

const toggleUserBlock = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
        
        user.isBlocked = !user.isBlocked;
        await user.save();
        res.json({ message: `Usuário ${user.isBlocked ? 'bloqueado' : 'desbloqueado'} com sucesso.` });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar status do usuário.', error: error.message });
    }
};

const updateUserBalance = async (req, res) => {
    // --- LÓGICA ATUALIZADA AQUI ---
    const { localWalletBalance, usdtWalletBalance } = req.body;
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (localWalletBalance !== undefined) {
            user.localWalletBalance = Number(localWalletBalance);
        }
        if (usdtWalletBalance !== undefined) {
            user.usdtWalletBalance = Number(usdtWalletBalance);
        }
        
        await user.save();
        res.json({ message: 'Saldos do usuário atualizados com sucesso.', user });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar saldos.', error: error.message });
    }
};

const updateUserCredentials = async (req, res) => {
    const { password, phoneNumber } = req.body;
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (password) user.password = password;
        if (phoneNumber) user.phoneNumber = phoneNumber;

        await user.save();
        res.json({ message: 'Credenciais do usuário atualizadas com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar credenciais.', error: error.message });
    }
};


// =======================
// GERENCIAMENTO DE PLANOS
// =======================

const createPlan = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'A imagem do plano é obrigatória.' });
        
        const newPlan = new Plan({ ...req.body, imageUrl: req.file.path });
        await newPlan.save();
        res.status(201).json({ message: 'Plano criado com sucesso.', plan: newPlan });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar plano.', error: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (req.file) {
            updateData.imageUrl = req.file.path;
        }
        const plan = await Plan.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!plan) return res.status(404).json({ message: 'Plano não encontrado.' });
        res.json({ message: 'Plano atualizado com sucesso.', plan });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar plano.', error: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        const plan = await Plan.findByIdAndDelete(req.params.id);
        if (!plan) return res.status(404).json({ message: 'Plano não encontrado.' });
        res.json({ message: 'Plano deletado com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao deletar plano.', error: error.message });
    }
};


// =======================
// GERENCIAMENTO DE TRANSAÇÕES
// =======================

const getPendingTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ status: 'pending' }).populate('user', 'userId phoneNumber');
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar transações.', error: error.message });
    }
};

const updateTransactionStatus = async (req, res) => {
    const { status } = req.body;
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ message: 'Transação não encontrada.' });
        if (transaction.status !== 'pending') return res.status(400).json({ message: 'Esta transação já foi processada.' });

        const user = await User.findById(transaction.user);
        if (!user) return res.status(404).json({ message: 'Usuário associado não encontrado.' });

        if (status === 'completed') {
            if (transaction.type === 'deposit') {
                // --- LÓGICA ATUALIZADA AQUI ---
                if (transaction.currency === 'USDT') {
                    user.usdtWalletBalance += transaction.amount;
                } else {
                    user.localWalletBalance += transaction.amount;
                }
            }
            transaction.status = 'completed';
        } else if (status === 'rejected') {
            if (transaction.type === 'withdrawal') {
                // --- LÓGICA ATUALIZADA AQUI ---
                if (transaction.currency === 'USDT') {
                    user.usdtWalletBalance += transaction.amount;
                } else {
                    user.localWalletBalance += transaction.amount;
                }
            }
            transaction.status = 'rejected';
        } else {
            return res.status(400).json({ message: 'Status inválido.' });
        }

        await user.save();
        await transaction.save();
        res.json({ message: `Transação ${status === 'completed' ? 'aprovada' : 'rejeitada'}.` });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar transação.', error: error.message });
    }
};

// =======================
// GERENCIAMENTO DE CONFIGURAÇÕES
// =======================

const getSettings = async (req, res) => {
    try {
        let settings = await Settings.findOne({ settingId: 'global_settings' });
        if (!settings) {
            settings = await Settings.create({});
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar configurações.', error: error.message });
    }
};

const updateSettings = async (req, res) => {
    try {
        const settings = await Settings.findOneAndUpdate(
            { settingId: 'global_settings' },
            req.body,
            { new: true, upsert: true } // Upsert cria se não existir
        );
        res.json({ message: 'Configurações atualizadas com sucesso.', settings });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar configurações.', error: error.message });
    }
};

// =======================
// GERENCIAMENTO DE BANNERS
// =======================

const addBanner = async (req, res) => {
    const { linkUrl } = req.body;
    try {
        if (!req.file) return res.status(400).json({ message: 'Imagem do banner é obrigatória.' });
        const banner = await Banner.create({ imageUrl: req.file.path, linkUrl });
        res.status(201).json({ message: 'Banner adicionado com sucesso.', banner });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao adicionar banner.', error: error.message });
    }
};

const deleteBanner = async (req, res) => {
    try {
        const banner = await Banner.findByIdAndDelete(req.params.id);
        if (!banner) return res.status(404).json({ message: 'Banner não encontrado.' });
        res.json({ message: 'Banner deletado com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao deletar banner.', error: error.message });
    }
};

module.exports = {
    loginAdmin,
    getUsers,
    getUserDetails,
    toggleUserBlock,
    updateUserBalance,
    updateUserCredentials,
    createPlan,
    updatePlan,
    deletePlan,
    getPendingTransactions,
    updateTransactionStatus,
    getSettings,
    updateSettings,
    addBanner,
    deleteBanner
};