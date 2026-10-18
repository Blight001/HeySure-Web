import { describe, expect, it } from 'vitest'
import type { ChatAttachment } from '@/api/chat'
import {
  chatResourceKind,
  chatResourcesFromText,
  resourceFromChatAttachment,
} from '../chatResources'

describe('chat resource normalization', () => {
  it('prefers the stable resource URL over the legacy download URL', () => {
    const attachment: ChatAttachment = {
      file_ref: 'file_image',
      workspace_path: 'Uploads/reference.png',
      file_name: 'reference.png',
      mime_type: 'image/png',
      bytes: 12,
      is_image: true,
      resource_url: '/api/chat/resources/10/token',
      preview_url: '/api/chat/resources/10/token',
      download_url: '/api/chat/attachments/10/token',
    }

    expect(resourceFromChatAttachment(attachment)).toMatchObject({
      url: '/api/chat/resources/10/token',
      kind: 'image',
      name: 'reference.png',
    })
  })

  it('classifies every supported server MIME kind without relying on a filename', () => {
    expect(chatResourceKind('/api/chat/resources/1/token', 'asset', 'application/pdf')).toBe('pdf')
    expect(chatResourceKind('/api/chat/resources/2/token', 'asset', 'video/mp4')).toBe('video')
    expect(chatResourceKind('/api/chat/resources/3/token', 'asset', 'audio/mpeg')).toBe('audio')
    expect(chatResourceKind('/api/chat/resources/4/token', 'asset', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document')
    expect(chatResourceKind('/api/chat/resources/5/token', 'asset', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet')
    expect(chatResourceKind('/api/chat/resources/6/token', 'asset', 'text/plain')).toBe('text')
  })

  it('extracts canonical prompt and asset resources from one MCP result', () => {
    const text = [
      '工具：canvas_asset_list',
      '[结果]',
      JSON.stringify({
        items: [{ url: '/assets/library/local-preview.png' }],
        resources: [
          {
            resource_url: '/api/chat/resources/1/token',
            file_name: 'example.jpg',
            mime_type: 'image/jpeg',
            bytes: 20,
          },
          {
            resource_url: '/api/chat/resources/2/token',
            file_name: 'guide.pdf',
            mime_type: 'application/pdf',
            bytes: 30,
          },
          {
            resource_url: '/api/chat/resources/3/token',
            file_name: 'demo.mp4',
            mime_type: 'video/mp4',
            bytes: 40,
          },
        ],
      }),
    ].join('\n')

    expect(chatResourcesFromText(text)).toMatchObject([
      { url: '/api/chat/resources/1/token', kind: 'image' },
      { url: '/api/chat/resources/2/token', kind: 'pdf' },
      { url: '/api/chat/resources/3/token', kind: 'video' },
    ])
  })
})
