const appJson = require('./app.json')
const { existsSync } = require('fs')
const { join } = require('path')

const webAppUrl = String(process.env.EXPO_PUBLIC_WEB_APP_URL || '').trim()
const allowDevelopmentHttp = process.env.NODE_ENV !== 'production' && /^http:\/\//i.test(webAppUrl)
const localGoogleServicesFile = './google-services.json'
const googleServicesFile = String(process.env.GOOGLE_SERVICES_JSON || '').trim() ||
  (existsSync(join(__dirname, 'google-services.json')) ? localGoogleServicesFile : '')

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      ...(allowDevelopmentHttp ? { usesCleartextTraffic: true } : {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  },
}
