const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));

const usuarios = {}; // { usuario: { senha, carteira } }
const jogadoresConectados = {}; // socket.id → usuario
const salas = {};

io.on('connection', socket => {
  console.log('Novo cliente conectado:', socket.id);

  socket.on('login', ({ user, senha }) => {
    if (!user || !senha) {
      socket.emit('loginErro', 'Usuário e senha obrigatórios');
      return;
    }

    if (!usuarios[user]) {
      usuarios[user] = { senha, carteira: 100 };
    } else if (usuarios[user].senha !== senha) {
      socket.emit('loginErro', 'Senha incorreta');
      return;
    }

    jogadoresConectados[socket.id] = user;
    socket.usuario = user;
    socket.emit('loginSucesso', { user, carteira: usuarios[user].carteira });
    atualizarSalas();
  });

  socket.on('criarSala', ({ nome, valor }) => {
    const usuario = jogadoresConectados[socket.id];
    const valorAposta = parseInt(valor);

    if (!usuario) {
      socket.emit('erro', 'Faça login primeiro');
      return;
    }

    if (usuarios[usuario].carteira < valorAposta) {
      socket.emit('erro', 'Saldo insuficiente na carteira');
      return;
    }

    if (salas[nome]) {
      socket.emit('erro', 'Sala já existe');
      return;
    }

    usuarios[usuario].carteira -= valorAposta;

    salas[nome] = {
      nome,
      valor: valorAposta,
      jogadores: { [socket.id]: 1 },
      usuarios: { 1: usuario },
      pontos: { 1: 30 },
      apostas: {},
      rodada: 1,
      resultados: { 1: 0, 2: 0 }
    };

    socket.join(nome);
    socket.emit('salaEntrou', { nome, jogadorNum: 1, valorAposta });
    atualizarCarteira(usuario);
    atualizarSalas();
  });

  socket.on('entrarSala', nome => {
    const sala = salas[nome];
    const usuario = jogadoresConectados[socket.id];

    if (!sala) {
      socket.emit('erro', 'Sala não existe');
      return;
    }

    if (Object.keys(sala.jogadores).length >= 2) {
      socket.emit('erro', 'Sala cheia');
      return;
    }

    if (usuarios[usuario].carteira < sala.valor) {
      socket.emit('erro', 'Saldo insuficiente na carteira');
      return;
    }

    usuarios[usuario].carteira -= sala.valor;

    const jogadorNum = 2;
    sala.jogadores[socket.id] = jogadorNum;
    sala.usuarios[jogadorNum] = usuario;
    sala.pontos[jogadorNum] = 30;

    clearInterval(sala.countdownInterval);
    sala.tempoRestante = null;

    socket.join(nome);

    io.to(nome).emit('iniciarJogo', {
      nome,
      valorAposta: sala.valor,
      jogadores: sala.usuarios
    });

    atualizarCarteira(usuario);
    atualizarSalas();
  });

  socket.on('cancelarSala', nome => {
  const sala = salas[nome];
  const usuario = jogadoresConectados[socket.id];

  if (sala && sala.usuarios[1] === usuario && Object.keys(sala.jogadores).length === 1) {
    clearInterval(sala.countdownInterval);
    usuarios[usuario].carteira += sala.valor;
    io.to(nome).emit('salaCancelada', 'Sala cancelada. Valor devolvido.');
    delete salas[nome];
    atualizarCarteira(usuario);
    atualizarSalas();
  }
  });

  socket.on('apostar', ({ sala, valor }) => {
    const salaAtual = salas[sala];
    if (!salaAtual) return;

    const jogadorNum = salaAtual.jogadores[socket.id];
    if (!jogadorNum) return;

    const pontosDisponiveis = salaAtual.pontos[jogadorNum];
    if (valor < 0 || valor > pontosDisponiveis) {
      socket.emit('erro', 'Aposta inválida');
      return;
    }

    salaAtual.apostas[jogadorNum] = valor;
    salaAtual.pontos[jogadorNum] -= valor;

    if (Object.keys(salaAtual.apostas).length === 2) {
      const a1 = salaAtual.apostas[1];
      const a2 = salaAtual.apostas[2];
      let resultado = '';
      const valorPorRodada = salaAtual.valor / 3;

      if (a1 > a2) {
        resultado = `Jogador 1 venceu a rodada! (+R$${valorPorRodada})`;
        salaAtual.resultados[1] += valorPorRodada;
      } else if (a2 > a1) {
        resultado = `Jogador 2 venceu a rodada! (+R$${valorPorRodada})`;
        salaAtual.resultados[2] += valorPorRodada;
      } else {
        resultado = `Empate! Cada um recebe R$${valorPorRodada / 2}`;
        salaAtual.resultados[1] += valorPorRodada / 2;
        salaAtual.resultados[2] += valorPorRodada / 2;
      }

      io.to(sala).emit('resultadoRodada', {
        rodada: salaAtual.rodada,
        apostas: { 1: a1, 2: a2 },
        resultado,
        pontos: salaAtual.pontos
      });

      salaAtual.apostas = {};
      salaAtual.rodada++;

      if (salaAtual.rodada > 3) {
        finalizarJogo(sala);
      }
    }
  });

  socket.on('listarSalas', () => {
    atualizarSalas();
  });

  socket.on('disconnect', () => {
    const usuario = jogadoresConectados[socket.id];
    delete jogadoresConectados[socket.id];

    for (const nome in salas) {
      const sala = salas[nome];
      if (sala.jogadores[socket.id]) {
        delete sala.jogadores[socket.id];
        delete sala.usuarios[sala.jogadores[socket.id]];
        if (Object.keys(sala.jogadores).length === 0) {
          delete salas[nome];
        }
      }
    }
    atualizarSalas();
    if (usuario) atualizarCarteira(usuario);
  });

  function finalizarJogo(nome) {
    const sala = salas[nome];
    if (!sala) return;

    const ganhos = sala.resultados;
    const jogador1 = sala.usuarios[1];
    const jogador2 = sala.usuarios[2];

    usuarios[jogador1].carteira += ganhos[1];
    usuarios[jogador2].carteira += ganhos[2];

    io.to(nome).emit('fimJogo', {
      resultados: ganhos,
      jogadores: { 1: jogador1, 2: jogador2 }
    });

    atualizarCarteira(jogador1);
    atualizarCarteira(jogador2);

    delete salas[nome];
    atualizarSalas();
  }

  function atualizarSalas() {
    io.emit('salasAtivas', Object.values(salas).map(s => ({
      nome: s.nome,
      valor: s.valor,
      jogadores: Object.values(s.usuarios)
    })));
  }

  function atualizarCarteira(usuario) {
    for (const [id, user] of Object.entries(jogadoresConectados)) {
      if (user === usuario) {
        io.to(id).emit('carteiraAtualizada', usuarios[usuario].carteira);
      }
    }
  }
  
  socket.on('erro', msg => {
  alert(`Erro: ${msg}`);
  });

});


http.listen(3000, () => {
  console.log('Servidor rodando em http://localhost:3000');
});
