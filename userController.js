// userController.js
const asyncHandler = require('express-async-handler');
const { User, Transaction, Plan, PlanInstance, Banner } = require('./models');
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
  
  // Apenas salva os dados. O link completo será gerado quando solicitado.
  await user.save();

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

    const [user, banners] = await Promise.all([
        User.findById(userId)
            .select('-pin')
            .populate({
                path: 'activePlanInstance',
                populate: { path: 'plan', model: 'Plan' }
            }),
        Banner.find({ isActive: true })
    ]);

    if (!user) { res.status(404); throw new Error('Usuário não encontrado.'); }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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

    const [todayProfit, yesterdayProfit, monthProfit, totalReferralProfit] = await Promise.all([
        getProfitSum(todayStart, new Date(todayStart.getTime() + 24 * 60 * 60 * 1000), profitTypes),
        getProfitSum(yesterdayStart, todayStart, profitTypes),
        getProfitSum(monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1), profitTypes),
        getProfitSum(new Date(0), new Date(), ['commission'])
    ]);
    
    res.json({ 
        user,
        banners,
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
    const DEPOSIT_MIN = 50;
    const DEPOSIT_MAX = 25000;
    
    const { amount, proofText } = req.body;
    const depositAmount = Number(amount);

    if (!depositAmount || depositAmount <= 0) { 
        res.status(400); 
        throw new Error("O valor do depósito deve ser maior que zero."); 
    }
    
    if (depositAmount < DEPOSIT_MIN || depositAmount > DEPOSIT_MAX) {
        res.status(400);
        throw new Error(`O valor do depósito deve estar entre ${DEPOSIT_MIN} MT e ${DEPOSIT_MAX} MT.`);
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
        amount: depositAmount,
        status: 'pending',
        description: `Requisição de depósito de ${depositAmount.toFixed(2)} MT`,
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
    const WITHDRAWAL_MIN = 100;
    const WITHDRAWAL_MAX = 25000;
    const WITHDRAWAL_FEE_PERCENTAGE = 3;

    const { amount, paymentNumber } = req.body;
    const user = req.user;
    const withdrawalAmount = Number(amount);
    
    if (!withdrawalAmount || !paymentNumber) { 
        res.status(400); 
        throw new Error("Valor e número para pagamento são obrigatórios."); 
    }
    
    if (withdrawalAmount < WITHDRAWAL_MIN || withdrawalAmount > WITHDRAWAL_MAX) {
        res.status(400);
        throw new Error(`O valor do saque deve estar entre ${WITHDRAWAL_MIN} MT e ${WITHDRAWAL_MAX} MT.`);
    }

    if (!user.hasDeposited) { 
        res.status(403); 
        throw new Error("Você precisa ter um depósito aprovado para poder sacar."); 
    }
    
    const fee = (withdrawalAmount * WITHDRAWAL_FEE_PERCENTAGE) / 100;
    const totalDeducted = withdrawalAmount + fee;
    
    if (totalDeducted > user.walletBalance) { 
        res.status(400); 
        throw new Error(`Saldo insuficiente. Você precisa de ${totalDeducted.toFixed(2)} MT para sacar ${withdrawalAmount.toFixed(2)} MT (incluindo taxa de ${fee.toFixed(2)} MT).`); 
    }
    
    const withdrawalTransaction = await Transaction.create({
        user: user._id, 
        type: 'withdrawal', 
        amount: -withdrawalAmount,
        status: 'pending',
        description: `Saque de ${withdrawalAmount.toFixed(2)} MT`,
        transactionDetails: { 
            destinationNumber: paymentNumber,
            fee: fee,
            totalDeducted: totalDeducted 
        }
    });

    res.status(201).json({ 
        message: "Requisição de saque enviada com sucesso. Aguardando aprovação.", 
        transaction: withdrawalTransaction 
    });
});

// @desc    Obter dados de referência do usuário
// @route   GET /api/users/referrals
// @access  Private
const getReferralData = asyncHandler(async (req, res) => {
    const referrals = await User.find({ invitedBy: req.user._id })
        .select('userId username createdAt activePlanInstance')
        .populate({
            path: 'activePlanInstance',
            populate: {
                path: 'plan',
                model: 'Plan',
                select: 'name'
            }
        });

    const getCommissionFromReferral = async (referralUserId) => {
        const result = await Transaction.aggregate([
            { $match: {
                user: req.user._id,
                type: 'commission',
                status: 'approved',
                description: { $regex: new RegExp(referralUserId) }
            }},
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        return result.length > 0 ? result[0].total : 0;
    };

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

    // --- CORREÇÃO APLICADA AQUI ---
    const fullInviteLink = generateInviteLink(req.user.userId);

    res.json({
        inviteLink: fullInviteLink, // Envia o link completo
        referralCount: referrals.length,
        referralsList: referralsList,
    });
});

// @desc    Obter histórico de planos e de transações do usuário
// @route   GET /api/users/history
// @access  Private
const getHistoryData = asyncHandler(async (req, res) => {
    const [planInstances, transactions] = await Promise.all([
        PlanInstance.find({ user: req.user._id })
            .populate('plan', 'name')
            .sort({ startDate: -1 }),
        Transaction.find({ user: req.user._id })
            .sort({ createdAt: -1 })
    ]);

    res.status(200).json({ planInstances, transactions });
});

// @desc    Obter um resumo estatístico da carteira
// @route   GET /api/users/wallet-summary
// @access  Private
const getWalletSummary = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const summary = await Transaction.aggregate([
        {
            $match: {
                user: userId,
                status: 'approved'
            }
        },
        {
            $group: {
                _id: '$type',
                total: { $sum: '$amount' }
            }
        }
    ]);

    const summaryData = summary.reduce((acc, item) => {
        acc[item._id] = item.total;
        return acc;
    }, {});
    
    const totalDeposited = summaryData.deposit || 0;
    const totalWithdrawn = Math.abs(summaryData.withdrawal || 0);
    const totalProfit = (summaryData.collection || 0) + (summaryData.commission || 0) + (summaryData.welcome_bonus || 0);

    res.status(200).json({
        totalDeposited,
        totalWithdrawn,
        totalProfit
    });
});

// @desc    Obter histórico de transações do usuário (para atividade recente)
// @route   GET /api/users/transactions
// @access  Private
const getUserTransactions = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(transactions);
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  getDashboardData,
  uploadProfilePicture,
  createDepositRequest,
  createWithdrawalRequest,
  getReferralData,
  getWalletSummary,
  getHistoryData,
  getUserTransactions,
};