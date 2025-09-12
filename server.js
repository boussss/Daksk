const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');

const config = require('./config');
const apiRoutes = require('./routes');
const { initializeSystem } = require('./systemControllers');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: config.frontendURL,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
});

app.set('io', io);

app.use(cors({ origin: config.frontendURL }));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ROTA ADICIONADA PARA HEALTH CHECK E BOAS-VINDAS
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'online',
        message: 'Bem-vindo à API do BrainSkill!'
    });
});

app.use('/api', apiRoutes);

require('./gamesocket')(io);
require('./lobbysocket')(io);
require('./chatsocket')(io);

const notFound = (req, res, next) => {
    const error = new Error(`Não encontrado - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    console.error(err.stack);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

app.use(notFound);
app.use(errorHandler);

mongoose.connect(config.mongoURI)
    .then(() => {
        console.log('MongoDB conectado com sucesso.');
        return initializeSystem();
    })
    .then(() => {
        const PORT = config.port;
        server.listen(PORT, () => {
            console.log(`Servidor BrainSkill a correr na porta ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Falha ao conectar ao MongoDB ou inicializar o sistema.', err);
        process.exit(1);
    });