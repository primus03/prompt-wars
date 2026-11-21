# CareConnect – Rural Telemedicine & Health Monitoring Hub

Team **Do Bronxs** · PromptWars · Healthcare track

CareConnect helps ASHA workers and rural patients get a doctor's attention even on weak networks.

## Features
- Scan a handwritten prescription (Tesseract.js OCR) and edit the extracted text
- Verification engine: extracts vitals and medicines, flags missing registration/date, implausible vitals and duplicate medicines
- Automatic triage: Urgent / Review / Routine
- Voice-first symptom notes in Hindi, English, Bengali, Marathi, Tamil, Telugu (Web Speech API)
- Compressed case payload (target under 10 KB)
- Offline queue: cases are stored on the device and sync when the connection returns
- Asynchronous doctor portal with advice and a WhatsApp share link

## Run locally
Open `index.html` in Chrome or Edge. No build step is needed.

## Live demo (GitHub Pages)
Repo **Settings → Pages → Deploy from a branch → main / (root)**.
Your site will be at `https://<your-username>.github.io/<repo-name>/`.

## Notes
- This demo stores data in the browser (`localStorage`). The planned Node.js/Express + MongoDB backend and Twilio/WhatsApp Business API are future work.
- OCR needs an internet connection to load its language data.
- Voice capture works best in Chrome.

## Structure
```
index.html   page layout
style.css    styling (light and dark mode)
app.js       OCR, verification, triage, voice, offline queue, doctor portal
```
