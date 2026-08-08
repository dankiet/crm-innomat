export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}

export function formatVNDShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + " tỷ";
  }
  if (amount >= 1_000_000) {
    return Math.round(amount / 1_000_000) + "tr";
  }
  return formatVND(amount);
}
