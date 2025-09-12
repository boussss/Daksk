// userController.js
const asyncHandler = require('express-async-handler');
const { User, Transaction, Banner } = require('./models');
const { generateToken } = require('./auth');
const { generateUniqueUserId, generateInviteLink } = require('./utils');

const registerUser = asyncHandler(async (req, res) => {
  const { pin, invitedById } = req.body;
  if (!pin || pin.length < 4 || pin.length > 6) { res.status(400); throw new Error('O PIN deve ter entre 4 e 6 dígitos.'); }
  let newUserId;
  let userExists = true;
  while (userExists) { newUserId = generateUniqueUserId().toString(); userExists = await User.findOne({ userId: newUserId }); }
  let invitedByUser = null;
  if (invitedById) { invitedByUser = await User.findOne({ userId: invitedById }); }
  const user = await User.create({ pin, userId: newUserId, invitedBy: invitedByUser ? invitedByUser._id : null });
  user.inviteLink = generateInviteLink(user.userId);
  const welcomeBonusAmount = 50;
  user.bonusBalance += welcomeBonusAmount;
  await user.save();
  await Transaction.create({ user: user._id, type: 'welcome_bonus', amount: welcomeBonusAmount, status: 'approved', description: 'Bônus de boas-vindas' });
  if (user) { res.status(201).json({ _id: user._id, userId: user.userId, token: generateToken(user._id) }); } 
  else { res.status(400); throw new Error('Dados de usuário inválidos.'); }
});

const loginUser = asyncHandler(async (req, res) => {
  const { pin } = req.body;
  if (!pin) { res.status(400); throw new Error('Por favor, forneça o PIN.'); }
  const user = await User.findOne({ pin });
  if (user) {
    if (user.isBlocked) { res.status(403); throw new Error('Esta conta está bloqueada.'); }
    res.json({ _id: user._id, userId: user.userId, token: generateToken(user._id) });
  } else { res.status(401); throw new Error('PIN inválido.'); }
});

const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-pin');
  res.json(user);
});

const getDashboardData = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('-pin').populate({ path: 'activePlanInstance', populate: { path: 'plan', model: 'Plan' } });
    if (!user) { res.status(404); throw new Error('Usuário não encontrado.'); }
    let canCollect = false;
    if (user.activePlanInstance) {
        const instance = user.activePlanInstance;
        if (!instance.lastCollectedDate) { canCollect = true; } 
        else { const nextCollectionTime = new Date(instance.lastCollectedDate).getTime() + (24 * 60 * 60 * 1000); if (Date.now() >= nextCollectionTime) { canCollect = true; } }
    }
    const banners = await Banner.find({ isActive: true });
    res.json({ user, banners, canCollect });
});

const uploadProfilePicture = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!req.file) { res.status(400); throw new Error("Nenhuma imagem foi enviada."); }
    if (user) {
        user.profilePicture = req.file.path;
        await user.save();
        res.json({ message: "Foto de perfil atualizada com sucesso.", profilePictureUrl: user.profilePicture });
    } else { res.status(404); throw new Error("Usuário não encontrado."); }
});

const createDepositRequest = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) { res.status(400); throw new Error("O valor do depósito deve ser maior que zero."); }
    if (!req.file) { res.status(400); throw new Error("O comprovativo de depósito é obrigatório."); }
    const depositTransaction = await Transaction.create({ user: req.user._id, type: 'deposit', amount: Number(amount), status: 'pending', description: `Requisição de depósito de ${amount} MT`, transactionDetails: { proofImageUrl: req.file.path } });
    res.status(201).json({ message: "Requisição de depósito enviada com sucesso. Aguardando aprovação.", transaction: depositTransaction });
});

const createWithdrawalRequest = asyncHandler(async (req, res) => {
    const { amount, paymentNumber } = req.body;
    const user = req.user;
    if (!user.hasDeposited) { res.status(403); throw new Error("Você precisa ter um depósito aprovado para poder sacar."); }
    if (!amount || !paymentNumber) { res.status(400); throw new Error("Valor e número para pagamento são obrigatórios."); }
    if (Number(amount) > user.walletBalance) { res.status(400); throw new Error("Saldo insuficiente."); }
    const withdrawalTransaction = await Transaction.create({ user: user._id, type: 'withdrawal', amount: Number(amount), status: 'pending', description: `Requisição de saque de ${amount} MT`, transactionDetails: { destinationNumber: paymentNumber } });
    res.status(201).json({ message: "Requisição de saque enviada com sucesso. Aguardando aprovação.", transaction: withdrawalTransaction });
});

const getUserTransactions = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(transactions);
});

const getReferralData = asyncHandler(async (req, res) => {
    const referrals = await User.find({ invitedBy: req.user._id }).select('userId createdAt activePlanInstance');
    res.json({
        inviteLink: req.user.inviteLink,
        referralCount: referrals.length,
        referralsList: referrals.map(ref => ({ userId: ref.userId, joinDate: ref.createdAt, isActive: !!ref.activePlanInstance })),
    });
});

const functionsToExport = {
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

// --- CÓDIGO DE DIAGNÓSTICO ---
console.log('--- DIAGNÓSTICO: userController.js foi carregado ---');
console.log('--- DIAGNÓSTICO: Funções sendo exportadas:', Object.keys(functionsToExport));
// ------------------------------

module.exports = functionsToExport;