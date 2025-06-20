const socket = io();

let usuario = '';
let salaAtual = '';
let pontos = 30;

function mostrar(tela) {
  document.querySelectorAll('.tela').forEach(t => (t.style.display = 'none'));
  document.getElementById(tela).style.display = 'flex';
}

function login() {
  const user = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value.trim();
  if (!user || !senha) {
    alert('Digite usuário e senha');
    return;
  }
  socket.emit('login', { user, senha });
}

socket.on('loginSucesso', dados => {
  usuario = dados.user;
  document.getElementById('carteira').innerText = dados.carteira;
  mostrar('menu');
});

socket.on('loginErro', msg => {
  document.getElementById('statusLogin').innerText = msg;
});

function criarSala() {
  const nome = document.getElementById('nomeSala').value.trim();
  const valor = parseInt(document.getElementById('valorSala').value);
  if (!nome) {
    alert('Digite um nome para a sala');
    return;
  }
  if (!valor || valor <= 0) {
    alert('Digite um valor válido para a aposta');
    return;
  }
  socket.emit('criarSala', { nome, valor });
}

function entrarSala(nome) {
  socket.emit('entrarSala', nome);
  mostrar('jogo');

}

socket.on('salasAtivas', salas => {
  const lista = document.getElementById('listaSalas');
  lista.innerHTML = '';
  salas.forEach(s => {
    const li = document.createElement('li');
    li.innerText = `${s.nome} - R$${s.valor}`;
    li.onclick = () => entrarSala(s.nome);
    lista.appendChild(li);
  });
});

socket.on('salaEntrou', dados => {
  salaAtual = dados.nome;
  pontos = 30;
  document.getElementById('nomeSalaAtual').innerText = salaAtual;
  document.getElementById('pontos').innerText = pontos;
  document.getElementById('historico').innerText = '';
  document.getElementById('statusRodada').innerText = '';
  mostrar('jogo');
});

function apostar() {
  const valor = parseInt(document.getElementById('aposta').value);
  if (isNaN(valor) || valor <= 0) {
    alert('Digite um valor válido para apostar');
    return;
  }
  if (valor > pontos) {
    alert('Você não tem pontos suficientes');
    return;
  }
  document.getElementById('botaoApostar').disabled = true;
  socket.emit('apostar', { sala: salaAtual, valor });
}

socket.on('resultadoRodada', dados => {
  const jogadorNum = dados.apostas[1] !== undefined && dados.apostas[2] !== undefined ? (dados.apostas[1] === undefined ? 2 : 1) : 1; // fallback
  pontos -= dados.apostas[jogadorNum];
  document.getElementById('pontos').innerText = pontos;
  const hist = document.getElementById('historico');
  hist.innerHTML += `<p>Rodada ${dados.rodada}: Jogador 1 apostou ${dados.apostas[1]}, Jogador 2 apostou ${dados.apostas[2]}. ${dados.resultado}</p>`;
  document.getElementById('statusRodada').innerText = dados.resultado;
  document.getElementById('botaoApostar').disabled = false;
});

socket.on('carteiraAtualizada', valor => {
  document.getElementById('carteira').innerText = valor;
});

socket.on('fimJogo', dados => {
  alert(`Fim de jogo!\nResultado:\nJogador 1 (${dados.jogadores[1]}): R$${dados.resultados[1]}\nJogador 2 (${dados.jogadores[2]}): R$${dados.resultados[2]}`);
  mostrar('menu');
});

setInterval(() => {
  socket.emit('listarSalas');
}, 3000);

mostrar('login');
