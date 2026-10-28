// The Search magnifier for LatticeLoader at grid 4 (Bay, 2026-10-27). 4x4 cells, row * 4 + column:
//
//   X X X .      0  1  2  3
//   X . X .      4  5  6  7
//   X X X .      8  9 10 11
//   . . . X     12 13 14 15
//
// The lens is a ring of eight lit cells in the top-left 3x3 (the centre stays dark), the handle is the one cell on the
// bottom-right diagonal. At 6 px cells with round shape it reads as the Search mark; error stays the cross.
export const MAGNIFIER_DONE = [0, 1, 2, 4, 6, 8, 9, 10, 15]
export const CROSS_ERROR = [0, 3, 5, 6, 9, 10, 12, 15]
export const SEARCH_MARKS = { 4: { done: MAGNIFIER_DONE, error: CROSS_ERROR } }

// The working wave: a lit cell travels clockwise round the lens, then out along the handle, then round again.
// null cells are the dark centre and the unused corners.
export const SEARCH_PATTERN = {
  cells: [0, 1, 2, null, 7, null, 3, null, 6, 5, 4, null, null, null, null, 8],
  loop: 9,
  scale: 1.2,
  lit: 0.45,
}
