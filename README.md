# Jill Clips — Video Upload Portal

A mobile-first website where anyone can tap a button and upload a video clip
directly to your Google Drive folder.

---

## One-Time Setup (5 steps)

### 1. Create a Google Cloud Service Account

1. Go to <https://console.cloud.google.com/>
2. Create a new project (e.g. `jill-clips`) or select an existing one.
3. In the left menu go to **APIs & Services → Library** and enable
   **Google Drive API**.
4. Go to **APIs & Services → Credentials → Create Credentials → Service account**.
5. Give it any name (e.g. `jill-clips-uploader`) and click **Done**.
6. Click the service account you just created, open the **Keys** tab,
   click **Add Key → Create new key → JSON**.
7. Save the downloaded file as `credentials.json` in this project folder.

### 2. Share your Drive folder with the service account

1. Open the `credentials.json` file and copy the `client_email` value
   (looks like `jill-clips-uploader@your-project.iam.gserviceaccount.com`).
2. Go to your Google Drive folder:
   <https://drive.google.com/drive/u/0/folders/1Kp78N86XdJx2A0WdGdedahrTlkPppLU8>
3. Right-click the folder → **Share**, paste that email, set role to
   **Editor**, and click **Send**.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` — the defaults should work as-is if `credentials.json` is in the
project root.

### 4. Install dependencies

```bash
npm install
```

### 5. Start the server

```bash
npm start
```

Open <http://localhost:3000> in your browser — or share your network IP with
mobile users (e.g. `http://192.168.1.X:3000`).

---

## Running in Development (auto-restart)

```bash
npm run dev
```

---

## Deploying to the Internet

You can host this on any Node.js platform (Railway, Render, Fly.io, Heroku,
etc.).  Instead of uploading `credentials.json`, set the
`GOOGLE_CREDENTIALS_JSON` environment variable to the full JSON content of the
credentials file (as a single line).

---

## File Limits

| Setting | Value |
|---------|-------|
| Max file size | 2 GB |
| Accepted formats | MP4, MOV, AVI, MKV, WEBM, 3GP, M4V, WMV, and more |

---

## Project Structure

```
jill_clips/
├── public/
│   └── index.html   ← Mobile-friendly frontend (all CSS + JS inline)
├── uploads/         ← Temporary files (auto-deleted after Drive upload)
├── server.js        ← Express server + Google Drive upload logic
├── package.json
├── credentials.json ← Your service account key (DO NOT commit this!)
├── .env             ← Local config (DO NOT commit this!)
├── .env.example     ← Template for .env
└── .gitignore
```
