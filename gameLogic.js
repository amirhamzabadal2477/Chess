export const BOARD_SIZE = 8;

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const KNIGHT_OFFSETS = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

const KING_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

let idCounter = 0;

const createPiece = (type, color) => ({
  id: `${color}${type}${idCounter++}`,
  type,
  color,
  hasMoved: false,
});

export function createInitialState() {
  idCounter = 0;
  const board = createInitialBoard();
  return {
    board,
    turn: "w",
    castling: {
      w: { k: true, q: true },
      b: { k: true, q: true },
    },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    lastMove: null,
  };
}

function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    board[0][x] = createPiece(backRank[x], "b");
    board[1][x] = createPiece("p", "b");
    board[6][x] = createPiece("p", "w");
    board[7][x] = createPiece(backRank[x], "w");
  }

  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function opponent(color) {
  return color === "w" ? "b" : "w";
}

function findKing(board, color) {
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

export function isKingInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king.x, king.y, opponent(color));
}

export function isSquareAttacked(board, x, y, byColor) {
  const pawnOffsets =
    byColor === "w" ? [[-1, 1], [1, 1]] : [[-1, -1], [1, -1]];
  for (const [dx, dy] of pawnOffsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const piece = board[ny][nx];
    if (piece && piece.color === byColor && piece.type === "p") {
      return true;
    }
  }

  for (const [dx, dy] of KNIGHT_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const piece = board[ny][nx];
    if (piece && piece.color === byColor && piece.type === "n") {
      return true;
    }
  }

  for (const [dx, dy] of BISHOP_DIRS) {
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny)) {
      const piece = board[ny][nx];
      if (piece) {
        if (
          piece.color === byColor &&
          (piece.type === "b" || piece.type === "q")
        ) {
          return true;
        }
        break;
      }
      nx += dx;
      ny += dy;
    }
  }

  for (const [dx, dy] of ROOK_DIRS) {
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny)) {
      const piece = board[ny][nx];
      if (piece) {
        if (
          piece.color === byColor &&
          (piece.type === "r" || piece.type === "q")
        ) {
          return true;
        }
        break;
      }
      nx += dx;
      ny += dy;
    }
  }

  for (const [dx, dy] of KING_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const piece = board[ny][nx];
    if (piece && piece.color === byColor && piece.type === "k") {
      return true;
    }
  }

  return false;
}

function addMove(moves, move) {
  moves.push(move);
}

function getPseudoMoves(state, x, y) {
  const board = state.board;
  const piece = board[y][x];
  if (!piece) return [];

  const moves = [];
  const color = piece.color;
  const forward = color === "w" ? -1 : 1;
  const startRow = color === "w" ? 6 : 1;
  const promotionRow = color === "w" ? 0 : 7;

  if (piece.type === "p") {
    const nextY = y + forward;
    if (inBounds(x, nextY) && !board[nextY][x]) {
      addMove(moves, {
        from: { x, y },
        to: { x, y: nextY },
        piece,
        isPromotion: nextY === promotionRow,
        promotion: nextY === promotionRow ? "q" : null,
      });
      if (y === startRow) {
        const jumpY = y + forward * 2;
        if (inBounds(x, jumpY) && !board[jumpY][x]) {
          addMove(moves, {
            from: { x, y },
            to: { x, y: jumpY },
            piece,
            isDouble: true,
          });
        }
      }
    }

    for (const dx of [-1, 1]) {
      const nx = x + dx;
      const ny = y + forward;
      if (!inBounds(nx, ny)) continue;
      const target = board[ny][nx];
      if (target && target.color !== color) {
        addMove(moves, {
          from: { x, y },
          to: { x: nx, y: ny },
          piece,
          captured: target,
          isPromotion: ny === promotionRow,
          promotion: ny === promotionRow ? "q" : null,
        });
      }
      if (state.enPassant && state.enPassant.x === nx && state.enPassant.y === ny) {
        addMove(moves, {
          from: { x, y },
          to: { x: nx, y: ny },
          piece,
          isEnPassant: true,
          captured: { type: "p", color: opponent(color) },
        });
      }
    }

    return moves;
  }

  if (piece.type === "n") {
    for (const [dx, dy] of KNIGHT_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const target = board[ny][nx];
      if (!target || target.color !== color) {
        addMove(moves, {
          from: { x, y },
          to: { x: nx, y: ny },
          piece,
          captured: target || null,
        });
      }
    }
    return moves;
  }

  if (piece.type === "b" || piece.type === "r" || piece.type === "q") {
    const dirs = [];
    if (piece.type === "b" || piece.type === "q") dirs.push(...BISHOP_DIRS);
    if (piece.type === "r" || piece.type === "q") dirs.push(...ROOK_DIRS);

    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (inBounds(nx, ny)) {
        const target = board[ny][nx];
        if (!target) {
          addMove(moves, {
            from: { x, y },
            to: { x: nx, y: ny },
            piece,
          });
        } else {
          if (target.color !== color) {
            addMove(moves, {
              from: { x, y },
              to: { x: nx, y: ny },
              piece,
              captured: target,
            });
          }
          break;
        }
        nx += dx;
        ny += dy;
      }
    }

    return moves;
  }

  if (piece.type === "k") {
    for (const [dx, dy] of KING_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const target = board[ny][nx];
      if (!target || target.color !== color) {
        addMove(moves, {
          from: { x, y },
          to: { x: nx, y: ny },
          piece,
          captured: target || null,
        });
      }
    }

    const rights = state.castling[color];
    const homeRow = color === "w" ? 7 : 0;
    if (x === 4 && y === homeRow) {
      if (rights.k && canCastle(state, color, "k")) {
        addMove(moves, {
          from: { x, y },
          to: { x: 6, y: homeRow },
          piece,
          isCastle: "k",
        });
      }
      if (rights.q && canCastle(state, color, "q")) {
        addMove(moves, {
          from: { x, y },
          to: { x: 2, y: homeRow },
          piece,
          isCastle: "q",
        });
      }
    }

    return moves;
  }

  return moves;
}

function canCastle(state, color, side) {
  const board = state.board;
  const homeRow = color === "w" ? 7 : 0;
  const enemy = opponent(color);
  if (isSquareAttacked(board, 4, homeRow, enemy)) return false;

  if (side === "k") {
    const rook = board[homeRow][7];
    if (!rook || rook.type !== "r" || rook.color !== color) return false;
    if (board[homeRow][5] || board[homeRow][6]) return false;
    if (isSquareAttacked(board, 5, homeRow, enemy)) return false;
    if (isSquareAttacked(board, 6, homeRow, enemy)) return false;
    return true;
  }

  const rook = board[homeRow][0];
  if (!rook || rook.type !== "r" || rook.color !== color) return false;
  if (board[homeRow][1] || board[homeRow][2] || board[homeRow][3]) return false;
  if (isSquareAttacked(board, 3, homeRow, enemy)) return false;
  if (isSquareAttacked(board, 2, homeRow, enemy)) return false;
  return true;
}

export function getLegalMoves(state, color = state.turn) {
  const moves = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = state.board[y][x];
      if (!piece || piece.color !== color) continue;
      const pseudo = getPseudoMoves(state, x, y);
      for (const move of pseudo) {
        const nextState = applyMove(state, move);
        if (!isKingInCheck(nextState.board, color)) {
          moves.push(move);
        }
      }
    }
  }
  return moves;
}

export function getLegalMovesForSquare(state, x, y) {
  const piece = state.board[y][x];
  if (!piece || piece.color !== state.turn) return [];
  const moves = getLegalMoves(state, piece.color);
  return moves.filter((move) => move.from.x === x && move.from.y === y);
}

export function applyMove(state, move) {
  const board = cloneBoard(state.board);
  const piece = board[move.from.y][move.from.x];
  if (!piece) return state;

  board[move.from.y][move.from.x] = null;
  let captured = null;

  if (move.isEnPassant) {
    captured = board[move.from.y][move.to.x];
    board[move.from.y][move.to.x] = null;
  } else {
    captured = board[move.to.y][move.to.x];
  }

  const movedPiece = { ...piece, hasMoved: true };
  if (move.promotion) {
    movedPiece.type = move.promotion;
  }
  board[move.to.y][move.to.x] = movedPiece;

  if (move.isCastle) {
    const homeRow = piece.color === "w" ? 7 : 0;
    if (move.isCastle === "k") {
      const rook = board[homeRow][7];
      board[homeRow][7] = null;
      board[homeRow][5] = rook ? { ...rook, hasMoved: true } : null;
    } else {
      const rook = board[homeRow][0];
      board[homeRow][0] = null;
      board[homeRow][3] = rook ? { ...rook, hasMoved: true } : null;
    }
  }

  const castling = {
    w: { ...state.castling.w },
    b: { ...state.castling.b },
  };

  if (piece.type === "k") {
    castling[piece.color].k = false;
    castling[piece.color].q = false;
  }

  if (piece.type === "r") {
    if (piece.color === "w" && move.from.y === 7) {
      if (move.from.x === 0) castling.w.q = false;
      if (move.from.x === 7) castling.w.k = false;
    }
    if (piece.color === "b" && move.from.y === 0) {
      if (move.from.x === 0) castling.b.q = false;
      if (move.from.x === 7) castling.b.k = false;
    }
  }

  if (captured && captured.type === "r") {
    if (captured.color === "w" && move.to.y === 7) {
      if (move.to.x === 0) castling.w.q = false;
      if (move.to.x === 7) castling.w.k = false;
    }
    if (captured.color === "b" && move.to.y === 0) {
      if (move.to.x === 0) castling.b.q = false;
      if (move.to.x === 7) castling.b.k = false;
    }
  }

  let enPassant = null;
  if (piece.type === "p" && Math.abs(move.to.y - move.from.y) === 2) {
    enPassant = { x: move.from.x, y: (move.from.y + move.to.y) / 2 };
  }

  const halfmove = piece.type === "p" || captured ? 0 : state.halfmove + 1;
  const fullmove = state.turn === "b" ? state.fullmove + 1 : state.fullmove;

  return {
    board,
    turn: opponent(state.turn),
    castling,
    enPassant,
    halfmove,
    fullmove,
    lastMove: move,
  };
}

export function getBestMove(state, depth = 2) {
  const moves = getLegalMoves(state, state.turn);
  if (!moves.length) return null;

  const ordered = moves.slice().sort((a, b) => scoreMove(b) - scoreMove(a));

  const maximizing = state.turn === "w";
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMoves = [];

  for (const move of ordered) {
    const nextState = applyMove(state, move);
    const score = minimax(nextState, depth - 1, -Infinity, Infinity);
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function minimax(state, depth, alpha, beta) {
  const moves = getLegalMoves(state, state.turn);
  const inCheck = isKingInCheck(state.board, state.turn);

  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      if (inCheck) {
        return state.turn === "w" ? -100000 : 100000;
      }
      return 0;
    }
    return evaluateBoard(state.board);
  }

  if (state.turn === "w") {
    let value = -Infinity;
    for (const move of moves) {
      const nextState = applyMove(state, move);
      value = Math.max(value, minimax(nextState, depth - 1, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    const nextState = applyMove(state, move);
    value = Math.min(value, minimax(nextState, depth - 1, alpha, beta));
    beta = Math.min(beta, value);
    if (beta <= alpha) break;
  }
  return value;
}

function scoreMove(move) {
  if (move.isCastle) return 30;
  if (move.isEnPassant) return 50;
  if (move.captured) {
    return 100 + PIECE_VALUES[move.captured.type] - PIECE_VALUES[move.piece.type] / 10;
  }
  return 0;
}

function evaluateBoard(board) {
  let score = 0;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const piece = board[y][x];
      if (!piece) continue;
      const base = PIECE_VALUES[piece.type];
      const centerDistance = Math.abs(3.5 - x) + Math.abs(3.5 - y);
      let bonus = 0;
      if (piece.type === "p") {
        bonus = piece.color === "w" ? (6 - y) * 8 : (y - 1) * 8;
      }
      if (piece.type === "n" || piece.type === "b") {
        bonus += Math.max(0, 32 - centerDistance * 8);
      }
      if (piece.type === "r") {
        bonus += piece.color === "w" ? (7 - y) * 2 : y * 2;
      }
      const value = base + bonus;
      score += piece.color === "w" ? value : -value;
    }
  }
  return score;
}
