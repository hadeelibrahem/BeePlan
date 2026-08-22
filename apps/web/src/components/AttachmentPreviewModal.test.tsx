import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n/LanguageContext'
import AttachmentPreviewModal from './AttachmentPreviewModal'

vi.mock('../lib/tasksApi', () => ({
  getAttachmentPreviewBlob: vi.fn(() => new Promise(() => undefined)),
  downloadAttachment: vi.fn(),
}))

describe('AttachmentPreviewModal Arabic chrome', () => {
  it('renders localized loading and action controls', () => {
    window.localStorage.setItem('beeplan.language-preference', 'ar')
    render(
      <LanguageProvider>
        <AttachmentPreviewModal
          open
          accessToken="token"
          taskId="task-1"
          attachment={{ id: 'attachment-1', fileName: 'report.pdf', fileType: 'application/pdf' } as never}
          onClose={() => undefined}
        />
      </LanguageProvider>,
    )

    expect(screen.getByRole('button', { name: 'تنزيل' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إغلاق المعاينة' })).toBeInTheDocument()
    expect(screen.getByText('جارٍ تحميل المعاينة...')).toBeInTheDocument()
  })
})
