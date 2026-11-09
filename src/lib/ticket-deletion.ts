export const canDeleteTicket = (status: string) =>
  ["won", "lost", "void", "cashed_out"].includes(status);

export const isDeleteSwipe = (startX: number, startY: number, endX: number, endY: number) =>
  startX - endX >= 45 && Math.abs(endY - startY) < 35;