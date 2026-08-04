import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { saveBoardAttachment, toastError } = vi.hoisted(() => ({
  saveBoardAttachment: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../../../api/board/attachment.api', () => ({ saveBoardAttachment }))
vi.mock('@git-manager/ui', async () => {
  const actual = await vi.importActual<typeof import('@git-manager/ui')>('@git-manager/ui')
  return { ...actual, toast: { ...actual.toast, error: toastError } }
})

import { AttachmentTextarea } from './AttachmentTextarea'

function file(name: string, type = 'image/png') {
  return new File(['bytes'], name, { type })
}

/** jsdom's paste/drop events carry no `files`, so the transfer object is supplied explicitly. */
function transferWith(files: File[]) {
  return { files, types: files.length > 0 ? ['Files'] : [], getData: () => '' }
}

function renderTextarea(props: Partial<React.ComponentProps<typeof AttachmentTextarea>> = {}) {
  const onChange = vi.fn()
  const { rerender } = render(
    <AttachmentTextarea
      value=""
      onChange={onChange}
      repoPath="/repo"
      data-testid="field"
      {...props}
    />
  )
  return { onChange, rerender }
}

beforeEach(() => {
  vi.clearAllMocks()
  saveBoardAttachment.mockResolvedValue('.git-manager/attachments/abc123.png')
})

describe('AttachmentTextarea', () => {
  it('edits like a normal textarea', async () => {
    const user = userEvent.setup()
    const { onChange } = renderTextarea()
    await user.type(screen.getByTestId('field'), 'x')
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('saves a pasted image and inserts its markdown', async () => {
    const { onChange } = renderTextarea()
    fireEvent.paste(screen.getByTestId('field'), {
      clipboardData: transferWith([file('screenshot.png')]),
    })

    await waitFor(() => expect(saveBoardAttachment).toHaveBeenCalled())
    expect(saveBoardAttachment).toHaveBeenCalledWith('/repo', 'screenshot.png', expect.any(Array))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('![screenshot](.git-manager/attachments/abc123.png)')
    )
  })

  it('leaves a plain text paste alone', () => {
    const { onChange } = renderTextarea()
    fireEvent.paste(screen.getByTestId('field'), { clipboardData: transferWith([]) })
    expect(saveBoardAttachment).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('saves a dropped file too', async () => {
    renderTextarea()
    fireEvent.drop(screen.getByTestId('field'), { dataTransfer: transferWith([file('shot.png')]) })
    await waitFor(() => expect(saveBoardAttachment).toHaveBeenCalledWith(
      '/repo',
      'shot.png',
      expect.any(Array)
    ))
  })

  it('embeds a dropped video as a video element, not an image', async () => {
    saveBoardAttachment.mockResolvedValue('.git-manager/attachments/xyz.mp4')
    const { onChange } = renderTextarea()
    fireEvent.drop(screen.getByTestId('field'), {
      dataTransfer: transferWith([file('demo.mp4', 'video/mp4')]),
    })
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        '<video src=".git-manager/attachments/xyz.mp4" controls></video>'
      )
    )
  })

  it('writes an absolute raw URL for a GitHub-backed board', async () => {
    const { onChange } = renderTextarea({
      attachmentUrlPrefix: 'https://raw.githubusercontent.com/o/r/main',
    })
    fireEvent.paste(screen.getByTestId('field'), {
      clipboardData: transferWith([file('shot.png')]),
    })
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        '![shot](https://raw.githubusercontent.com/o/r/main/.git-manager/attachments/abc123.png)'
      )
    )
  })

  it('warns that the file must be pushed when the board is shared', () => {
    renderTextarea({ attachmentUrlPrefix: 'https://raw.githubusercontent.com/o/r/main' })
    expect(
      screen.getByText('Paste or drop a file — commit and push it for teammates to see it')
    ).toBeInTheDocument()
  })

  it('surfaces the backend’s own message when a file is rejected', async () => {
    saveBoardAttachment.mockRejectedValue(new Error('attachment is larger than the 25 MB limit'))
    const { onChange } = renderTextarea()
    fireEvent.paste(screen.getByTestId('field'), {
      clipboardData: transferWith([file('huge.png')]),
    })

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('attachment is larger than the 25 MB limit')
    )
    expect(onChange).not.toHaveBeenCalled()
  })
})
