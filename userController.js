const bcrypt = require('bcryptjs');
const { User, Transaction, Settings } = require('./models');
const { generateToken } = require('./auth');
const { generateUniqueUserId } = require('./utils');

/**
 * @desc    Registrar um novo usuário (com seleção de país)
 * @route   POST /api/users/register
 * @access  Public
 */
const registerUser = async (req, res) => {
  const { phoneNumber, password, country, inviterId } = req.body;

  if (!phoneNumber || !password || !country) {
    return res.status(400).json({ message: 'Telefone, senha e país são obrigatórios.' });
  }

  const validCountries = ['MZ', 'AO', 'BR'];
  if (!validCountries.includes(country)) {
    return res.status(400).json({ message: 'País inválido.' });
  }

  try {
    const userExists = await User.findOne({ phoneNumber });
    if (userExists) {
      return res.status(400).json({ message: 'Este número de telefone já está em uso.' });
    }

    const userId = await generateUniqueUserId();
    const settings = await Settings.findOne({ settingId: 'global_settings' });

    let welcomeAmount = 0;
    let localCurrency = '';

    switch (country) {
      case 'MZ':
        welcomeAmount = settings ? settings.welcomeBonusMZ : 0;
        localCurrency = 'MT';
        break;
      case 'AO':
        welcomeAmount = settings ? settings.welcomeBonusAO : 0;
        localCurrency = 'AOA';
        break;
      case 'BR':
        welcomeAmount = settings ? settings.welcomeBonusBR : 0;
        localCurrency = 'BRL';
        break;
    }

    const user = await User.create({
      phoneNumber,
      password,
      userId,
      country,
      localCurrency,
      invitedBy: inviterId || null,
      localWalletBalance: welcomeAmount,
    });

    if (user) {
      if (welcomeAmount > 0) {
        await Transaction.create({
          user: user._id,
          type: 'bonus',
          currency: localCurrency,
          amount: welcomeAmount,
          status: 'completed',
          details: 'Saldo de Boas-Vindas'
        });
      }

      res.status(201).json({
        _id: user._id,
        userId: user.userId,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Dados de usuário inválidos.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
};

/**
 * @desc    Autenticar (login) um usuário
 * @route   POST /api/users/login
 * @access  Public
 */
const loginUser = async (req, res) => {
  const { phoneNumber, password } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });

    if (user && (await bcrypt.compare(password, user.password))) {
      if (user.isBlocked) {
        return res.status(403).json({ message: 'Sua conta foi bloqueada.' });
      }
      res.json({
        _id: user._id,
        userId: user.userId,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Número de telefone ou senha inválidos.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
};

/**
 * @desc    Obter perfil do usuário (com cálculo de saldo total)
 * @route   GET /api/users/profile
 * @access  Private
 */
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    
    const settings = await Settings.findOne({ settingId: 'global_settings' });
    const usdtRate = settings.usdtExchangeRates[user.country];
    
    const usdtValueInLocalCurrency = user.usdtWalletBalance * usdtRate;
    const totalBalanceInLocalCurrency = user.localWalletBalance + usdtValueInLocalCurrency;

    const teamMembers = await User.countDocuments({ invitedBy: user.userId });
    
    const stats = { teamMembers };

    res.json({
      ...user.toObject(),
      usdtExchangeRate: usdtRate,
      totalBalanceInLocalCurrency,
      stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar perfil.', error: error.message });
  }
};

/**
 * @desc    Atualizar foto de perfil
 * @route   PUT /api/users/profile/picture
 * @access  Private
 */
const updateUserProfilePicture = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Nenhuma imagem foi enviada.' });
        const user = await User.findByIdAndUpdate(req.user._id, { profilePicture: req.file.path }, { new: true });
        res.json({ message: 'Foto de perfil atualizada.', profilePicture: user.profilePicture });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.', error: error.message });
    }
};

/**
 * @desc    Obter informações de referência do usuário
 * @route   GET /api/users/referral
 * @access  Private
 */
const getReferralInfo = async (req, res) => {
    try {
        const settings = await Settings.findOne({ settingId: 'global_settings' });
        const invitedUsers = await User.find({ invitedBy: req.user.userId }).select('userId createdAt profilePicture');
        
        const referralLink = `${process.env.APP_URL || 'http://localhost:3000'}/index.html?ref=${req.user.userId}`;

        res.json({
            referralLink,
            commissionPercentage: settings.referralCommissionPercentage,
            dailyProfitSharePercentage: settings.dailyProfitSharePercentage,
            invitedUsersCount: invitedUsers.length,
            invitedUsersList: invitedUsers
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor', error: error.message });
    }
};

/**
 * @desc    Criar solicitação de depósito (LOCAL ou USDT)
 * @route   POST /api/users/deposit
 * @access  Private
 */
const createDepositRequest = async (req, res) => {
    const { amount, currency } = req.body;
    
    if (!amount || !currency || !req.file) {
        return res.status(400).json({ message: 'Valor, moeda e comprovante são obrigatórios.' });
    }
    if (!['LOCAL', 'USDT'].includes(currency)) {
        return res.status(400).json({ message: 'Moeda inválida.' });
    }

    try {
        await Transaction.create({
            user: req.user._id,
            type: 'deposit',
            currency: currency === 'USDT' ? 'USDT' : req.user.localCurrency,
            amount: Number(amount),
            status: 'pending',
            proofScreenshot: req.file.path
        });
        res.status(201).json({ message: 'Solicitação de depósito enviada com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar solicitação de depósito.', error: error.message });
    }
};

/**
 * @desc    Criar solicitação de saque (LOCAL ou USDT)
 * @route   POST /api/users/withdrawal
 * @access  Private
 */
const createWithdrawalRequest = async (req, res) => {
    const { amount, currency, accountHolderName, phoneNumber, usdtAddress } = req.body;
    
    if (!amount || !currency) return res.status(400).json({ message: 'Valor e moeda são obrigatórios.' });

    try {
        const user = await User.findById(req.user._id);
        let details = '';
        
        // Validação básica se o usuário já fez algum depósito para poder sacar
        const hasCompletedDeposit = await Transaction.findOne({ user: user._id, type: 'deposit', status: 'completed' });
        if (!hasCompletedDeposit) {
            return res.status(403).json({ message: 'Você precisa ter um depósito aprovado para poder sacar.' });
        }

        if (currency === 'USDT') {
            if (user.usdtWalletBalance < amount) return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
            if (!usdtAddress) return res.status(400).json({ message: 'Endereço da carteira USDT é obrigatório.' });
            user.usdtWalletBalance -= Number(amount);
            details = `Saque USDT para: ${usdtAddress}`;
        } else { // Moeda Local
            if (user.localWalletBalance < amount) return res.status(400).json({ message: 'Saldo local insuficiente.' });
            if (user.country === 'MZ' && (!accountHolderName || !phoneNumber)) {
                 return res.status(400).json({ message: 'Nome e telefone são obrigatórios para saques em Moçambique.' });
            }
            user.localWalletBalance -= Number(amount);
            details = `Saque para: ${accountHolderName} - ${phoneNumber}`;
        }
        
        await user.save();
        await Transaction.create({
            user: user._id,
            type: 'withdrawal',
            currency: currency === 'USDT' ? 'USDT' : user.localCurrency,
            amount: Number(amount),
            status: 'pending',
            details
        });

        res.status(201).json({ message: 'Solicitação de saque enviada com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar solicitação de saque.', error: error.message });
    }
};

/**
 * @desc    Obter histórico de transações do usuário
 * @route   GET /api/users/transactions
 * @access  Private
 */
const getUserTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar transações.', error: error.message });
    }
};

/**
 * @desc    Obter configurações públicas (números de pagamento e endereço USDT)
 * @route   GET /api/settings/public
 * @access  Public
 */
const getPublicSettings = async (req, res) => {
    try {
        const settings = await Settings.findOne({ settingId: 'global_settings' });
        if (settings) {
            res.json({
                mpesaNumber: settings.mpesaNumber,
                mpesaHolderName: settings.mpesaHolderName,
                emolaNumber: settings.emolaNumber,
                emolaHolderName: settings.emolaHolderName,
                usdtDepositAddress: settings.usdtDepositAddress
            });
        } else {
            res.status(404).json({ message: 'Configurações não encontradas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.', error: error.message });
    }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfilePicture,
  getReferralInfo,
  createDepositRequest,
  createWithdrawalRequest,
  getUserTransactions,
  getPublicSettings
};