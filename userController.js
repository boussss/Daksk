// userController.js
const asyncHandler = require('express-async-handler');
const { User, Transaction, Banner } = require('./models');
// CORREÇÃO: 'generateToken' agora vem de 'utils.js' para quebrar a dependência circular.
const { generateToken, generateUniqueUserId, generateInviteLink } = require('./utils');

// @desc    Cadastrar um novo usuário
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { pin, invitedById } = req.body;

  if (!pin || pin.length < 4 || pin.length > 6) {
    res.status(400);
    throw new Error('O PIN deve ter entre 4 e 6 dígitos.');
  }

  // Gera um ID único e garante que ele não existe no banco de dados
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

  // Cria o novo usuário
  const user = await User.create({
    pin, // ATENÇÃO: Armazenando o PIN em texto puro, conforme solicitado.
    userId: newUserId,
    invitedBy: invitedByUser ? invitedByUser._id : null,
  });
  
  // Atualiza o link de convite do usuário
  user.inviteLink = generateInviteLink(user.userId);
  
  // Adiciona o bônus de boas-vindas (Ex: 50MT)
  const welcomeBonusAmount = 50;
  user.bonusBalance += welcomeBonusAmount;
  
  await user.save();

  // Cria a transação de bônus de boas-vindas
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
  const { pin } = req.body;
  if (!pin) {
    res.status(400);
    throw new Error('Por favor, forneça o PIN.');
  }

  // Encontra o usuário pelo PIN (comparação direta de texto puro)
  const user = await User.findOne({ pin });

  if (user) {
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
    throw new Error('PIN inválido.');
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
    const user = await User.findById(req.user._id)
        .select('-pin')
        .populate({
            path: 'activePlanInstance',
            populate: {
                path: 'plan',
                model: 'Plan'
            }
        });

    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado.');
    }

    let canCollect = false;
    if (user.activePlanInstance) {
        const instance = user.activePlanInstance;
        if (!instance.lastCollectedDate) {
            canCollect = true;
        } else {
            const nextCollectionTime = new Date(instance.lastCollectedDate).getTime() + (24 * 60 * 60 * 1000);
            if (Date.now() >= nextCollectionTime) {
                canCollect = true;
            }
        }
    }

    const banners = await Banner.find({ isActive: true });

    res.json({
        user,
        banners,
        canCollect,
    });
});


// @desc    Fazer upload da foto de perfil
// @route   POST /api/users/profile/picture
// @access  Private
const uploadProfilePicture = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!req.file) {
        res.status(400);
        throw new Error("Nenhuma imagem foi enviada.");
    }

    if (user) {
        user.profilePicture = req.file.path;
        await user.save();
        res.json({
            message: "Foto de perfil atualizada com sucesso.",
            profilePictureUrl: user.profilePicture,
        });
    } else {
        res.status(404);
        throw new Error("Usuário não encontrado.");
    }
});


// @desc    Criar uma requisição de depósito
// @route   POST /api/users/deposit
// @access  Private
const createDepositRequest = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
        res.status(400);
        throw new Error("O valor do depósito deve ser maior que zero.");
    }

    if (!req.file) {
        res.status(400);
        throw new Error("O comprovativo de depósito é obrigatório.");
    }

    const depositTransaction = await Transaction.create({
        user: req.user._id,
        type: 'deposit',
        amount: Number(amount),
        status: 'pending',
        description: `Requisição de depósito de ${amount} MT`,
        transactionDetails: {
            proofImageUrl: req.file.path,
        }
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

    if (!user.hasDeposited) {
        res.status(403);
        throw new Error("Você precisa ter um depósito aprovado para poder sacar.");
    }

    if (!amount || !paymentNumber) {
        res.status(400);
        throw new Error("Valor e número para pagamento são obrigatórios.");
    }

    if (Number(amount) > user.walletBalance) {
        res.status(400);
        throw new Error("Saldo insuficiente. Você não pode sacar mais do que o seu saldo real.");
    }

    const withdrawalTransaction = await Transaction.create({
        user: user._id,
        type: 'withdrawal',
        amount: Number(amount),
        status: 'pending',
        description: `Requisição de saque de ${amount} MT`,
        transactionDetails: {
            destinationNumber: paymentNumber,
        }
    });

    res.status(201).json({
        message: "Requisição de saque enviada com sucesso. Aguardando aprovação.",
        transaction: withdrawalTransaction
    });
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
    const referrals = await User.find({ invitedBy: req.user._id })
        .select('userId createdAt activePlanInstance');

    res.json({
        inviteLink: req.user.inviteLink,
        referralCount: referrals.length,
        referralsList: referrals.map(ref => ({
            userId: ref.userId,
            joinDate: ref.createdAt,
            isActive: !!ref.activePlanInstance
        })),
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