import "./style.css";

const PLAYERS = {
  RED: 0,
  BLUE: 1,
};

const PLAYER_NAMES = {
  [PLAYERS.RED]: "红方",
  [PLAYERS.BLUE]: "蓝方",
};

const PLAYER_COLORS = {
  [PLAYERS.RED]: "red",
  [PLAYERS.BLUE]: "blue",
};

const DEFAULT_SIZE = 8;

const boardElement = document.querySelector("#board");
const turnLabelElement = document.querySelector("#turn-label");
const redScoreElement = document.querySelector("#red-score");
const blueScoreElement = document.querySelector("#blue-score");
const messageElement = document.querySelector("#message");
const restartButton = document.querySelector("#restart-button");
const boardSizeSelect = document.querySelector("#board-size");

const state = {
  size: DEFAULT_SIZE,
  board: [],
  currentPlayer: PLAYERS.RED,
  moveCount: 0,
  gameOver: false,
};

/**
 * 创建一个指定大小的空棋盘。
 * 每个格子包含数字 value 和所属玩家 owner。
 */
function createBoard(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const rowNumber = row + 1;
      const colNumber = col + 1;

      const owner =
        (rowNumber + colNumber) % 2 === 0
          ? PLAYERS.RED
          : PLAYERS.BLUE;

      return {
        value: 1,
        owner,
      };
    }),
  );
}

/**
 * 获取一个格子的四连通邻居。
 * 角落返回 2 个，边缘返回 3 个，中间返回 4 个。
 */
function getNeighbors(row, col) {
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  return directions
    .map(([rowOffset, colOffset]) => [
      row + rowOffset,
      col + colOffset,
    ])
    .filter(
      ([neighborRow, neighborCol]) =>
        neighborRow >= 0 &&
        neighborRow < state.size &&
        neighborCol >= 0 &&
        neighborCol < state.size,
    );
}

/**
 * 一个格子的爆炸临界值就是它的四连通邻居数量。
 */
function getThreshold(row, col) {
  return getNeighbors(row, col).length;
}

/**
 * 判断一个格子当前是否可以被指定玩家点击。
 * 空格可以点击，自己的格子可以点击，对手格子不能点击。
 */
function canPlayCell(row, col, player) {
  const cell = state.board[row][col];
  return cell.owner === null || cell.owner === player;
}

/**
 * 执行一次落子，并处理整个连锁反应。
 */
function play(row, col) {
  if (state.gameOver) {
    return;
  }

  if (!canPlayCell(row, col, state.currentPlayer)) {
    setMessage("不能点击对手已经占领的格子。", false);
    return;
  }

  const player = state.currentPlayer;
  const cell = state.board[row][col];

  cell.value += 1;
  cell.owner = player;

  state.moveCount += 1;

  resolveExplosions(row, col, player);

  const winner = getWinner();
  if (winner !== null) {
    state.gameOver = true;
    render();
    setMessage(`${PLAYER_NAMES[winner]}获胜！点击“重新开始”再玩一局。`, true);
    return;
  }

  state.currentPlayer =
    state.currentPlayer === PLAYERS.RED ? PLAYERS.BLUE : PLAYERS.RED;

  render();
}

/**
 * 处理连锁爆炸。
 *
 * 使用队列而不是递归：
 * 1. 先把刚刚点击的格子放入队列；
 * 2. 如果格子超过临界值，就爆炸；
 * 3. 爆炸产生的邻居继续进入队列；
 * 4. 直到所有格子都稳定为止。
 */
function resolveExplosions(startRow, startCol, player) {
  const queue = [[startRow, startCol]];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const [row, col] = queue[queueIndex];
    queueIndex += 1;

    const cell = state.board[row][col];
    const neighbors = getNeighbors(row, col);
    const threshold = neighbors.length;

    // 用户定义的规则是“数字 > 临界值”时爆炸。
    if (cell.value <= threshold) {
      continue;
    }

    // 记录本次爆炸的归属者。
    // 由于点击和连锁传递都会设置 owner，这里通常就是当前玩家。
    const explosionOwner = cell.owner ?? player;

    // 当前格子减少它的临界值。
    cell.value -= threshold;

    // 如果减少后为 0，则该格子暂时变为空格。
    if (cell.value === 0) {
      cell.owner = null;
    }

    // 向上下左右的邻居各增加 1，并转移占领权。
    for (const [neighborRow, neighborCol] of neighbors) {
      const neighbor = state.board[neighborRow][neighborCol];

      neighbor.value += 1;
      neighbor.owner = explosionOwner;

      const neighborThreshold = getThreshold(
        neighborRow,
        neighborCol,
      );

      if (neighbor.value > neighborThreshold) {
        queue.push([neighborRow, neighborCol]);
      }
    }

    // 如果当前格子减少后仍然超过临界值，继续处理它。
    if (cell.value > threshold) {
      queue.push([row, col]);
    }
  }
}

/**
 * 统计每位玩家占领了多少个格子。
 */
function getScore() {
  const score = [0, 0];

  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner === PLAYERS.RED) {
        score[PLAYERS.RED] += 1;
      }

      if (cell.owner === PLAYERS.BLUE) {
        score[PLAYERS.BLUE] += 1;
      }
    }
  }

  return score;
}

/**
 * 判断当前是否产生胜者。
 *
 * 至少让红蓝双方各走过一步后，才开始判断胜负，
 * 避免红方第一步落子后就被错误判定为胜利。
 */
function getWinner() {
  // 新游戏刚开始时不能判胜。
  if (state.moveCount === 0) {
    return null;
  }

  const occupiedPlayers = new Set();

  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner !== null && cell.value > 0) {
        occupiedPlayers.add(cell.owner);
      }
    }
  }

  if (occupiedPlayers.size !== 1) {
    return null;
  }

  return [...occupiedPlayers][0];
}

/**
 * 将棋盘绘制到页面。
 */
function render() {
  renderBoard();
  renderTurn();
  renderScore();
}

function renderBoard() {
  boardElement.style.setProperty("--board-size", state.size);
  boardElement.setAttribute(
    "aria-label",
    `${state.size} × ${state.size} Number Boomer 游戏棋盘`,
  );

  const fragment = document.createDocumentFragment();

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const cell = state.board[row][col];
      const button = document.createElement("button");
      const playerColor =
        cell.owner === null ? "" : PLAYER_COLORS[cell.owner];

      button.type = "button";
      button.className = `cell ${
        playerColor ? `owner-${playerColor}` : ""
      }`;
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.textContent = cell.value > 0 ? String(cell.value) : "";
      button.disabled =
        state.gameOver || !canPlayCell(row, col, state.currentPlayer);
      button.setAttribute(
        "aria-label",
        createCellLabel(row, col, cell),
      );

      fragment.appendChild(button);
    }
  }

  boardElement.replaceChildren(fragment);
}

function createCellLabel(row, col, cell) {
  const position = `${row + 1} 行 ${col + 1} 列`;

  if (cell.owner === null) {
    return `${position}，空格，数字 0`;
  }

  return `${position}，${PLAYER_NAMES[cell.owner]}，数字 ${cell.value}`;
}

function renderTurn() {
  const playerName = PLAYER_NAMES[state.currentPlayer];
  const playerColor = PLAYER_COLORS[state.currentPlayer];

  turnLabelElement.textContent = state.gameOver ? "游戏结束" : playerName;
  turnLabelElement.className = `turn-label ${playerColor}-text`;

  if (!state.gameOver && state.moveCount > 0) {
    setMessage(`${playerName}回合，请选择可以落子的格子。`, false);
  }
}

function renderScore() {
  const [redScore, blueScore] = getScore();
  redScoreElement.textContent = String(redScore);
  blueScoreElement.textContent = String(blueScore);
}

function setMessage(text, isWinMessage) {
  messageElement.textContent = text;
  messageElement.classList.toggle("win-message", isWinMessage);
}

/**
 * 开始一局新游戏。
 */
function startNewGame(size = DEFAULT_SIZE) {
  state.size = size;
  state.board = createBoard(size);
  state.currentPlayer = PLAYERS.RED;
  state.moveCount = 0;
  state.gameOver = false;

  boardSizeSelect.value = String(size);
  setMessage("红方先手，请选择一个红方格子。", false);
  render();
}

/**
 * 使用事件委托处理棋盘点击。
 * 因为 render 会重新生成棋盘按钮，所以只需要给棋盘绑定一次事件。
 */
boardElement.addEventListener("click", (event) => {
  const cellButton = event.target.closest(".cell");

  if (!cellButton || cellButton.disabled) {
    return;
  }

  const row = Number(cellButton.dataset.row);
  const col = Number(cellButton.dataset.col);

  play(row, col);
});

restartButton.addEventListener("click", () => {
  startNewGame(Number(boardSizeSelect.value));
});

boardSizeSelect.addEventListener("change", () => {
  startNewGame(Number(boardSizeSelect.value));
});

startNewGame(DEFAULT_SIZE);