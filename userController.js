// userController.js
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { User, Transaction, Plan, PlanInstance, Banner, Settings, LotteryCode } = require('./models');
const { generateToken, generateUniqueUserId, generateInviteLink } = require('./utils');

/**
 * Função auxiliar para limpar e validar números de telefone para armazenamento no DB.
 * Remove caracteres não-dígitos (exceto o '+' se for o primeiro).
 * Retorna o número validado no formato que deve ser salvo (ex: "841234567" ou "+258841234567"),
 * respeitando a presença/ausência do prefixo na entrada original, mas garantindo 9 dígitos após o prefixo.
 * @param {string | null | undefined} rawPhone - O número de telefone como recebido (pode ter "+", "258", espaços, null, undefined).
 * @returns {string} O número de telefone limpo e validado para armazenamento.
 * @throws {Error} Se o número não for um formato válido de telefone de Moçambique.
 */
const cleanAndValidatePhoneForDB = (rawPhone) => {
    // Garantir que rawPhone é uma string antes de operar, e trim para remover espaços externos
    let cleaned = String(rawPhone || '').trim(); 

    if (cleaned.length === 0) {
        throw new Error("Número de telefone não pode ser vazio.");
    }
    
    // Permitir '+' apenas no início
    if (cleaned.startsWith('+')) {
        let digitsOnly = cleaned.substring(1).replace(/\D/g, ''); // Remove não-dígitos após o '+'
        if (!digitsOnly) { 
            throw new Error("Número de telefone inválido. '+' deve ser seguido por dígitos.");
        }
        cleaned = `+${digitsOnly}`;
    } else {
        cleaned = cleaned.replace(/\D/g, ''); // Remove todos os não-dígitos
    }

    // Agora, a lógica de validação do formato de Moçambique
    if (cleaned.startsWith('+258')) {
        const nineDigits = cleaned.substring(4); // Pega os dígitos após "+258"
        if (nineDigits.length !== 9 || !/^\d{9}$/.test(nineDigits)) {
            throw new Error('Número de telefone inválido. Após "+258" devem haver exatamente 9 dígitos numéricos.');
        }
        return cleaned; // Salva com o prefixo
    } else if (cleaned.length === 9) {
        if (!/^\d{9}$/.test(cleaned)) {
            throw new Error('Número de telefone inválido. Deve conter exatamente 9 dígitos numéricos.');
        }
        return cleaned; // Salva sem o prefixo
    } else {
        throw new Error('Número de telefone inválido. Use 9 dígitos (ex: 84XXXXXXX) ou o formato "+258XXXXXXXXX".');
    }
};

/**
 * Função auxiliar para gerar um array de possíveis formatos de um número de telefone
 * para usar em consultas (login, verificar existência), acomodando dados antigos e novos.
 * Esta função é para ser flexível na busca.
 * @param {string | null | undefined} rawPhone - O número de telefone como recebido.
 * @returns {string[]} Um array de strings com formatos de telefone para buscar no DB.
 * @throws {Error} Se o número não puder ser limpo para um formato base de 9 dígitos.
 */
const generatePhoneQueryArray = (rawPhone) => {
    // Garantir que rawPhone é uma string antes de operar, e trim para remover espaços externos
    let cleanedBasePhone = String(rawPhone || '').trim(); 
    let queryPossibilities = [];

    // Tenta extrair a base de 9 dígitos a partir de várias entradas
    let nineDigitsOnly = '';
    if (cleanedBasePhone.startsWith('258') && cleanedBasePhone.length >= 12) { // "258" + 9 dígitos
        nineDigitsOnly = cleanedBasePhone.substring(3);
    } else if (cleanedBasePhone.length === 9) { // Apenas 9 dígitos
        nineDigitsOnly = cleanedBasePhone;
    }

    if (nineDigitsOnly.length !== 9 || !/^\d{9}$/.test(nineDigitsOnly)) {
        // Se não conseguirmos uma base de 9 dígitos, o número é inválido para consulta
        throw new Error('Número de telefone inválido para pesquisa. Deve conter pelo menos 9 dígitos numéricos.');
    }

    // Adiciona as possibilidades baseadas nos 9 dígitos limpos
    queryPossibilities.push(nineDigitsOnly); // Ex: "841234567"
    queryPossibilities.push(`+258${nineDigitsOnly}`); // Ex: "+258841234567"
    
    // Remove duplicatas e retorna
    return [...new Set(queryPossibilities)];
};


// @desc    Cadastrar um novo usuário
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, username, phone: rawPhone, pin, invitedById } = req.body;

  if (!name || !username || !rawPhone || !pin) {
    res.status(400);
    throw new Error('Por favor, preencha todos os campos obrigatórios.');
  }

  let phone;
  try {
      phone = cleanAndValidatePhoneForDB(rawPhone); // Chama a função, que pode lançar erro
  } catch (error) {
      res.status(400);
      throw new Error(`Número de telefone inválido: ${error.message}`); // Garante que error.message é uma string
  }

  const usernameExists = await User.findOne({ username });
  if (usernameExists) {
    res.status(400);
    throw new Error('Este nome de usuário já está em uso. Por favor, escolha outro.');
  }
  
  let phoneExists;
  try {
      phoneExists = await User.findOne({ phone: { $in: generatePhoneQueryArray(rawPhone) } }); // Chama a função, que pode lançar erro
  } catch (error) {
      res.status(400);
      throw new Error(`Erro na validação do telefone: ${error.message}`); // Garante que error.message é uma string
  }

  if (phoneExists) {
    res.status(400);
    throw new Error('Este número de telefone já está em uso. Por favor, faça login ou use outro número.');
  }
  
  if (pin.length < 4 || pin.length > 6) {
    res.status(400);
    throw new Error('O PIN deve ter entre 4 e 6 dígitos.');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPin = await bcrypt.hash(pin, salt);

  let newUserId;
  let userExists = true;
  while (userExists) {
    newUserId = generateUniqueUserId().toString();
    userExists = await User.findOne({ userId: newUserId });
  }

  let invitedByUser = null;
  if (invitedById) {
      invitedByUser = await User.findOne({ userId: invitedById });
      if (!invitedByUser) {
          console.warn(`ID de convite ${invitedById} não encontrado. Registro continuará sem convidante.`);
      }
  }

  const user = await User.create({
    name,
    username,
    phone, // Salva o telefone padronizado (com ou sem "+258" conforme a entrada do admin)
    pin: hashedPin,
    userId: newUserId,
    invitedBy: invitedByUser ? invitedByUser._id : null,
    hasActivatedPlan: false,
  });
  
  const settings = await Settings.findOne({ configKey: "main_settings" });
  const welcomeBonusAmount = settings ? settings.welcomeBonus : 50;

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
    throw new Error('Dados de usuário inválidos. Por favor, tente novamente.');
  }
});

// @desc    Autenticar (login) um usuário
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { phone: rawPhone, pin } = req.body;
  if (!rawPhone || !pin) {
    res.status(400);
    throw new Error('Por favor, forneça o número de telefone e o PIN.');
  }

  let user;
  try {
      const phoneQueryArray = generatePhoneQueryArray(rawPhone); // Chama a função, que pode lançar erro
      user = await User.findOne({ phone: { $in: phoneQueryArray } });
  } catch (error) {
      res.status(400);
      throw new Error(`Número de telefone inválido para login: ${error.message}`); // Garante que error.message é uma string
  }

  if (user && (await bcrypt.compare(pin, user.pin))) {
    if (user.isBlocked) {
      res.status(403);
      throw new Error('Esta conta está bloqueada. Por favor, contacte o suporte.');
    }
    res.json({
      _id: user._id,
      userId: user.userId,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error('Telefone ou PIN inválido. Por favor, verifique suas credenciais.');
  }
});

// @desc    Obter perfil do usuário logado
// @route   GET /api/users/me
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-pin');
  if (!user) {
      res.status(404);
      throw new Error('Usuário não encontrado.');
  }
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

    const profitTypes = ['collection', 'commission', 'lottery_win'];

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
    if (!req.file) { res.status(400); throw new Error("Nenhuma imagem foi enviada. Por favor, selecione um arquivo."); }
    if (user) {
        user.profilePicture = req.file.path;
        await user.save();
        res.json({ message: "Foto de perfil atualizada com sucesso.", profilePictureUrl: user.profilePicture });
    } else { res.status(404); throw new Error("Usuário não encontrado. Por favor, faça login novamente."); }
});

// @desc    Criar uma requisição de depósito
// @route   POST /api/users/deposit
// @access  Private
const createDepositRequest = asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ configKey: "main_settings" });
    if (!settings) {
        res.status(500);
        throw new Error("Configurações do sistema não encontradas. Por favor, tente novamente mais tarde.");
    }
    
    const { amount, proofText } = req.body;
    const depositAmount = Number(amount);

    if (isNaN(depositAmount) || depositAmount <= 0) { 
        res.status(400); 
        throw new Error("O valor do depósito deve ser um número válido e maior que zero."); 
    }
    
    if (depositAmount < settings.depositMin || depositAmount > settings.depositMax) {
        res.status(400);
        throw new Error(`O valor do depósito deve estar entre ${settings.depositMin} MT e ${settings.depositMax} MT.`);
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
    } else if (proofText) {
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
    const settings = await Settings.findOne({ configKey: "main_settings" });
    if (!settings) {
        res.status(500);
        throw new Error("Configurações do sistema não encontradas. Por favor, tente novamente mais tarde.");
    }

    const { amount, paymentNumber: rawPaymentNumber, holderName, network } = req.body;
    const user = req.user;
    const withdrawalAmount = Number(amount);
    
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) { 
        res.status(400); 
        throw new Error("O valor do saque deve ser um número válido e maior que zero."); 
    }
    if (!rawPaymentNumber || !holderName || !network) {
        res.status(400); 
        throw new Error("Nome do titular, número para pagamento e rede são obrigatórios."); 
    }
    
    let paymentNumber;
    try {
        paymentNumber = cleanAndValidatePhoneForDB(rawPaymentNumber); // NOVO: Validação do número de pagamento
    } catch (error) {
        res.status(400);
        throw new Error(`Número de telefone inválido para saque: ${error.message}`);
    }


    if (withdrawalAmount < settings.withdrawalMin || withdrawalAmount > settings.withdrawalMax) {
        res.status(400);
        throw new Error(`O valor do saque deve estar entre ${settings.withdrawalMin} MT e ${settings.withdrawalMax} MT.`);
    }

    if (!user.activePlanInstance && !user.hasActivatedPlan) {
        res.status(403);
        throw new Error("Você precisa ter um plano ativo ou já ter ativado um plano anteriormente para poder sacar.");
    }

    if (!user.hasDeposited) { 
        res.status(403); 
        throw new Error("Você precisa ter um depósito aprovado para poder sacar."); 
    }
    
    const fee = (withdrawalAmount * settings.withdrawalFee) / 100;
    const totalDeducted = withdrawalAmount + fee;
    
    if (totalDeducted > user.walletBalance) { 
        res.status(400); 
        throw new Error(`Saldo insuficiente na carteira. Você precisa de ${totalDeducted.toFixed(2)} MT para sacar ${withdrawalAmount.toFixed(2)} MT (incluindo taxa de ${fee.toFixed(2)} MT).`); 
    }

    const withdrawalTransaction = await Transaction.create({
        user: user._id, 
        type: 'withdrawal', 
        amount: -withdrawalAmount,
        status: 'pending',
        description: `Requisição de saque de ${withdrawalAmount.toFixed(2)} MT para ${network}`,
        transactionDetails: { 
            destinationNumber: paymentNumber, // Salva o número padronizado
            holderName: holderName,
            network: network,
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
    const user = await User.findById(req.user._id).select('userId');
    if (!user) {
        res.status(404);
        throw new Error('Usuário não encontrado.');
    }

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
                description: { $regex: new RegExp(`do usuário ${referralUserId}`) } 
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

    const fullInviteLink = generateInviteLink(user.userId);

    res.json({
        inviteLink: fullInviteLink,
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
    const totalProfit = (summaryData.collection || 0) + (summaryData.commission || 0) + (summaryData.welcome_bonus || 0) + (summaryData.lottery_win || 0);

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

// @desc    Resgatar um código de sorteio
// @route   POST /api/users/lottery/redeem
// @access  Private
const redeemLotteryCode = asyncHandler(async (req, res) => {
    const { code } = req.body;
    const user = req.user;
    
    if (!code) {
        res.status(400);
        throw new Error('Por favor, forneça o código do sorteio.');
    }

    const lotteryCode = await LotteryCode.findOne({ code: code.toUpperCase() });

    if (!lotteryCode) {
        res.status(404);
        throw new Error('Código de sorteio inválido ou não encontrado.');
    }

    if (!lotteryCode.isActive || lotteryCode.expiresAt < new Date()) {
        res.status(400);
        throw new Error('Este código de sorteio está expirado ou inativo.');
    }

    if (lotteryCode.currentUses >= lotteryCode.maxUses) {
        res.status(400);
        throw new Error('Este código de sorteio já atingiu o limite máximo de usos.');
    }

    if (lotteryCode.claimedBy.includes(user._id)) {
        res.status(400);
        throw new Error('Você já resgatou este código de sorteio anteriormente.');
    }

    const userWithActivePlan = await User.findById(user._id).populate('activePlanInstance');
    if (!userWithActivePlan || !userWithActivePlan.activePlanInstance) {
        res.status(403);
        throw new Error('Você precisa ter um plano de investimento ativo para resgatar códigos de sorteio.');
    }

    const prizeAmount = Math.floor(Math.random() * (lotteryCode.valueMax - lotteryCode.valueMin + 1)) + lotteryCode.valueMin;

    user.walletBalance += prizeAmount;
    lotteryCode.currentUses += 1;
    lotteryCode.claimedBy.push(user._id);

    await user.save();
    await lotteryCode.save();

    await Transaction.create({
        user: user._id,
        type: 'lottery_win',
        amount: prizeAmount,
        status: 'approved',
        description: `Ganhos de sorteio com o código "${lotteryCode.code}"`,
        transactionDetails: {
            lotteryCode: lotteryCode.code,
            prizeValue: prizeAmount
        }
    });

    res.status(200).json({
        message: `Parabéns! Você ganhou ${prizeAmount.toFixed(2)} MT com o código "${code}"!`,
        prize: prizeAmount
    });
});


module.exports = {
  cleanAndValidatePhoneForDB, // Exportar para uso em outros controladores
  generatePhoneQueryArray, // Exportar para uso em outros controladores
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
  redeemLotteryCode,
};