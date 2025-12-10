const socket = io();

const joinForm = document.getElementById('join-form');
const nameInput = document.getElementById('name-input');
const codeInput = document.getElementById('code-input');
const joinHint = document.getElementById('join-hint');
const eventCode = document.getElementById('event-code');
const phaseIndicator = document.getElementById('phase-indicator');
const questionArea = document.getElementById('question-area');
const leaderboardList = document.getElementById('leaderboard');
const playerCount = document.getElementById('player-count');
const hostPinInput = document.getElementById('host-pin');

const startBtn = document.getElementById('start-btn');
const revealBtn = document.getElementById('reveal-btn');
const nextBtn = document.getElementById('next-btn');

let currentQuestionIndex = -1;
let lastSubmitted = null;
let maxPlayers = 100;
let answers = [];

socket.on('state', (state) => {
  eventCode.textContent = state.code || '----';
  maxPlayers = state.maxPlayers || 100;

  if (state.questionIndex !== currentQuestionIndex) {
    currentQuestionIndex = state.questionIndex;
    lastSubmitted = null;
  }

  updatePhase(state);
  updateQuestion(state);
  updateLeaderboard(state);
});

socket.on('joined', ({ name, code }) => {
  joinHint.textContent = `${name}, you are in! Quiz code ${code}.`;
  joinHint.classList.add('success');
  joinHint.classList.remove('error');
});

socket.on('join-error', (message) => {
  joinHint.textContent = message;
  joinHint.classList.add('error');
  joinHint.classList.remove('success');
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim() || 'Guest';
  const code = codeInput.value.trim();
  socket.emit('join', { name, code });
});

startBtn.addEventListener('click', () => {
  socket.emit('host-start', hostPinInput.value.trim());
});

revealBtn.addEventListener('click', () => {
  socket.emit('host-reveal', hostPinInput.value.trim());
});

nextBtn.addEventListener('click', () => {
  socket.emit('host-next', hostPinInput.value.trim());
});

function updatePhase(state) {
  const { phase, questionIndex, questionsCount } = state;
  if (phase === 'lobby') {
    phaseIndicator.textContent = 'In the lobby – waiting for host to start';
  } else if (phase === 'question') {
    phaseIndicator.textContent = `Question ${questionIndex + 1} of ${questionsCount}`;
  } else if (phase === 'results') {
    phaseIndicator.textContent = 'Quiz finished – winners revealed!';
  }
}

function updateQuestion(state) {
  questionArea.innerHTML = '';
  answers = state.answers || [];

  if (state.phase === 'lobby') {
    questionArea.innerHTML = '<p class="empty">Waiting to start.</p>';
    return;
  }

  if (state.phase === 'results') {
    renderResults(state);
    return;
  }

  const question = state.question;
  if (!question) {
    questionArea.innerHTML = '<p class="empty">Waiting for the next question.</p>';
    return;
  }

  const title = document.createElement('h3');
  title.textContent = `${question.number}. ${question.text}`;
  questionArea.appendChild(title);

  const optionsList = document.createElement('div');
  optionsList.className = 'options';
  question.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.textContent = option;
    button.className = 'option';

    if (state.revealAnswer && index === question.answer) {
      button.classList.add('correct');
    }

    if (lastSubmitted === index) {
      button.classList.add('selected');
    }

    button.disabled = state.revealAnswer;

    button.addEventListener('click', () => {
      lastSubmitted = index;
      socket.emit('answer', index);
      highlightSelection(optionsList, index);
    });

    optionsList.appendChild(button);
  });

  questionArea.appendChild(optionsList);

  if (state.revealAnswer) {
    const reveal = document.createElement('p');
    reveal.className = 'reveal';
    reveal.textContent = `Correct answer: ${question.options[question.answer]}`;
    questionArea.appendChild(reveal);
  }
}

function renderResults(state) {
  const winners = state.leaderboard.filter((entry, index) => index === 0);
  const highestScore = winners[0]?.score ?? 0;
  const jointWinners = state.leaderboard.filter((entry) => entry.score === highestScore);

  const title = document.createElement('h3');
  title.textContent = 'Quiz complete!';

  const winnerNames = jointWinners.map((entry) => entry.name).join(', ');
  const summary = document.createElement('p');
  summary.textContent = `Winner${jointWinners.length > 1 ? 's' : ''}: ${winnerNames} (${highestScore} point${
    highestScore === 1 ? '' : 's'
  })`;

  const answerList = document.createElement('ol');
  answerList.className = 'answer-list';
  answers.forEach((answer) => {
    const item = document.createElement('li');
    item.innerHTML = `<strong>Q${answer.number}:</strong> ${answer.text} <span>${answer.answer}</span>`;
    answerList.appendChild(item);
  });

  questionArea.appendChild(title);
  questionArea.appendChild(summary);
  questionArea.appendChild(answerList);
}

function updateLeaderboard(state) {
  leaderboardList.innerHTML = '';
  const leaderboard = state.leaderboard || [];
  const count = state.players?.length || 0;
  playerCount.textContent = `${count}/${maxPlayers} players connected`;

  leaderboard.forEach((entry, index) => {
    const item = document.createElement('li');
    item.innerHTML = `<span>${index + 1}. ${entry.name}</span><span class="score">${entry.score}</span>`;
    leaderboardList.appendChild(item);
  });
}

function highlightSelection(optionsList, selectedIndex) {
  Array.from(optionsList.children).forEach((button, index) => {
    if (index === selectedIndex) {
      button.classList.add('selected');
    } else {
      button.classList.remove('selected');
    }
  });
}
