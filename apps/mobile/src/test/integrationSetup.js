jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react')
  const { View } = require('react-native')
  return { SafeAreaProvider: ({ children }) => children, SafeAreaView: ({ children, ...props }) => mockReact.createElement(View, props, children), useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }))
