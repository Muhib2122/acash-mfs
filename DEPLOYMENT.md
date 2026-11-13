# Acash — GitHub & Vercel Deployment Guide

Acash supports **two completely separate portal websites** from a single GitHub repository:

1. **Unified Customer, Agent & Merchant Website** (`index.html` / `/`)
2. **Admin Command Console Website** (`admin.html` / `/admin`)

---

## Option A: Two Separate Domains on Vercel (Recommended)

Import the **same GitHub repository** into **two separate Vercel projects**:

### 1. Customer, Agent & Merchant Website (Vercel Project 1)
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_PORTAL_MODE` = `unified`
  - `VITE_ADMIN_PORTAL_URL` = `https://your-admin-domain.vercel.app` *(optional: omit if you want zero Admin links shown on the public site)*
  - `VITE_MOBILE_APK_URL` = *(optional: direct download link if you later host a packaged Android `.apk` file)*

### 2. Separate Admin Website (Vercel Project 2)
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_PORTAL_MODE` = `admin`
  - `VITE_USER_PORTAL_URL` = `https://your-portal-domain.vercel.app` *(optional)*

---

## Option B: Single Vercel Project with Two Addresses (`/` and `/admin`)

Deploy once with default environment variables (`VITE_PORTAL_MODE=auto` or unset). `vercel.json` automatically routes:
- `https://your-domain.vercel.app/` → Customer, Agent & Merchant Website
- `https://your-domain.vercel.app/admin` → Separate Admin Command Website

---

## Required Firebase Auth Step After Vercel Deploy

For **Google Sign-In** to work on your live Vercel URLs:
1. Open **Firebase Console → Authentication → Settings → Authorized domains**.
2. Click **Add domain** and add **both** live Vercel domains (e.g., `acash-portal.vercel.app` and `acash-admin.vercel.app`).
