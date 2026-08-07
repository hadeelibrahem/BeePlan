# Mobile Personal Whiteboard

The mobile app uses the existing BeePlan web Whiteboard editor inside
`react-native-webview`. There is no supported native React Native tldraw
renderer in this repository; embedding the production web editor keeps tldraw,
asset hydration, task previews, autosave, permissions, and Socket.IO on one
implementation instead of creating a second protocol.

## Configuration

Set `EXPO_PUBLIC_WEB_APP_URL` to the reachable BeePlan web origin (for example
`http://192.168.1.20:5173` during LAN development). The API URL remains
`EXPO_PUBLIC_API_URL` and must also be reachable from the device.

The editor waits for `BEEPLAN_WEBVIEW_READY`, then sends the current session
through the WebView message bridge. The web app validates and installs it in
the existing `beeplan_auth_session` store. Tokens are not placed in the editor
URL or written to logs.

## Reusable mobile architecture

- `RootNavigator` and the existing More sheet provide the Whiteboards entry.
- `api/whiteboardApi.ts` uses the mobile `apiFetch` wrapper and the same HTTP
  endpoints as web.
- `WhiteboardsDashboardScreen` owns board search, personal/shared sections,
  creation, duplication, deletion, and pending invitation actions.
- `WhiteboardShareScreen` uses friend username candidate and membership APIs.
- `WhiteboardEditorScreen` owns mobile chrome and delegates canvas behavior to
  the shared web editor.

## Device limitation

This workspace does not include a connected Android or iOS device. A real
device run still needs to verify the LAN web/API URLs, WebView native build,
touch behavior, camera safe areas, RTL, and Socket.IO reconnect behavior.
