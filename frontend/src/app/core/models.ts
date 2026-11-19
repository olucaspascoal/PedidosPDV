export type UserRole = 'Admin' | 'Atendente';
export type OrderStatus = 'Aberta' | 'Paga' | 'Cancelada' | 'Estornada';
export type PaymentMethod = 'Pix' | 'Dinheiro' | 'Credito' | 'Debito';
export type PaymentStatus = 'Pendente' | 'Aprovado' | 'Cancelado' | 'Expirado' | 'Recusado' | 'Estornado';
export type PromotionType = 'LevePorPreco' | 'LeveXPagueY';

export interface User { id: number; name: string; role: UserRole; active: boolean; }
export interface LoginUser { id: number; name: string; role: UserRole; }
export interface LoginResponse { token: string; user: User; }

export interface Category { id: number; name: string; icon: string; sortOrder: number; active: boolean; productCount: number; }

export interface Product {
  id: number; name: string; description: string | null; price: number;
  categoryId: number; categoryName: string; categoryIcon: string; imageUrl: string | null;
  trackStock: boolean; stock: number; featured: boolean; active: boolean;
}

export interface OrderItemInput { productId: number; quantity: number; notes?: string | null; }

export interface OrderItem { id: number; productId: number; productName: string; unitPrice: number; quantity: number; notes: string | null; total: number; }

export interface Payment {
  id: number; orderId: number; method: PaymentMethod; status: PaymentStatus; amount: number;
  cashReceived: number | null; change: number | null; qrCode: string | null; qrCodeBase64: string | null;
  ticketUrl: string | null; expiresAt: string | null; createdAt: string; paidAt: string | null; simulated: boolean;
  refundedAt: string | null; refundReason: string | null;
}

export interface Order {
  id: number; label: string | null; notes: string | null; status: OrderStatus; userName: string;
  createdAt: string; closedAt: string | null; subtotal: number; promoDiscount: number;
  promotions: { description: string; amount: number }[]; discount: number; total: number;
  paid: number; remaining: number; items: OrderItem[]; payments: Payment[];
}

export interface OrderSummary {
  id: number; label: string | null; status: OrderStatus; userName: string; createdAt: string;
  closedAt: string | null; itemCount: number; total: number; paid: number; methods: PaymentMethod[];
}

export interface Promotion {
  id: number; name: string; type: PromotionType; productId: number; productName: string; productPrice: number;
  quantity: number; price: number | null; payQuantity: number | null; startsOn: string | null; endsOn: string | null;
  active: boolean; rule: string; validToday: boolean;
}

export interface PaymentResult { payment: Payment; orderStatus: OrderStatus; orderRemaining: number; }

export interface SeriesPoint { label: string; amount: number; count: number; }
export interface Dashboard {
  from: string; to: string; revenue: number; orderCount: number; averageTicket: number; itemsSold: number;
  openOrders: number; openOrdersValue: number; canceledOrders: number;
  byMethod: { method: PaymentMethod; amount: number; count: number }[];
  byHour: SeriesPoint[]; byDay: SeriesPoint[];
  topProducts: { productId: number; name: string; quantity: number; revenue: number }[];
  lowStock: { id: number; name: string; stock: number }[];
  recent: OrderSummary[];
}

export interface PaymentSettings { pixMode: 'simulado' | 'mercadopago'; notificationUrlConfigured: boolean; webhookSecretConfigured: boolean; pixExpirationMinutes: number; }

export const METHOD_LABEL: Record<PaymentMethod, string> = { Pix: 'Pix', Dinheiro: 'Dinheiro', Credito: 'Crédito', Debito: 'Débito' };
export const METHOD_ICON: Record<PaymentMethod, string> = { Pix: 'pix', Dinheiro: 'cash', Credito: 'card', Debito: 'card' };
