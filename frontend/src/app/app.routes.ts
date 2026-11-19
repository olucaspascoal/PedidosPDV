import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pdv' },
  { path: 'entrar', canActivate: [guestGuard], loadComponent: () => import('./features/login/login.page').then(m => m.LoginPage) },
  {
    path: 'pdv',
    canActivate: [authGuard],
    loadComponent: () => import('./features/pos/pos-shell').then(m => m.PosShell),
    children: [
      { path: '', title: 'Vender', loadComponent: () => import('./features/pos/catalog.page').then(m => m.CatalogPage) },
      { path: 'pedido', title: 'Pedido', loadComponent: () => import('./features/pos/cart.page').then(m => m.CartPage) },
      { path: 'comandas', title: 'Comandas', loadComponent: () => import('./features/pos/tabs.page').then(m => m.TabsPage) },
      { path: 'comandas/:id', title: 'Comanda', loadComponent: () => import('./features/pos/order.page').then(m => m.OrderPage) },
      { path: 'pagar/:id', title: 'Pagamento', loadComponent: () => import('./features/pos/checkout.page').then(m => m.CheckoutPage) },
    ],
  },
  {
    path: 'gestao',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-shell').then(m => m.AdminShell),
    children: [
      { path: '', title: 'Visão geral', loadComponent: () => import('./features/admin/dashboard.page').then(m => m.DashboardPage) },
      { path: 'vendas', title: 'Vendas', loadComponent: () => import('./features/admin/sales.page').then(m => m.SalesPage) },
      { path: 'produtos', title: 'Produtos', loadComponent: () => import('./features/admin/products.page').then(m => m.ProductsPage) },
      { path: 'categorias', title: 'Categorias', loadComponent: () => import('./features/admin/categories.page').then(m => m.CategoriesPage) },
      { path: 'usuarios', title: 'Usuários', loadComponent: () => import('./features/admin/users.page').then(m => m.UsersPage) },
      { path: 'configuracoes', title: 'Configurações', loadComponent: () => import('./features/admin/settings.page').then(m => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: 'pdv' },
];
