#!/usr/bin/env node
// Generates local-test.html by injecting .env secrets into index.html
// Run: node dev.js  (then open local-test.html with Live Server)

const fs = require('fs')
const path = require('path')

require('dotenv').config()

const replacements = {
  '__ANTHROPIC_API_KEY__': process.env.ANTHROPIC_API_KEY || '',
  '__ICAL_URL__':          process.env.AIRBNB_ICAL_URL   || '',
  '__ICAL_URL_2__':        process.env.AIRBNB_ICAL_URL_2 || '',
  '__TELEGRAM_BOT_TOKEN__': process.env.TELEGRAM_BOT_TOKEN || '',
  '__TELEGRAM_CHAT_ID__':  process.env.TELEGRAM_CHAT_ID  || '',
  '__GH_DISPATCH_PAT__':   process.env.GH_DISPATCH_PAT   || '',
}

const src = path.join(__dirname, 'index.html')
let html = fs.readFileSync(src, 'utf8')

const missing = []
for (const [placeholder, value] of Object.entries(replacements)) {
  if (html.includes(placeholder)) {
    if (!value) missing.push(placeholder)
    html = html.replaceAll(placeholder, value)
  }
}

fs.writeFileSync(path.join(__dirname, 'local-test.html'), html)

if (missing.length) {
  console.warn('⚠  Missing in .env:', missing.join(', '))
} else {
  console.log('✓  local-test.html generated')
}
console.log('   Open with Live Server: 127.0.0.1:5500/local-test.html')
