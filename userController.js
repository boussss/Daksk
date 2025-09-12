// userController.js
const asyncHandler = require('express-async-handler');
const { User, Transaction, Plan, PlanInstance } = require('./models'); // Adicionado Plan e PlanInstance para populate
const { generateToken, generateUniqueUserId, generateInviteLink } = require('./utils');

// @desc    Cadastrar um novo usuário
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, username, phone, pin, invitedById } = req.body;

  if (!name || !username || !phone || !pin) {
    res.status(400);
    throw new Error('Por favor, preencha todos os campos obrigatórios.');
  }

  const usernameExists = await User.findOne({ username });
  if (usernameExists) {
    res.status(400);
    throw new Error('Este nome de usuário já está em uso.');
  }
  const phoneExists = await User.findOne({ phone });
  if (phoneExists) {
    res.status(400);
    throw new Error('Este número de telefone já está em uso.');
  }
  
  if (pin.length < 4 || pin.length > 6) {
    res.status(400);
    throw new Error('O PIN deve ter entre 4 e 6 dígitos.');
  }

  let newUserId;
  let userExists = true;
  while (userExists) {
    newUserId = generateUniqueUserId().toString();
    userExists = await User.findOne({ userId: newUserId });
  }

  let invitedByUser = null;
  if (invitedById) {
      invitedByUser = await User.findOne({ userId: invitedById });
  }

  const user = await User.create({
    name,
    username,
    phone,
    pin,
    userId: newUserId,
    invitedBy: invitedByUser ? invitedByUser._id : null,
  });
  
  user.inviteLink = generateInviteLink(user.userId);
  
  const welcomeBonusAmount = 50;
  user.bonusBalance += welcomeBonusAmount;
  
  await user.save();

  await Transaction.create({
    user: user._id,
    type: 'welcome_bonus',
    amount: welcomeBonusAmount,
    status: 'approved',
    description: 'Bônus de boas-vindas'
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      userId: user.userId,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Dados de usuário inválidos.');
  }
});

// @desc    Autenticar (login) um usuário
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) {
    res.status(400);
    throw new Error('Por favor, forneça o número de telefone e o PIN.');
  }

  const user = await User.findOne({ phone });

  if (user && user.pin === pin) {
    if (user.isBlocked) {
      res.status(403);
      throw new Error('Esta conta está bloqueada.');
    }
    res.json({
      _id: user._id,
      userId: user.userId,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error('Telefone ou PIN inválido.');
  }
});

// @desc    Obter perfil do usuário logado
// @route   GET /api/users/me
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-pin');
  res.json(user);
});

// @desc    Obter dados agregados para o dashboard do usuário
// @route   GET /api/users/dashboard
// @access  Private
const getDashboardData = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // --- 1. Obter dados básicos do usuário e do plano ativo ---
    const user = await User.findById(userId)
        .select('-pin')
        .populate({
            path: 'activePlanInstance',
            populate: { path: 'plan', model: 'Plan' }
        });

    if (!user) { res.status(404); throw new Error('Usuário não encontrado.'); }

    // --- 2. Calcular estatísticas de lucro com datas ---
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Função auxiliar para rodar a agregação
    const getProfitSum = async (startDate, endDate, types) => {
        const result = await Transaction.aggregate([
            { $match: { 
                user: userId, 
                status: 'approved', 
                type: { $in: types }, 
                createdAt: { $gte: startDate, $lt: endDate } 
            }},
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        return result.length > 0 ? result[0].total : 0;
    };

    const profitTypes = ['collection', 'commission'];

    // Executa os cálculos em paralelo para mais performance
    const [todayProfit, yesterdayProfit, monthProfit, totalReferralProfit] = await Promise.all([
        getProfitSum(todayStart, new Date(todayStart.getTime() + 24 * 60 * 60 * 1000), profitTypes),
        getProfitSum(yesterdayStart, todayStart, profitTypes),
        getProfitSum(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1), profitTypes),
        getProfitSum(new Date(0), new Date(), ['commission']) // Comissão total (desde o início)
    ]);
    
    // --- 3. Montar o objeto de resposta final ---
    res.json({ 
        user,
        stats: {
            todayProfit,
            yesterdayProfit,
            monthProfit,
            totalReferralProfit,
        }
    });
});


// @desc    Fazer upload da foto de perfil
// @route   POST /api/users/profile/picture
// @access  Private
const uploadProfilePicture = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!req.file) { res.status(400); throw new Error("Nenhuma imagem foi enviada."); }
    if (user) {
        user.profilePicture = req.file.path;
        await user.save();
        res.json({ message: "Foto de perfil atualizada com sucesso.", profilePictureUrl: user.profilePicture });
    } else { res.status(404); throw new Error("Usuário não encontrado."); }
});

// @desc    Criar uma requisição de depósito
// @route   POST /api/users/deposit
// @access  Private
const createDepositRequest = asyncHandler(async (req, res) => {
    const { amount, proofText } = req.body; 

    if (!amount || amount <= 0) { 
        res.status(400); 
        throw new Error("O valor do depósito deve ser maior que zero."); 
    }

    if (!req.file && !proofText) {
        res.status(400);
        throw new Error("O comprovativo de depósito (imagem ou texto) é obrigatório.");
    }

    let transactionDetails = {};
    if (req.file) {
        transactionDetails = { 
            proofType: 'image',
            proofImageUrl: req.file.path 
        };
    } else {
        transactionDetails = { 
            proofType: 'text',
            proofText: proofText 
        };
    }
    
    const depositTransaction = await Transaction.create({
        user: req.user._id, 
        type: 'deposit', 
        amount: Number(amount), 
        status: 'pending',
        description: `Requisição de depósito de ${amount} MT`,
        transactionDetails: transactionDetails
    });
    
    res.status(201).json({ 
        message: "Requisição de depósito enviada com sucesso. Aguardando aprovação.", 
        transaction: depositTransaction 
    });
});

// @desc    Criar uma requisição de saque
// @route   POST /api/users/withdraw
// @access  Private
const createWithdrawalRequest = asyncHandler(async (req, res) => {
    const { amount, paymentNumber } = req.body;
    const user = req.user;
    if (!user.hasDeposited) { res.status(403); throw new Error("Você precisa ter um depósito aprovado para poder sacar."); }
    if (!amount || !paymentNumber) { res.status(400); throw new Error("Valor e número para pagamento são obrigatórios."); }
    if (Number(amount) > user.walletBalance) { res.status(400); throw new Error("Saldo insuficiente. Você não pode sacar mais do que o seu saldo real."); }
    const withdrawalTransaction = await Transaction.create({
        user: user._id, type: 'withdrawal', amount: Number(amount), status: 'pending',
        description: `Requisição de saque de ${amount} MT`,
        transactionDetails: { destinationNumber: paymentNumber }
    });
    res.status(201).json({ message: "Requisição de saque enviada com sucesso. Aguardando aprovação.", transaction: withdrawalTransaction });
});

// @desc    Obter histórico de transações do usuário
// @route   GET /api/users/transactions
// @access  Private
const getUserTransactions = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(transactions);
});

// @desc    Obter dados de referência do usuário
// @route   GET /api/users/referrals
// @access  Private
const getReferralData = asyncHandler(async (req, res) => {
    // Busca os convidados e popula os dados do plano ativo e os detalhes do plano
    const referrals = await User.find({ invitedBy: req.user._id })
        .select('userId username createdAt activePlanInstance')
        .populate({
            path: 'activePlanInstance',
            populate: {
                path: 'plan',
                model: 'Plan',
                select: 'name' // Seleciona apenas o nome do plano
            }
        });

    // Função para calcular o total de comissão para um convidado específico
    const getCommissionFromReferral = async (referralUserId) => {
        const result = await Transaction.aggregate([
            { $match: {
                user: req.user._id,
                type: 'commission',
                status: 'approved',
                // Procura pela descrição que contém o ID do convidado
                description: { $regex: new RegExp(referralUserId) }
            }},
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        return result.length > 0 ? result[0].total : 0;
    };

    // Mapeia os convidados para o formato desejado, calculando a comissão para cada um
    const referralsList = await Promise.all(referrals.map(async (ref) => {
        const totalYield = await getCommissionFromReferral(ref.userId);
        return {
            userId: ref.userId,
            username: ref.username,
            joinDate: ref.createdAt,
            planName: ref.activePlanInstance ? ref.activePlanInstance.plan.name : 'Nenhum',
            totalYield: totalYield,
        };
    }));

    res.json({
        inviteLink: req.user.inviteLink,
        referralCount: referrals.length,
        referralsList: referralsList,
    });
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  getDashboardData,
  uploadProfilePicture,
  createDepositRequest,
  createWithdrawalRequest,
  getUserTransactions,
  getReferralData,
};