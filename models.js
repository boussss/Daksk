// models.js
const mongoose = require('mongoose');

// --- ESQUEMA DO USUÁRIO ---
const UserSchema = new mongoose.Schema({
  // Nota: Armazenar PIN em texto puro não é seguro.
  // Esta implementação segue o requisito específico do projeto.
  pin: {
    type: String,
    required: true,
    minlength: 4,
    maxlength: 6,
  },
  userId: { // ID único de 5 dígitos para o usuário
    type: String,
    required: true,
    unique: true,
    minlength: 5,
    maxlength: 5,
  },
  profilePicture: {
    type: String,
    default: 'URL_DO_ICONE_DE_USUARIO_PADRAO', // Vamos substituir isso depois por um link real
  },
  walletBalance: { // Saldo real que pode ser sacado
    type: Number,
    default: 0,
  },
  bonusBalance: { // Saldo de bônus, não pode ser sacado diretamente
    type: Number,
    default: 0,
  },
  inviteLink: {
    type: String,
  },
  invitedBy: { // ID do usuário que o convidou
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  activePlanInstance: { // Referência para a instância do plano ativo do usuário
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlanInstance',
    default: null,
  },
  hasDeposited: { // Controla se o usuário já fez pelo menos um depósito
    type: Boolean,
    default: false,
  },
  isBlocked: { // Controlado pelo Admin
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// --- ESQUEMA DO PLANO (MODELO CRIADO PELO ADMIN) ---
const PlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  minAmount: {
    type: Number,
    required: true,
  },
  maxAmount: {
    type: Number,
    required: true,
  },
  dailyYieldType: { // O rendimento é 'percentage' ou 'fixed'?
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  dailyYieldValue: { // O valor do rendimento (ex: 5 para 5% ou 25 para 25MT)
    type: Number,
    required: true,
  },
  durationDays: { // Duração do plano em dias
    type: Number,
    required: true,
  },
  imageUrl: { // URL da imagem do plano (ex: cooler animado)
    type: String,
    default: '',
  },
});

// --- ESQUEMA DA INSTÂNCIA DO PLANO (PLANO ATIVO DE UM USUÁRIO) ---
const PlanInstanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  plan: { // O modelo do plano que foi comprado
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true,
  },
  investedAmount: { // O valor exato que o usuário investiu
    type: Number,
    required: true,
  },
  dailyProfit: { // O lucro diário calculado para este investimento
    type: Number,
    required: true,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: { // Data de expiração do plano
    type: Date,
    required: true,
  },
  lastCollectedDate: { // Controla a última data de coleta para o ciclo de 24h
    type: Date,
  },
  totalCollected: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'expired'],
    default: 'active',
  },
});


// --- ESQUEMA DE TRANSAÇÕES ---
const TransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'investment', 'collection', 'commission', 'welcome_bonus'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved', // 'pending' será usado para depósitos e saques
  },
  description: String,
  transactionDetails: { // Para armazenar dados como o número M-Pesa ou URL do comprovante
    type: Object,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// --- ESQUEMA DO ADMIN ---
const AdminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});

// --- ESQUEMA DE BANNERS ---
const BannerSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true,
  },
  linkUrl: { // URL opcional para onde o banner aponta
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});


// Exportando todos os modelos
const User = mongoose.model('User', UserSchema);
const Plan = mongoose.model('Plan', PlanSchema);
const PlanInstance = mongoose.model('PlanInstance', PlanInstanceSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Banner = mongoose.model('Banner', BannerSchema);

module.exports = { User, Plan, PlanInstance, Transaction, Admin, Banner };