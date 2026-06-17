# Rivo

Rivo es una app **frontend** para gestionar deudas entre amigos con flujos de
confirmacion y transferencias. No es un sistema de balances: cada deuda es una
solicitud explicita entre usuarios (pendiente → aceptada/rechazada → pagada),
y una deuda se puede transferir en cadena (B le debe a A, A le debe a C ⇒ B le
debe a C).

**Supabase es el backend.** No hay servidor propio: el frontend habla directo
con Supabase (PostgreSQL + Auth), la seguridad la imponen las politicas de
**Row Level Security**, y la logica que debe ser atomica o privilegiada vive en
funciones de Postgres (RPC).

## Stack

- React + Vite + TypeScript
- TailwindCSS (modo claro/oscuro)
- React Router
- Supabase (PostgreSQL, Auth, RLS, funciones RPC)

## Configuracion

1. Copia las variables de entorno y rellena con tu proyecto de Supabase
   (Project Settings → API):
   ```bash
   cp .env.example .env
   ```
   Solo necesitas `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (claves
   publicas). El `service_role` **nunca** va en el frontend.

2. En el SQL Editor de Supabase ejecuta las migraciones en orden:
   - `supabase/migrations/0001_init.sql` — esquema, RLS, triggers y funciones
     (`accept_debt`, `reject_debt`, `settle_debt`, `transfer_debt`,
     `accept_invitation`, `decline_invitation`).
   - `supabase/migrations/0003_invite_and_defaults.sql` — defaults de
     `created_by` y la funcion `invite_to_group` (invitar por email/username).
   - `supabase/migrations/0002_seed.sql` — datos de ejemplo (opcional; primero
     crea en Auth los usuarios `demo1@rivo.app`, `demo2@rivo.app`,
     `demo3@rivo.app`).

3. Habilita en Supabase el proveedor de Auth **Email/Password**.

## Desarrollo

```bash
npm install
npm run dev
```

La app queda en `http://localhost:5173`.

## Scripts

- `npm run dev` — servidor de desarrollo (Vite)
- `npm run build` — typecheck + build de produccion
- `npm run preview` — sirve el build de produccion localmente
- `npm run typecheck` — solo verificacion de tipos

## Estructura

```
src/
  components/   UI reutilizable (Badge, Button, Input, Modal, ...)
  hooks/        useAuth
  lib/          supabaseClient, capa de datos (api.ts), tipos, formato
  pages/        Login, Onboarding, Dashboard, Group
  providers/    AuthProvider (sesion + perfil)
supabase/
  migrations/   esquema SQL, RLS, funciones y seed
```
