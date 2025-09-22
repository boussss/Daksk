const bcrypt = require('bcryptjs');
const { User, Transaction, Plan, Settings, Banner } = require('./models');
const { generateToken } = require('./auth');
const { generateUniqueUserId } = require('./utils');

/**
 * @desc    Registrar um novo usuário
 * @route   POST /api/users/register
 * @access  Public
 */
const registerUser = async (req, res) => {
  const { phoneNumber, password, inviterId } = req.body;

  if (!phoneNumber || !password) {
    return res.status(400).json({ message: 'Por favor, forneça o número de telefone e a senha.' });
  }

  try {
    const userExists = await User.findOne({ phoneNumber });
    if (userExists) {
      return res.status(400).json({ message: 'Um usuário com este número de telefone já existe.' });
    }

    const userId = await generateUniqueUserId();

    const settings = await Settings.findOne({ settingId: 'global_settings' });
    const welcomeBonus = settings ? settings.welcomeBonus : 0;

    const user = await User.create({
      phoneNumber,
      password,
      userId,
      invitedBy: inviterId || null,
      bonusBalance: welcomeBonus
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        userId: user.userId,
        phoneNumber: user.phoneNumber,
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
          return res.status(403).json({ message: 'Sua conta foi bloqueada. Entre em contato com o suporte.' });
      }

      res.json({
        _id: user._id,
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
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
 * @desc    Obter perfil do usuário logado
 * @route   GET /api/users/profile
 * @access  Private
 */
const getUserProfile = async (req, res) => {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ message: 'Usuário não encontrado.' });
    }
};

/**
 * @desc    Atualizar foto de perfil do usuário
 * @route   PUT /api/users/profile/picture
 * @access  Private
 */
const updateUserProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhuma imagem foi enviada.' });
        }
        
        const user = await User.findById(req.user._id);
        if (user) {
            user.profilePicture = req.file.path; // URL do Cloudinary
            await user.save();
            res.json({ message: 'Foto de perfil atualizada com sucesso.', profilePicture: user.profilePicture });
        } else {
            res.status(404).json({ message: 'Usuário não encontrado.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor ao atualizar a foto.', error: error.message });
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
        const invitedUsers = await User.find({ invitedBy: req.user.userId }).select('userId createdAt');
        
        // Corrigido para apontar para index.html
        const referralLink = `${process.env.APP_URL}/index.html?ref=${req.user.userId}`;

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
 * @desc    Criar uma solicitação de depósito
 * @route   POST /api/users/deposit
 * @access  Private
 */
const createDepositRequest = async (req, res) => {
    const { amount } = req.body;
    
    if (!amount || !req.file) {
        return res.status(400).json({ message: 'Valor e comprovante são obrigatórios.' });
    }

    try {
        await Transaction.create({
            user: req.user._id,
            type: 'deposit',
            amount: Number(amount),
            status: 'pending',
            proofScreenshot: req.file.path // URL do Cloudinary
        });

        res.status(201).json({ message: 'Solicitação de depósito enviada com sucesso. Aguarde a aprovação do administrador.' });

    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar solicitação de depósito.', error: error.message });
    }
};

/**
 * @desc    Criar uma solicitação de saque (MODIFICADO)
 * @route   POST /api/users/withdrawal
 * @access  Private
 */
const createWithdrawalRequest = async (req, res) => {
    const { amount, accountHolderName } = req.body; // Adicionado accountHolderName

    try {
        const user = await User.findById(req.user._id);

        if (!user.hasDeposited) {
            return res.status(403).json({ message: 'Você precisa ter ativado um plano para poder sacar.' });
        }

        if (user.walletBalance < amount) {
            return res.status(400).json({ message: 'Saldo insuficiente.' });
        }

        if (!accountHolderName) {
            return res.status(400).json({ message: 'O nome do titular da conta é obrigatório.' });
        }

        // Subtrai o valor da carteira e cria a transação pendente
        user.walletBalance -= Number(amount);
        await user.save();

        await Transaction.create({
            user: req.user._id,
            type: 'withdrawal',
            amount: Number(amount),
            status: 'pending',
            details: `Saque para: ${accountHolderName} - ${user.phoneNumber}` // Salva o nome e o número nos detalhes
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
 * @desc    [NOVO] Obter configurações públicas (números de pagamento)
 * @route   GET /api/settings/public
 * @access  Public
 */
const getPublicSettings = async (req, res) => {
    try {
        const settings = await Settings.findOne({ settingId: 'global_settings' });
        if (settings) {
            res.json({
                mpesaNumber: settings.mpesaNumber,
                emolaNumber: settings.emolaNumber
            });
        } else {
            // Retorna strings vazias se as configurações não existirem para evitar erros no frontend
            res.json({
                mpesaNumber: "",
                emolaNumber: ""
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor', error: error.message });
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
  getPublicSettings // Não se esqueça de exportar a nova função
};