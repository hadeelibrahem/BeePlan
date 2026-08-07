const appJson = require('./app.json')

const webAppUrl = String(process.env.EXPO_PUBLIC_WEB_APP_URL || '').trim()
const allowDevelopmentHttp = process.env.NODE_ENV !== 'production' && /^http:\/\//i.test(webAppUrl)

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      ...(allowDevelopmentHttp ? { usesCleartextTraffic: true } : {}),
    },
  },
}
