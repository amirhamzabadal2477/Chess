import {
  BOARD_SIZE,
  applyMove,
  createInitialState,
  getBestMove,
  getLegalMoves,
  getLegalMovesForSquare,
  isKingInCheck,
} from "./gameLogic.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_GLYPHS = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const boardEl = document.getElementById("board");
const boardShellEl = document.querySelector(".board-shell");
const pieceLayerEl = document.getElementById("piece-layer");
const statusEl = document.getElementById("status");
const turnEl = document.getElementById("turn");
const difficultyEl = document.getElementById("difficulty");
const difficultyLabelEl = document.getElementById("difficulty-label");
const newGameBtn = document.getElementById("new-game");
const hintBtn = document.getElementById("hint");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");
const flipBtn = document.getElementById("flip");
const moveLogEl = document.getElementById("move-log");
const capturedWhiteEl = document.getElementById("captured-white");
const capturedBlackEl = document.getElementById("captured-black");
const overlayEl = document.getElementById("overlay");
const gameoverPanel = document.getElementById("gameover-panel");
const promotionPanel = document.getElementById("promotion-panel");
const gameoverTitle = document.getElementById("gameover-title");
const gameoverText = document.getElementById("gameover-text");
const restartBtn = document.getElementById("restart");

const squareEls = [];
const pieceEls = new Map();

let cellSize = 0;
let aiToken = 0;
let dragState = null;
let dragJustFinished = false;

let game = createInitialState();
let ui = {
  selected: null,
  legalMoves: [],
  pendingPromotion: null,
  history: [],
  captured: { w: [], b: [] },
  aiThinking: false,
  hintMove: null,
  flipped: false,
};
const undoStack = [];
const redoStack = [];

const DIFFICULTY_LABELS = {
  1: "Calm",
  2: "Sharp",
  3: "Savage",
  4: "Brutal",
};

function buildBoard() {
  boardEl.innerHTML = "";
  squareEls.length = 0;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const square = document.createElement("button");
      square.className = `square ${(x + y) % 2 === 0 ? "light" : "dark"}`;
      square.dataset.x = String(x);
      square.dataset.y = String(y);
      square.setAttribute("aria-label", `${FILES[x]}${BOARD_SIZE - y}`);
      if (y === BOARD_SIZE - 1) square.dataset.file = FILES[x];
      if (x === 0) square.dataset.rank = String(BOARD_SIZE - y);
      boardEl.appendChild(square);
      squareEls.push(square);
    }
  }
}

function layoutBoard() {
  const size = boardEl.getBoundingClientRect().width;
  if (!size) return;
  cellSize = size / BOARD_SIZE;
  document.documentElement.style.setProperty("--cell", `${cellSize}px`);
}

function getSquareEl(pos) {
  if (!pos) return null;
  const index = pos.y * BOARD_SIZE + pos.x;
  return squareEls[index] || null;
}

function renderSquares() {
  for (const square of squareEls) {
    square.classList.remove(
      "selected",
      "legal",
      "capture",
      "last-from",
      "last-to",
      "check",
      "hint"
    );
  }

  if (game.lastMove) {
    const fromEl = getSquareEl(game.lastMove.from);
    const toEl = getSquareEl(game.lastMove.to);
    if (fromEl) fromEl.classList.add("last-from");
    if (toEl) toEl.classList.add("last-to");
  }

  if (ui.selected) {
    const selectedEl = getSquareEl(ui.selected);
    if (selectedEl) selectedEl.classList.add("selected");
  }

  for (const move of ui.legalMoves) {
    const targetEl = getSquareEl(move.to);
    if (!targetEl) continue;
    if (move.captured || move.isEnPassant) {
      targetEl.classList.add("capture");
    } else {
      targetEl.classList.add("legal");
    }
  }

  if (isKingInCheck(game.board, game.turn)) {
    const kingPos = findKingPosition(game.board, game.turn);
    const kingSquare = getSquareEl(kingPos);
    if (kingSquare) kingSquare.classList.add("check");
  }

  if (ui.hintMove) {
    const hintSquare = getSquareEl(ui.hintMove.to);
    if (hintSquare) hintSquare.classList.add("hint");
  }
}

function renderPieces(skipAnimation = false) {
  const nextIds = new Set();
  if (skipAnimation) pieceLayerEl.classList.add("no-anim");

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = game.board[y][x];
      if (!piece) continue;
      nextIds.add(piece.id);
      let el = pieceEls.get(piece.id);
      if (!el) {
        el = document.createElement("div");
        el.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        el.dataset.id = piece.id;
        el.textContent = PIECE_GLYPHS[piece.color][piece.type];
        pieceLayerEl.appendChild(el);
        pieceEls.set(piece.id, el);
      } else {
        el.textContent = PIECE_GLYPHS[piece.color][piece.type];
      }
      if (!dragState || dragState.id !== piece.id) {
        el.style.setProperty("--tx", `${x * cellSize}px`);
        el.style.setProperty("--ty", `${y * cellSize}px`);
        el.style.transform = "";
        el.classList.remove("dragging");
      }
    }
  }

  for (const [id, el] of pieceEls.entries()) {
    if (nextIds.has(id)) continue;
    el.classList.add("captured");
    setTimeout(() => {
      el.remove();
    }, 200);
    pieceEls.delete(id);
  }

  if (skipAnimation) {
    requestAnimationFrame(() => pieceLayerEl.classList.remove("no-anim"));
  }
}

function renderMoveLog() {
  moveLogEl.innerHTML = "";
  for (let i = 0; i < ui.history.length; i += 2) {
    const row = document.createElement("li");
    row.className = "move-row";

    const index = document.createElement("span");
    index.className = "ply";
    index.textContent = `${Math.floor(i / 2) + 1}.`;

    const whiteMove = document.createElement("span");
    whiteMove.textContent = ui.history[i]?.notation || "";

    const blackMove = document.createElement("span");
    blackMove.textContent = ui.history[i + 1]?.notation || "";

    row.append(index, whiteMove, blackMove);
    moveLogEl.appendChild(row);
  }
}

function renderCaptured() {
  capturedWhiteEl.innerHTML = "";
  capturedBlackEl.innerHTML = "";

  renderCapturedRow(capturedWhiteEl, ui.captured.w);
  renderCapturedRow(capturedBlackEl, ui.captured.b);
}

function renderCapturedRow(el, pieces) {
  const sorted = [...pieces].sort(
    (a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]
  );
  for (const piece of sorted) {
    const span = document.createElement("span");
    span.className = `captured-piece ${piece.color === "w" ? "white" : "black"}`;
    span.textContent = PIECE_GLYPHS[piece.color][piece.type];
    el.appendChild(span);
  }
}

function renderStatus() {
  const turnLabel = game.turn === "w" ? "White" : "Black";
  turnEl.textContent = turnLabel;

  let status = "";
  if (game.gameOver) {
    status = game.result === "stalemate" ? "Stalemate" : "Checkmate";
  } else if (ui.aiThinking) {
    status = "AI thinking...";
  } else if (isKingInCheck(game.board, game.turn)) {
    status = `${turnLabel} in check`;
  } else {
    status = game.turn === "w" ? "Your move" : "AI move";
  }

  statusEl.textContent = status;
}

function renderOverlay() {
  if (ui.pendingPromotion) {
    overlayEl.classList.remove("hidden");
    promotionPanel.classList.remove("hidden");
    gameoverPanel.classList.add("hidden");
    return;
  }

  if (game.gameOver) {
    overlayEl.classList.remove("hidden");
    promotionPanel.classList.add("hidden");
    gameoverPanel.classList.remove("hidden");

    if (game.result === "stalemate") {
      gameoverTitle.textContent = "Stalemate";
      gameoverText.textContent = "No legal moves remain. It's a draw.";
    } else {
      const winner = game.turn === "b" ? "White" : "Black";
      const playerWon = winner === "White";
      gameoverTitle.textContent = "Checkmate";
      gameoverText.textContent = playerWon
        ? "You outplayed the AI."
        : "The AI found the winning line.";
    }
    return;
  }

  overlayEl.classList.add("hidden");
  promotionPanel.classList.add("hidden");
  gameoverPanel.classList.add("hidden");
}

function render() {
  boardShellEl.classList.toggle("flipped", ui.flipped);
  renderSquares();
  renderPieces();
  renderMoveLog();
  renderCaptured();
  renderStatus();
  renderOverlay();
}

function resetGame() {
  game = createInitialState();
  ui = {
    selected: null,
    legalMoves: [],
    pendingPromotion: null,
    history: [],
    captured: { w: [], b: [] },
    aiThinking: false,
    hintMove: null,
    flipped: ui.flipped,
  };
  aiToken += 1;
  undoStack.length = 0;
  redoStack.length = 0;
  pieceEls.clear();
  pieceLayerEl.innerHTML = "";
  render();
}

function formatMove(move) {
  if (move.isCastle) {
    return move.isCastle === "k" ? "O-O" : "O-O-O";
  }

  const pieceLetterMap = {
    p: "",
    n: "N",
    b: "B",
    r: "R",
    q: "Q",
    k: "K",
  };

  const from = `${FILES[move.from.x]}${BOARD_SIZE - move.from.y}`;
  const to = `${FILES[move.to.x]}${BOARD_SIZE - move.to.y}`;
  const capture = move.captured || move.isEnPassant ? "x" : "-";
  const pieceLetter = pieceLetterMap[move.piece.type];
  const promo = move.promotion ? `=${pieceLetterMap[move.promotion]}` : "";

  if (move.piece.type === "p") {
    return `${from}${capture}${to}${promo}`;
  }
  return `${pieceLetter}${from}${capture}${to}${promo}`;
}

function getCapturedPiece(prevGame, move) {
  if (move.isEnPassant) {
    return prevGame.board[move.from.y][move.to.x];
  }
  return prevGame.board[move.to.y][move.to.x];
}

function commitMove(move) {
  pushUndo();
  const prevGame = game;
  const capturedPiece = getCapturedPiece(prevGame, move);

  const nextGame = applyMove(prevGame, move);
  const opponentMoves = getLegalMoves(nextGame, nextGame.turn);
  const opponentInCheck = isKingInCheck(nextGame.board, nextGame.turn);
  const isCheckmate = opponentMoves.length === 0 && opponentInCheck;
  const isStalemate = opponentMoves.length === 0 && !opponentInCheck;

  const notation = `${formatMove(move)}${isCheckmate ? "#" : opponentInCheck ? "+" : ""}`;

  if (capturedPiece) {
    ui.captured[capturedPiece.color].push(capturedPiece);
  }
  ui.history.push({ move, notation });

  game = {
    ...nextGame,
    gameOver: isCheckmate || isStalemate,
    result: isCheckmate ? "checkmate" : isStalemate ? "stalemate" : null,
  };
  ui.selected = null;
  ui.legalMoves = [];
  ui.pendingPromotion = null;
  ui.hintMove = null;

  render();
  flashMovedPiece(move.piece.id);

  if (game.gameOver) return;
  if (game.turn === "b") triggerAIMove();
}

function flashMovedPiece(id) {
  const el = pieceEls.get(id);
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function triggerAIMove() {
  if (game.gameOver) return;
  ui.aiThinking = true;
  renderStatus();

  const token = (aiToken += 1);
  const depth = Number(difficultyEl.value || 2);

  setTimeout(() => {
    if (token !== aiToken || game.turn !== "b") return;
    const move = getBestMove(game, depth);
    ui.aiThinking = false;
    if (move) {
      commitMove(move);
    } else {
      render();
    }
  }, 380);
}

function attemptMoveTo(x, y) {
  const move = ui.legalMoves.find(
    (candidate) => candidate.to.x === x && candidate.to.y === y
  );
  if (move) {
    if (move.isPromotion) {
      ui.pendingPromotion = move;
      renderOverlay();
    } else {
      commitMove(move);
    }
    return true;
  }
  return false;
}

function handleSquareClick(event) {
  const square = event.target.closest(".square");
  if (!square) return;
  if (dragJustFinished) return;
  if (game.gameOver || ui.aiThinking || ui.pendingPromotion) return;
  if (game.turn !== "w") return;

  const x = Number(square.dataset.x);
  const y = Number(square.dataset.y);
  const clickedPiece = game.board[y][x];

  if (ui.selected) {
    if (attemptMoveTo(x, y)) return;
  }

  if (clickedPiece && clickedPiece.color === "w") {
    ui.selected = { x, y };
    ui.legalMoves = getLegalMovesForSquare(game, x, y);
    ui.hintMove = null;
  } else {
    ui.selected = null;
    ui.legalMoves = [];
  }

  renderSquares();
}

function handlePromotionClick(event) {
  const button = event.target.closest("button[data-piece]");
  if (!button || !ui.pendingPromotion) return;
  const promotion = button.dataset.piece;
  const move = { ...ui.pendingPromotion, promotion };
  ui.pendingPromotion = null;
  commitMove(move);
}

function findKingPosition(board, color) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = board[y][x];
      if (piece && piece.color === color && piece.type === "k") {
        return { x, y };
      }
    }
  }
  return null;
}

function handleKey(event) {
  const key = event.key.toLowerCase();
  if (key === "r") {
    resetGame();
  }
  if (key === "escape") {
    ui.selected = null;
    ui.legalMoves = [];
    renderSquares();
  }
}

function cloneData(data) {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

function pushUndo() {
  undoStack.push(cloneData({ game, ui }));
  redoStack.length = 0;
}

function restoreSnapshot(snapshot) {
  game = snapshot.game;
  ui = { ...snapshot.ui, aiThinking: false, pendingPromotion: null };
  aiToken += 1;
  pieceEls.clear();
  pieceLayerEl.innerHTML = "";
  boardShellEl.classList.toggle("flipped", ui.flipped);
  render();
}

function handleUndo() {
  if (!undoStack.length || ui.aiThinking || ui.pendingPromotion) return;
  const snapshot = undoStack.pop();
  redoStack.push(cloneData({ game, ui }));
  restoreSnapshot(snapshot);
}

function handleRedo() {
  if (!redoStack.length || ui.aiThinking || ui.pendingPromotion) return;
  const snapshot = redoStack.pop();
  undoStack.push(cloneData({ game, ui }));
  restoreSnapshot(snapshot);
}

function updateDifficultyLabel() {
  const value = Number(difficultyEl.value || 2);
  difficultyLabelEl.textContent = DIFFICULTY_LABELS[value] || "Sharp";
}

function handleHint() {
  if (game.gameOver || ui.aiThinking || ui.pendingPromotion) return;
  if (game.turn !== "w") return;
  const depth = Number(difficultyEl.value || 2);
  const move = getBestMove(game, depth);
  ui.hintMove = move || null;
  renderSquares();
}

function handleFlip() {
  ui.flipped = !ui.flipped;
  boardShellEl.classList.toggle("flipped", ui.flipped);
}

function handlePointerDown(event) {
  const square = event.target.closest(".square");
  if (!square) return;
  if (game.gameOver || ui.aiThinking || ui.pendingPromotion) return;
  if (game.turn !== "w") return;

  const x = Number(square.dataset.x);
  const y = Number(square.dataset.y);
  const piece = game.board[y][x];
  if (!piece || piece.color !== "w") return;

  const pieceEl = pieceEls.get(piece.id);
  if (!pieceEl) return;

  const boardRect = boardEl.getBoundingClientRect();
  const pointerX = event.clientX - boardRect.left;
  const pointerY = event.clientY - boardRect.top;
  const baseX = x * cellSize;
  const baseY = y * cellSize;

  ui.selected = { x, y };
  ui.legalMoves = getLegalMovesForSquare(game, x, y);
  ui.hintMove = null;
  renderSquares();

  dragState = {
    id: piece.id,
    from: { x, y },
    el: pieceEl,
    offsetX: pointerX - baseX,
    offsetY: pointerY - baseY,
    moved: false,
    pointerId: event.pointerId,
  };
  pieceEl.classList.add("dragging");
  boardEl.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!dragState) return;
  if (event.pointerId !== dragState.pointerId) return;
  const boardRect = boardEl.getBoundingClientRect();
  const pointerX = event.clientX - boardRect.left;
  const pointerY = event.clientY - boardRect.top;
  const nextX = pointerX - dragState.offsetX;
  const nextY = pointerY - dragState.offsetY;
  if (Math.abs(nextX) > 2 || Math.abs(nextY) > 2) {
    dragState.moved = true;
  }
  dragState.el.style.transform = `translate(${nextX}px, ${nextY}px)`;
}

function handlePointerUp(event) {
  if (!dragState) return;
  if (event.pointerId !== dragState.pointerId) return;
  boardEl.releasePointerCapture(event.pointerId);

  const boardRect = boardEl.getBoundingClientRect();
  const pointerX = event.clientX - boardRect.left;
  const pointerY = event.clientY - boardRect.top;
  const targetX = Math.floor(pointerX / cellSize);
  const targetY = Math.floor(pointerY / cellSize);

  const dragged = dragState.moved;
  const dragPieceEl = dragState.el;
  dragPieceEl.classList.remove("dragging");
  dragPieceEl.style.transform = "";
  dragState = null;

  if (dragged && targetX >= 0 && targetX < BOARD_SIZE && targetY >= 0 && targetY < BOARD_SIZE) {
    if (attemptMoveTo(targetX, targetY)) {
      dragJustFinished = true;
      setTimeout(() => {
        dragJustFinished = false;
      }, 0);
    } else {
      render();
    }
  } else {
    renderSquares();
  }
}

function handlePointerCancel(event) {
  if (!dragState) return;
  if (event.pointerId !== dragState.pointerId) return;
  dragState.el.classList.remove("dragging");
  dragState.el.style.transform = "";
  dragState = null;
  render();
}

buildBoard();
layoutBoard();
render();
updateDifficultyLabel();

boardEl.addEventListener("click", handleSquareClick);
boardEl.addEventListener("pointerdown", handlePointerDown);
boardEl.addEventListener("pointermove", handlePointerMove);
boardEl.addEventListener("pointerup", handlePointerUp);
boardEl.addEventListener("pointercancel", handlePointerCancel);
newGameBtn.addEventListener("click", resetGame);
restartBtn.addEventListener("click", resetGame);
promotionPanel.addEventListener("click", handlePromotionClick);
window.addEventListener("keydown", handleKey);
hintBtn.addEventListener("click", handleHint);
undoBtn.addEventListener("click", handleUndo);
redoBtn.addEventListener("click", handleRedo);
flipBtn.addEventListener("click", handleFlip);
difficultyEl.addEventListener("input", updateDifficultyLabel);
window.addEventListener("resize", () => {
  layoutBoard();
  renderPieces(true);
});
