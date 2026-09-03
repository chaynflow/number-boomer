import "./style.css";
import "./auth.js";

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
const OPENING_MODES = {
  CLASSIC: "classic",
  RANDOM: "random",
};
const boardElement = document.querySelector("#board");
const turnLabelElement = document.querySelector("#turn-label");
const redScoreElement = document.querySelector("#red-score");
const blueScoreElement = document.querySelector("#blue-score");
const messageElement = document.querySelector("#message");
const restartButton = document.querySelector("#restart-button");
const boardSizeSelect = document.querySelector("#board-size");
const openingModeSelect = document.querySelector("#opening-mode");
const EXPLOSION_HIGHLIGHT_MS = 500;
const state = {
  size: DEFAULT_SIZE,
  board: [],
  currentPlayer: PLAYERS.RED,
  moveCount: 0,
  gameOver: false,

  // 防止爆炸动画期间重复点击
  isResolving: false,

  // 当前正在高亮的爆炸格子
  explodingCells: new Set(),

  // 重新开始时取消上一局尚未结束的异步动画
  roundId: 0,
  openingMode: OPENING_MODES.CLASSIC,
};

function getBoardRegion(row, col, size) {
  const isTopOrBottom =
    row === 0 || row === size - 1;

  const isLeftOrRight =
    col === 0 || col === size - 1;

  if (isTopOrBottom && isLeftOrRight) {
    return "corners";
  }

  if (isTopOrBottom || isLeftOrRight) {
    return "edges";
  }

  return "interior";
}

function assignBalancedOwners(board, positions) {
  const shuffledPositions = shuffle(positions);

  const firstPlayer =
    randomInt(2) === 0
      ? PLAYERS.RED
      : PLAYERS.BLUE;

  const secondPlayer =
    firstPlayer === PLAYERS.RED
      ? PLAYERS.BLUE
      : PLAYERS.RED;

  for (
    let index = 0;
    index < shuffledPositions.length;
    index += 1
  ) {
    const [row, col] = shuffledPositions[index];

    board[row][col].owner =
      index % 2 === 0
        ? firstPlayer
        : secondPlayer;
  }
}

function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = randomInt(index + 1);

    [result[index], result[targetIndex]] = [
      result[targetIndex],
      result[index],
    ];
  }

  return result;
}

function randomInt(max) {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const values = new Uint32Array(1);
    const maxUint32 = 0x100000000;
    const limit =
      maxUint32 - (maxUint32 % max);

    do {
      globalThis.crypto.getRandomValues(values);
    } while (values[0] >= limit);

    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function createClassicBoard(size) {
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

function createRandomBoard(size) {
  const board = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      value: 1,
      owner: null,
    })),
  );

  const regions = {
    corners: [],
    edges: [],
    interior: [],
  };

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const region = getBoardRegion(row, col, size);
      regions[region].push([row, col]);
    }
  }

  assignBalancedOwners(board, regions.corners);
  assignBalancedOwners(board, regions.edges);
  assignBalancedOwners(board, regions.interior);

  return board;
}

function createBoard(
  size,
  openingMode = OPENING_MODES.CLASSIC,
) {
  if (openingMode === OPENING_MODES.RANDOM) {
    return createRandomBoard(size);
  }

  return createClassicBoard(size);
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
async function play(row, col) {
  if (state.gameOver || state.isResolving) {
    return;
  }

  if (!canPlayCell(row, col, state.currentPlayer)) {
    setMessage("不能点击对手已经占领的格子。", false);
    return;
  }

  const player = state.currentPlayer;
  const roundId = state.roundId;
  const cell = state.board[row][col];

  cell.value += 1;
  cell.owner = player;

  state.moveCount += 1;
  state.isResolving = true;

  render();
  setMessage("正在处理连锁爆炸……", false);

  const result = await resolveExplosions(player, roundId);

  if (result.cancelled || roundId !== state.roundId) {
    return;
  }

  state.isResolving = false;
  state.explodingCells = new Set();

  if (result.winner !== null) {
    state.gameOver = true;
    render();

    setMessage(
      `${PLAYER_NAMES[result.winner]}获胜！点击“重新开始”再玩一局。`,
      true,
    );

    return;
  }

  if (result.unstable) {
    state.gameOver = true;
    render();

    setMessage(
      "本局数字无法稳定，判定为平局。",
      false,
    );

    return;
  }

  state.currentPlayer =
    state.currentPlayer === PLAYERS.RED
      ? PLAYERS.BLUE
      : PLAYERS.RED;

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
async function resolveExplosions(player, roundId) {
  const seenStates = new Set();

  while (true) {
    const unstableCells = getUnstableCells();

    // 所有格子都已稳定，连锁结束。
    if (unstableCells.length === 0) {
      return {
        winner: null,
        unstable: false,
        cancelled: false,
      };
    }

    // 同一棋盘状态再次出现，说明爆炸已经进入循环。
    const signature = createBoardSignature();

    if (seenStates.has(signature)) {
      return {
        winner: null,
        unstable: true,
        reason: "cycle",
        cancelled: false,
      };
    }

    seenStates.add(signature);

    // 当前波次的所有爆炸格子一起高亮。
    state.explodingCells = new Set(
      unstableCells.map(({ row, col }) => createCellKey(row, col)),
    );

    renderBoard();

    await wait(EXPLOSION_HIGHLIGHT_MS);

    // 重新开始或切换棋盘后，停止旧动画。
    if (roundId !== state.roundId) {
      return {
        winner: null,
        unstable: false,
        cancelled: true,
      };
    }

    // 先保存本波爆炸信息，避免修改棋盘后丢失阈值。
    const explosions = unstableCells.map(({ row, col }) => ({
      row,
      col,
      threshold: getThreshold(row, col),
    }));

    // 第一阶段：所有爆炸格子减去各自的临界值。
    for (const { row, col, threshold } of explosions) {
      const cell = state.board[row][col];

      cell.value -= threshold;

      if (cell.value === 0) {
        cell.owner = null;
      }
    }

    // 第二阶段：向四连通邻居传播。
    for (const { row, col } of explosions) {
      const neighbors = getNeighbors(row, col);

      for (const [neighborRow, neighborCol] of neighbors) {
        const neighbor = state.board[neighborRow][neighborCol];

        neighbor.value += 1;
        neighbor.owner = player;
      }
    }

    state.explodingCells = new Set();

    // 每一波爆炸后立即更新棋盘和分数。
    renderBoard();
    renderScore();

    // 关键修复：不要等整个连锁结束后才判断胜负。
    const winner = getWinner();

    if (winner !== null) {
      return {
        winner,
        unstable: false,
        cancelled: false,
      };
    }

    /*
     * 爆炸只重新分配数字，不会减少数字总量。
     * 当总量超过所有格子的稳定容量时，棋盘不可能稳定，
     * 必须结束游戏，避免无限爆炸。
     */
    if (isBoardOverloaded()) {
      return {
        winner: null,
        unstable: true,
        reason: "overload",
        cancelled: false,
      };
    }
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function createCellKey(row, col) {
  return `${row}:${col}`;
}

function createCellLabel(row, col, cell) {
  const position = `${row + 1} 行 ${col + 1} 列`;

  if (cell.owner === null) {
    return `${position}，空格，数字 ${cell.value}`;
  }

  return `${position}，${PLAYER_NAMES[cell.owner]}，数字 ${cell.value}`;
}

function getUnstableCells() {
  const unstableCells = [];

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const cell = state.board[row][col];

      if (cell.value > getThreshold(row, col)) {
        unstableCells.push({ row, col });
      }
    }
  }

  return unstableCells;
}




function createBoardSignature() {
  return state.board
    .flatMap((row) =>
      row.map((cell) => `${cell.owner ?? "n"}:${cell.value}`),
    )
    .join("|");
}

function isBoardOverloaded() {
  let totalValue = 0;
  let stableCapacity = 0;

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      totalValue += state.board[row][col].value;
      stableCapacity += getThreshold(row, col);
    }
  }

  return totalValue > stableCapacity;
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
  boardElement.style.setProperty("--board-size", String(state.size));

  boardElement.setAttribute(
    "aria-label",
    `${state.size} × ${state.size} Number Boomer 游戏棋盘`,
  );

  boardElement.setAttribute(
    "aria-busy",
    state.isResolving ? "true" : "false",
  );

  const fragment = document.createDocumentFragment();

  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      const cell = state.board[row][col];
      const button = document.createElement("button");
      const cellKey = createCellKey(row, col);

      button.type = "button";
      button.className = "cell";

      if (cell.owner === PLAYERS.RED) {
        button.classList.add("owner-red");
      } else if (cell.owner === PLAYERS.BLUE) {
        button.classList.add("owner-blue");
      }

      if (state.explodingCells.has(cellKey)) {
        button.classList.add("exploding");
      }

      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.textContent = cell.value > 0 ? String(cell.value) : "";

      button.disabled =
        state.gameOver ||
        state.isResolving ||
        !canPlayCell(row, col, state.currentPlayer);

      button.setAttribute(
        "aria-label",
        createCellLabel(row, col, cell),
      );

      fragment.appendChild(button);
    }
  }

  boardElement.replaceChildren(fragment);
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
function startNewGame(
  size = DEFAULT_SIZE,
  openingMode = state.openingMode,
) {
  state.roundId += 1;
  state.size = size;
  state.openingMode = openingMode;
  state.board = createBoard(size, openingMode);
  state.currentPlayer = PLAYERS.RED;
  state.moveCount = 0;
  state.gameOver = false;
  state.isResolving = false;
  state.explodingCells = new Set();

  boardSizeSelect.value = String(size);

  if (openingModeSelect) {
    openingModeSelect.value = openingMode;
  }

  const openingMessage =
    openingMode === OPENING_MODES.RANDOM
      ? "随机开局：红方先手，请选择一个红方格子。"
      : "经典开局：红方先手，请选择一个红方格子。";

  setMessage(openingMessage, false);
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

  void play(row, col);
});

restartButton.addEventListener("click", () => {
  startNewGame(
    Number(boardSizeSelect.value),
    openingModeSelect.value,
  );
});

boardSizeSelect.addEventListener("change", () => {
  startNewGame(
    Number(boardSizeSelect.value),
    openingModeSelect.value,
  );
});

openingModeSelect.addEventListener("change", () => {
  startNewGame(
    Number(boardSizeSelect.value),
    openingModeSelect.value,
  );
});

startNewGame(
  DEFAULT_SIZE,
  OPENING_MODES.CLASSIC,
);