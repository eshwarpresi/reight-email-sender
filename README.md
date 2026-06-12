# Freight Email Sender - Bulk Email Management System

A production-ready bulk email sender application for freight forwarding companies to send personalized emails to 100+ agents worldwide.

## Features

- 🔐 Secure JWT Authentication
- 📧 Individual email sending (no BCC - each recipient gets separate email)
- 📎 File attachments support
- 👥 Contact management with groups
- 📊 Real-time sending progress
- 🔄 Retry mechanism for failed emails
- 📈 Analytics and reporting
- 📑 Excel/CSV export
- ⚡ Rate limiting and queue system
- 🚀 Production-ready deployment

## Tech Stack

### Backend
- Node.js + Express.js
- SQLite database
- JWT authentication
- Nodemailer (Brevo SMTP)
- Winston logging

### Frontend
- React 18
- Material UI (MUI)
- Vite
- React Query
- Recharts for analytics

## Prerequisites

- Node.js 18+ or Docker
- npm or yarn
- Brevo (formerly Sendinblue) account for SMTP

## Quick Start

### Using Docker (Recommended)

1. Clone the repository:
```bash
git clone <your-repo-url>
cd freight-email-sender
