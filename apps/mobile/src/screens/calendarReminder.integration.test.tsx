import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '../test/renderWithProviders'
import CalendarScreen from './CalendarScreen'
import { RemindersListScreen } from '../features/reminders/screens/RemindersListScreen'

test('Calendar sends the selected day as Create Task navigation params', async () => {
  const onCreateTask = jest.fn()
  const { getByLabelText } = await renderWithProviders(<CalendarScreen tasks={[]} reminders={[]} onBack={jest.fn()} onTask={jest.fn()} onReminder={jest.fn()} onCreateTask={onCreateTask} />)
  const create = getByLabelText(/Create task for /)
  fireEvent.press(create)
  expect(onCreateTask).toHaveBeenCalledWith({ initialDueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), source: 'calendar' })
})

test('person reminder CTA opens the person creation flow', async () => {
  const onCreatePersonReminder = jest.fn()
  const { getByText, getByLabelText } = await renderWithProviders(<RemindersListScreen reminders={[]} onSelect={jest.fn()} onCreate={jest.fn()} onToggle={jest.fn()} onCreatePersonReminder={onCreatePersonReminder} />)
  fireEvent.press(getByText('People'))
  await waitFor(() => expect(getByLabelText('Create Person Reminder')).toBeTruthy())
  fireEvent.press(getByLabelText('Create Person Reminder'))
  expect(onCreatePersonReminder).toHaveBeenCalledTimes(1)
})
