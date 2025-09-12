const mongoose = require('mongoose');
const { LobbyBet, User, SystemSettings, Game } = require('./models');
const { generateGameCode } = require('./utils');
const { GameLogic } = require('./gameController');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

exports.getLobbyBets = asyncHandler(async (req, res) => {
    const bets = await LobbyBet.find({})
        .populate('creator', 'username avatar rank points')
        .sort({ createdAt: -1 });
    res.status(200).json(bets);
});

exports.createLobbyBet = asyncHandler(async (req, res) => {
    const { amount, description } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    const settings = await SystemSettings.findOne({ key: 'globalSettings' });

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'O valor da aposta é inválido.' });
    }
    if (parsedAmount > settings.maxBet) {
        return res.status(400).json({ message: `O valor máximo para aposta é de ${settings.maxBet} MT.` });
    }
    if (user.balance < parsedAmount) {
        return res.status(400).json({ message: 'Saldo insuficiente para criar esta aposta.' });
    }

    const newBet = await LobbyBet.create({
        creator: userId,
        amount: parsedAmount,
        description
    });
    
    const populatedBet = await LobbyBet.findById(newBet._id).populate('creator', 'username avatar rank points');
    
    req.app.get('io').of('/lobby').emit('newBet', populatedBet);

    res.status(201).json({ message: 'Aposta criada com sucesso e visível no lobby.', bet: populatedBet });
});

exports.createPrivateGame = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    const user = await User.findById(req.user._id);
    const settings = await SystemSettings.findOne({ key: 'globalSettings' });

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'O valor da aposta é inválido.' });
    }
    if (parsedAmount > settings.maxBet) {
        return res.status(400).json({ message: `O valor máximo para aposta é de ${settings.maxBet} MT.` });
    }
    if (user.balance < parsedAmount) {
        return res.status(400).json({ message: 'Saldo insuficiente para criar esta aposta.' });
    }

    let gameCode;
    let isCodeUnique = false;
    while(!isCodeUnique) {
        gameCode = generateGameCode();
        const existingGame = await Game.findOne({ gameCode, status: 'waiting' });
        if(!existingGame) {
            isCodeUnique = true;
        }
    }
    
    const game = await Game.create({
        player1: user._id,
        betAmount: parsedAmount,
        isPrivate: true,
        gameCode,
        status: 'waiting',
        boardState: GameLogic.getInitialBoard(),
        turn: user._id // Temporário, será definido quando o jogo começar
    });

    res.status(201).json({ message: 'Jogo privado criado. Partilhe o código para o seu oponente entrar.', gameCode, gameId: game._id });
});

exports.joinPrivateGame = asyncHandler(async (req, res) => {
    const { gameCode } = req.body;
    const joiningUser = await User.findById(req.user._id);

    const game = await Game.findOne({ gameCode, status: 'waiting' });

    if (!game) {
        return res.status(404).json({ message: 'Jogo privado não encontrado ou já iniciado.' });
    }
    if (game.player1.toString() === joiningUser._id.toString()) {
        return res.status(400).json({ message: 'Você não pode entrar no seu próprio jogo.' });
    }
    if (joiningUser.balance < game.betAmount) {
        return res.status(400).json({ message: 'Saldo insuficiente para entrar nesta aposta.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const player1 = await User.findById(game.player1).session(session);
        
        player1.balance -= game.betAmount;
        joiningUser.balance -= game.betAmount;

        if (player1.balance < 0 || joiningUser.balance < 0) {
            throw new Error('Saldo insuficiente detectado durante a transação.');
        }

        await player1.save({ session });
        await joiningUser.save({ session });
        
        game.player2 = joiningUser._id;
        game.status = 'in-progress';
        game.turn = game.player1; // Jogador 1 sempre começa
        await game.save({ session });
        
        await session.commitTransaction();
        
        res.status(200).json({ message: 'Entrou no jogo com sucesso! A partida vai começar.', gameId: game._id });
    } catch(error) {
        await session.abortTransaction();
        res.status(500).json({ message: 'Não foi possível entrar no jogo. Por favor, tente novamente.' });
    } finally {
        session.endSession();
    }
});