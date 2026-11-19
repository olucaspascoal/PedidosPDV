import { Promotion } from './models';

/** Mesma conta da API (PromotionCalculator), só para a prévia no carrinho. A API é quem decide o valor final. */
export function promoDiscount(p: Promotion, quantity: number, unitPrice: number): number {
  if (p.quantity < 2 || quantity < p.quantity) return 0;
  const groups = Math.floor(quantity / p.quantity);
  const perGroup = p.type === 'LevePorPreco'
    ? (p.price != null ? p.quantity * unitPrice - p.price : 0)
    : (p.payQuantity != null ? (p.quantity - p.payQuantity) * unitPrice : 0);
  return perGroup > 0 ? Math.round(groups * perGroup * 100) / 100 : 0;
}

/** Promoção de maior desconto para o produto nessa quantidade (ou null). */
export function bestPromo(promos: Promotion[], productId: number, quantity: number, unitPrice: number) {
  let best: { promo: Promotion; amount: number } | null = null;
  for (const p of promos) {
    if (p.productId !== productId) continue;
    const amount = promoDiscount(p, quantity, unitPrice);
    if (amount > 0 && (!best || amount > best.amount)) best = { promo: p, amount };
  }
  return best;
}
