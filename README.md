🚀 Nano Aakriti

<p align="center">
  <img src="./public/logo.png" alt="Nano Aakriti" width="180" />
</p>

<p align="center">
  <strong>Premium 3D Models & Personalized Figurine Requests</strong><br />
  A modern React + Supabase platform for 3D-printable products, custom figurine requests, customer support, and admin management.
</p>

<p align="center">
  🌐 <a href="https://nano-site-ashy.vercel.app/">Live Demo</a>
  &nbsp; • &nbsp;
  💻 <a href="https://github.com/pankajsw-ami/nano-site">GitHub Repository</a>
</p>

✨ Overview

Nano Aakriti is a full-stack web platform built around a 3D-printing storefront and personalized figurine request workflow.

The project combines a customer-facing React storefront with Supabase-powered backend capabilities for:

🛍️ Product catalog and shopping cart

🎨 Product color variants and variant images

📦 Stock / inventory management

🧍 Custom figurine photo uploads

📏 Admin-controlled figurine sizes and pricing

💬 Customer ↔ Admin realtime chat

📎 Secure file and image sharing

🔔 Customer message notifications

🔐 Supabase Auth, Row Level Security (RLS), and Storage policies

⚡ Supabase Realtime updates

🚀 Vercel deployment

🧩 Key Features

🛒 Product Storefront

Product listing with live Supabase data

Product details modal

Color variants with separate images

Stock-aware cart quantity limits

Add / remove products from cart

Responsive customer experience

🧍 Custom Figurine Workflow

Customer uploads a personal photo

Customer selects an available figurine size

Price is controlled by the admin through Supabase

Request is submitted securely to the backend

Admin can review customer requests and uploaded photos

Admin can update request status

Customer can see the updated request status

Admin can preview and download submitted photos

💬 Realtime Chat

Customer and admin conversations

Product-specific enquiries

Realtime message updates

Conversation management

File/image attachments

Customer/admin access controls

Unread/read state handling

🔐 Security & Data Integrity

Supabase Row Level Security (RLS)

Admin-only product mutations

Private figurine request photo storage

Signed access for protected customer uploads

Server-side figurine request validation

Customer ownership checks

Admin authorization using existing project policies

🛠️ Tech Stack

Frontend

⚛️ React.js

🟨 JavaScript (ES6+)

🎨 CSS

📱 Responsive UI

Backend / Cloud

⚡ Supabase

🐘 PostgreSQL

🔑 Supabase Auth

🗄️ Supabase Storage

📡 Supabase Realtime

☁️ Vercel

Development

🔧 Git

🐙 GitHub

🤖 Codex

🧠 AI coding agents

🔌 MCP

🔍 AI-assisted debugging, code review, and verification

🏗️ Architecture

┌───────────────────────────────┐
│        React Frontend         │
│  Storefront • Cart • Chat     │
│  Figurine Request • Admin UI  │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│          Supabase             │
│  PostgreSQL • Auth • Storage  │
│        • Realtime             │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│            Vercel             │
│        Production Hosting     │
└───────────────────────────────┘

🚀 Getting Started

1. Clone the repository

git clone https://github.com/pankajsw-ami/nano-site.git
cd nano-site

2. Install dependencies

npm install

3. Configure environment variables

Create a .env file in the project root:

REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

⚠️ Never commit .env or any service-role secret to GitHub.

4. Start the development server

npm start

5. Create a production build

npm run build

🗃️ Supabase

Database changes are tracked in:

supabase/migrations/

The project uses migrations for features such as:

💬 Chat and realtime messaging

📦 Product stock quantity

🎨 Product variants

🧍 Figurine sizes and requests

📧 Admin email notifications

🔐 RLS and Storage policies

✅ Figurine request validation

Apply migrations to the target Supabase project before using features that depend on newly introduced database objects.

🧪 Verification & QA

The project follows a verification-first workflow:

✅ npm run build

✅ Customer/admin flow testing

✅ Supabase policy verification

✅ RLS and Storage access checks

✅ Realtime flow testing

✅ Mobile/responsive testing

✅ AI-generated code review and debugging before shipping

AI output is reviewed, tested, debugged, and modified manually before being considered production-ready.

📁 Project Structure

nano-site/
├── public/
│   ├── logo.png
│   └── ...
├── src/
│   ├── components/
│   │   └── chat/
│   ├── lib/
│   ├── NanoAakriti.jsx
│   ├── App.js
│   └── ...
├── supabase/
│   ├── functions/
│   └── migrations/
├── .env.example
├── package.json
└── README.md

🌐 Live Deployment

Live application: https://nano-site-ashy.vercel.app/

The project is deployed on Vercel and connected to the GitHub repository for version-controlled deployments.

Typical deployment flow:

Local changes
   ↓
npm run build
   ↓
git add / commit
   ↓
git push origin master
   ↓
Vercel deployment
   ↓
Live website 🚀

🤖 AI-Assisted Development

Nano Aakriti was developed using a modern AI-assisted software workflow.

AI coding agents were used for:

🧩 Breaking large tasks into smaller implementation steps

🛠️ Code generation and refactoring

🐛 Debugging

🔐 Supabase RLS / Storage investigation

🧪 Build and verification workflows

🔎 Codebase review and QA

AI agents were used as development accelerators while implementation review, debugging, security checks, and final verification remained under developer control.

👨‍💻 Author

Pankaj Swami

Python Full Stack Developer • React.js • Supabase/PostgreSQL • AI-assisted Development

🔗 GitHub: https://github.com/pankajsw-ami

🌐 Live Project: https://nano-site-ashy.vercel.app/

📌 Status

🟢 Deployed & actively developed

Additional product/content improvements can be shipped through the existing GitHub → Vercel deployment workflow.