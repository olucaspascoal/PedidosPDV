import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Category, Dashboard, LoginResponse, LoginUser, Order, OrderItemInput, OrderStatus, OrderSummary,
  PaymentMethod, PaymentResult, PaymentSettings, Product, User, UserRole,
} from './models';

declare global { interface Window { PDV_CONFIG?: { apiUrl?: string } } }

/** Base da API: definida em public/config.js (vazio = mesma origem, como no desenvolvimento com proxy). */
export const API_BASE = `${(window.PDV_CONFIG?.apiUrl ?? '').replace(/\/+$/, '')}/api`;

/** Extrai a mensagem amigável que a API devolve em { message }. */
export function errorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Sem conexão com o servidor.';
    if (err.status === 429) return 'Muitas tentativas. Aguarde um minuto.';
    if (typeof err.error?.message === 'string') return err.error.message;
    if (err.status === 403) return 'Você não tem permissão para isso.';
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private get<T>(url: string, params?: Record<string, string | number | boolean | undefined | null>) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    return firstValueFrom(this.http.get<T>(`${API_BASE}${url}`, { params: p }));
  }
  private post<T>(url: string, body: unknown = {}) { return firstValueFrom(this.http.post<T>(`${API_BASE}${url}`, body)); }
  private put<T>(url: string, body: unknown) { return firstValueFrom(this.http.put<T>(`${API_BASE}${url}`, body)); }
  private patch<T>(url: string, body: unknown) { return firstValueFrom(this.http.patch<T>(`${API_BASE}${url}`, body)); }
  private delete(url: string) { return firstValueFrom(this.http.delete<void>(`${API_BASE}${url}`)); }

  // Auth
  loginUsers() { return this.get<LoginUser[]>('/auth/users'); }
  login(userId: number, pin: string) { return this.post<LoginResponse>('/auth/login', { userId, pin }); }
  me() { return this.get<User>('/auth/me'); }

  // Catálogo
  categories(all = false) { return this.get<Category[]>('/categories', { all }); }
  saveCategory(c: { name: string; icon: string; sortOrder: number; active: boolean }, id?: number) {
    return id ? this.put<Category>(`/categories/${id}`, c) : this.post<Category>('/categories', c);
  }
  deleteCategory(id: number) { return this.delete(`/categories/${id}`); }
  products(all = false) { return this.get<Product[]>('/products', { all }); }
  saveProduct(p: Omit<Product, 'id' | 'categoryName' | 'categoryIcon'>, id?: number) {
    return id ? this.put<Product>(`/products/${id}`, p) : this.post<Product>('/products', p);
  }
  deleteProduct(id: number) { return this.delete(`/products/${id}`); }

  // Vendas
  orders(f: { status?: OrderStatus; from?: string; to?: string; take?: number } = {}) { return this.get<OrderSummary[]>('/orders', f); }
  order(id: number) { return this.get<Order>(`/orders/${id}`); }
  createOrder(label: string | null, items: OrderItemInput[]) { return this.post<Order>('/orders', { label, items }); }
  addItems(id: number, items: OrderItemInput[]) { return this.post<Order>(`/orders/${id}/items`, { items }); }
  updateItem(id: number, itemId: number, quantity: number) { return this.patch<Order>(`/orders/${id}/items/${itemId}`, { quantity }); }
  updateOrder(id: number, body: { label: string | null; notes: string | null; discount?: number }) { return this.patch<Order>(`/orders/${id}`, body); }
  cancelOrder(id: number) { return this.post<Order>(`/orders/${id}/cancel`); }
  refundOrder(id: number, reason: string | null) { return this.post<Order>(`/orders/${id}/refund`, { reason }); }

  // Pagamentos
  pay(orderId: number, body: { method: PaymentMethod; amount?: number; cashReceived?: number }) {
    return this.post<PaymentResult>(`/orders/${orderId}/payments`, body);
  }
  payment(id: number) { return this.get<PaymentResult>(`/payments/${id}`); }
  cancelPayment(id: number) { return this.post<PaymentResult>(`/payments/${id}/cancel`); }
  simulateApproval(id: number) { return this.post<PaymentResult>(`/payments/${id}/simulate-approval`); }

  // Gestão
  dashboard(from: string, to: string) { return this.get<Dashboard>('/dashboard', { from, to }); }
  users() { return this.get<User[]>('/users'); }
  saveUser(u: { name: string; role: UserRole; active: boolean; pin?: string | null }, id?: number) {
    return id ? this.put<User>(`/users/${id}`, u) : this.post<User>('/users', u);
  }
  paymentSettings() { return this.get<PaymentSettings>('/settings/payments'); }
}
