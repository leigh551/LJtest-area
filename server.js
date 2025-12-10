const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const QUIZ_CODE = process.env.QUIZ_CODE || 'AOPARTY2025';
const HOST_PIN = process.env.HOST_PIN || 'AOHOST';
const MAX_PLAYERS = 100;
const PORT = process.env.PORT || 3000;

const questions = [
  {
    text: 'Which country gifted the Statue of Liberty to the United States?',
    options: ['Spain', 'France', 'Italy', 'Canada'],
    answer: 1
  },
  {
    text: 'What is the largest internal organ in the human body?',
    options: ['Liver', 'Lung', 'Kidney', 'Spleen'],
    answer: 0
  },
  {
    text: 'Which city famously has canals instead of many streets?',
    options: ['Copenhagen', 'Amsterdam', 'Prague', 'Vienna'],
    answer: 1
  },
  {
    text: 'Who developed the general theory of relativity?',
    options: ['Isaac Newton', 'Niels Bohr', 'Albert Einstein', 'Galileo Galilei'],
    answer: 2
  },
  {
    text: 'What is the smallest country in the world by land area?',
    options: ['Monaco', 'Vatican City', 'San Marino', 'Andorra'],
    answer: 1
  },
  {
    text: 'Which ocean current keeps Western Europe milder than similar latitudes?',
    options: ['Canary Current', 'Gulf Stream', 'Humboldt Current', 'Kuroshio Current'],
    answer: 1
  },
  {
    text: 'The novel \'1984\' was written by which author?',
    options: ['George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'Margaret Atwood'],
    answer: 0
  },
  {
    text: 'What is the chemical symbol for gold?',
    options: ['Ag', 'Au', 'Pb', 'Pt'],
    answer: 1
  },
  {
    text: 'Which planet has the most moons in our solar system?',
    options: ['Saturn', 'Jupiter', 'Neptune', 'Mars'],
    answer: 0
  },
  {
    text: 'What was the first element to be artificially produced?',
    options: ['Technetium', 'Plutonium', 'Promethium', 'Americium'],
    answer: 0
  }
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const players = new Map();
let phase = 'lobby';
let currentQuestionIndex = -1;
let revealAnswer = false;

function resetQuizState() {
  phase = 'lobby';
  currentQuestionIndex = -1;
  revealAnswer = false;
  players.clear();
}

function sanitizeName(rawName) {
  if (!rawName) return 'Guest';
  const trimmed = rawName.trim();
  return trimmed.length > 30 ? trimmed.slice(0, 30) : trimmed;
}

function isHost(pin) {
  return pin === HOST_PIN;
}

function getLeaderboard() {
  return Array.from(players.values())
    .map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function formatQuestion(question, includeAnswer = false) {
  if (!question) return null;
  return {
    text: question.text,
    options: question.options,
    answer: includeAnswer ? question.answer : undefined,
    number: currentQuestionIndex + 1,
    total: questions.length
  };
}

function broadcastState() {
  const includeAnswer = revealAnswer || phase === 'results';
  io.emit('state', {
    phase,
    code: QUIZ_CODE,
    questionIndex: currentQuestionIndex,
    question: formatQuestion(questions[currentQuestionIndex], includeAnswer),
    revealAnswer: includeAnswer,
    players: Array.from(players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      lastAnswer:
        currentQuestionIndex >= 0 ? player.answers[currentQuestionIndex] : undefined
    })),
    leaderboard: getLeaderboard(),
    questionsCount: questions.length,
    answers: includeAnswer
      ? questions.map((q, index) => ({
          number: index + 1,
          text: q.text,
          answer: q.options[q.answer]
        }))
      : undefined,
    maxPlayers: MAX_PLAYERS
  });
}

function gradeCurrentQuestion() {
  if (currentQuestionIndex < 0) return;
  players.forEach((player) => {
    const answer = player.answers[currentQuestionIndex];
    if (
      typeof answer === 'number' &&
      answer === questions[currentQuestionIndex].answer &&
      !player.graded.has(currentQuestionIndex)
    ) {
      player.score += 1;
      player.graded.add(currentQuestionIndex);
    }
  });
}

io.on('connection', (socket) => {
  socket.emit('state', {
    phase,
    code: QUIZ_CODE,
    questionIndex: currentQuestionIndex,
    question: formatQuestion(questions[currentQuestionIndex], revealAnswer),
    revealAnswer,
    leaderboard: getLeaderboard(),
    questionsCount: questions.length,
    maxPlayers: MAX_PLAYERS,
    players: Array.from(players.values())
  });

  socket.on('join', ({ name, code }) => {
    if (code !== QUIZ_CODE) {
      socket.emit('join-error', 'Incorrect event code.');
      return;
    }

    if (players.size >= MAX_PLAYERS) {
      socket.emit('join-error', 'The quiz is full.');
      return;
    }

    const cleanName = sanitizeName(name) || 'Guest';
    players.set(socket.id, {
      id: socket.id,
      name: cleanName,
      score: 0,
      answers: {},
      graded: new Set()
    });

    socket.emit('joined', { name: cleanName, code: QUIZ_CODE });
    broadcastState();
  });

  socket.on('answer', (optionIndex) => {
    const player = players.get(socket.id);
    if (!player || phase !== 'question' || currentQuestionIndex < 0) return;

    player.answers[currentQuestionIndex] = optionIndex;
    broadcastState();
  });

  socket.on('host-start', (pin) => {
    if (!isHost(pin) || phase !== 'lobby') return;

    phase = 'question';
    currentQuestionIndex = 0;
    revealAnswer = false;
    players.forEach((player) => {
      player.answers = {};
      player.graded = new Set();
      player.score = 0;
    });
    broadcastState();
  });

  socket.on('host-reveal', (pin) => {
    if (!isHost(pin) || phase !== 'question' || currentQuestionIndex < 0) return;

    gradeCurrentQuestion();
    revealAnswer = true;
    broadcastState();
  });

  socket.on('host-next', (pin) => {
    if (!isHost(pin) || phase !== 'question') return;

    if (currentQuestionIndex + 1 < questions.length) {
      currentQuestionIndex += 1;
      revealAnswer = false;
      broadcastState();
    } else {
      phase = 'results';
      revealAnswer = true;
      broadcastState();
    }
  });

  socket.on('disconnect', () => {
    if (players.has(socket.id)) {
      players.delete(socket.id);
      broadcastState();
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`A&O Christmas quiz running at http://localhost:${PORT}`);
  console.log(`Players can join with event code: ${QUIZ_CODE}`);
  console.log(`Host controls secured with pin: ${HOST_PIN}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
